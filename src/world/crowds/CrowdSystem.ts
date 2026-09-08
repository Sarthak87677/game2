/**
 * Crowds: up to MAX_PEDESTRIANS pooled billboard pedestrians simulated within FULL_RADIUS_M of the player (or the
 * camera when not embodied and low enough). They walk along a virtual pavement of loaded OSM roads, wander around
 * hotspot anchors where there are no roads, gather in small groups at procedural stalls and entrances, step aside for
 * the player, keep off the carriageway (vehicles), and thin out at night and in rain. Beyond the simulation radius the
 * population is only estimated. Registered as the `crowds` gameplay system.
 */
import { BillboardCollection, Cartesian3, Cartographic, NearFarScalar, VerticalOrigin, type Billboard } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem } from '@/gameplay/types';
import { CROWD_HOTSPOTS } from '@/data/maharashtra/living';
import { useTerraStore } from '@/state/store';
import { fnv1a, Rng } from '@/util/hash';
import { enuOffsetM, offsetToLonLat } from '@/util/geo';
import { estimatedPopulation, localSolarHour, targetPedestrians, weatherCrowdFactor } from './density';
import { VARIANTS_PER_PALETTE, type PaletteId } from './palettes';
import { classifyPlace, groundFallback, type PlaceContext } from './placeContext';
import { PedestrianSprites, STAND_FRAME, WALK_FRAMES, type SpriteSet } from './sprites';
import { WalkNetwork, type LatLon, type WalkSegment } from './paths';
import { StallLayer, type StallSpot } from './Stalls';
import { LivingAmbience } from './ambience';

export const MAX_PEDESTRIANS = 120;
export const FULL_RADIUS_M = 300;
const DESPAWN_M = 340;
const ANIM_RADIUS_M = 160;
const MANAGE_MS = 500;
const CONTEXT_MS = 3000;
const FESTIVAL_KEY = 'terra-infinite.festival-lights.v1';

type Mode = 'walk' | 'wander' | 'linger';

interface Ped {
  bb: Billboard;
  active: boolean;
  lat: number;
  lon: number;
  h: number;
  hAt: number;
  mode: Mode;
  seg: WalkSegment | null;
  t: number;
  dir: 1 | -1;
  side: 1 | -1;
  target: LatLon | null;
  lingerUntil: number;
  speed: number;
  sprite: SpriteSet | null;
  frame: number;
  animT: number;
  palette: PaletteId;
  variant: number;
}

const scratchCarto = new Cartographic();
const scratchPos = new Cartesian3();
const scratchLL: LatLon = { lat: 0, lon: 0 };

export class CrowdSystem implements GameplaySystem {
  readonly id = 'crowds';
  readonly label = 'Crowds';
  private readonly pool: Ped[] = [];
  private readonly collection: BillboardCollection;
  private readonly sprites = new PedestrianSprites();
  private readonly network = new WalkNetwork();
  private readonly stalls: StallLayer;
  private readonly ambience = new LivingAmbience();
  private readonly rng = new Rng(fnv1a('crowds'));
  private lastManage = 0;
  private lastContext = 0;
  private lastNetworkSync = 0;
  private context: PlaceContext | null = null;
  private active = 0;
  private target = 0;
  private estimate = 0;
  private localHour = 12;
  private nearbySegs: WalkSegment[] = [];
  private nearbySpots: StallSpot[] = [];
  private neighbourScratch: WalkSegment[] = [];
  private justSpawned = false;
  private fallbackH = 0;
  enabled = true;

  constructor(private readonly engine: TerraEngine) {
    const scene = engine.viewer.scene;
    this.collection = scene.primitives.add(new BillboardCollection({ scene }));
    this.stalls = new StallLayer(scene);
    try { this.stalls.setFestivalLights(localStorage.getItem(FESTIVAL_KEY) === 'on'); } catch { /* ignore */ }
    for (let i = 0; i < MAX_PEDESTRIANS; i++) {
      const bb = this.collection.add({ position: Cartesian3.ZERO, show: false, verticalOrigin: VerticalOrigin.BOTTOM, sizeInMeters: true, width: 0.85, height: 1.7, translucencyByDistance: new NearFarScalar(FULL_RADIUS_M * 0.8, 1, DESPAWN_M, 0) });
      this.pool.push({ bb, active: false, lat: 0, lon: 0, h: 0, hAt: 0, mode: 'wander', seg: null, t: 0, dir: 1, side: 1, target: null, lingerUntil: 0, speed: 1.2, sprite: null, frame: STAND_FRAME, animT: 0, palette: 'city', variant: 0 });
    }
  }

  /** Festival string lights on stalls and around hotspot anchors (respectful, generic colours). */
  setFestivalLights(on: boolean): void {
    this.stalls.setFestivalLights(on);
    try { localStorage.setItem(FESTIVAL_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  }
  get festivalLights(): boolean { return this.stalls.festivalLights; }

  /** Current place classification (for the Activities tab and diagnostics). */
  place(): PlaceContext | null { return this.context; }

  onSpawn(): void {
    this.justSpawned = true;
    this.lastContext = 0;
    this.lastManage = 0;
  }

  update(ctx: GameplayContext): void {
    const now = ctx.nowMs;
    const p = ctx.player;
    // Simulation centre: the body when embodied, the camera when it is low enough, nothing otherwise.
    let centre: LatLon | null = null;
    if (p.embodied) centre = { lat: p.lat, lon: p.lon };
    else {
      const agl = this.engine.altitudeAboveGround() ?? p.heightM;
      if (agl < 700) centre = { lat: p.lat, lon: p.lon };
    }
    if (!this.enabled) centre = null;
    if (!centre) { if (this.active > 0) this.despawnAll(); return; }
    this.fallbackH = groundFallback(this.engine, p);
    if (now - this.lastContext > CONTEXT_MS || this.justSpawned) {
      this.lastContext = now;
      this.context = classifyPlace(this.engine, centre.lat, centre.lon);
      const date = this.engine.environment.getDate();
      this.localHour = localSolarHour(date, centre.lon);
      const weather = useTerraStore.getState().weather;
      const wf = weatherCrowdFactor(weather?.condition);
      this.target = targetPedestrians(this.context.kind, this.localHour, FULL_RADIUS_M, MAX_PEDESTRIANS, wf);
      this.estimate = estimatedPopulation(this.context.kind, this.localHour, 1000);
      this.stalls.sync(centre.lat, centre.lon, CROWD_HOTSPOTS, this.fallbackH);
      this.stalls.spotsNear(centre.lat, centre.lon, FULL_RADIUS_M, this.nearbySpots);
      const sun = this.engine.environment.sunElevationDeg(centre.lat, centre.lon);
      this.ambience.update({ kind: this.context.ambience, crowd: Math.min(1, this.active / 60), storm: weather?.condition === 'storm', rain: (weather?.precipitation ?? 0) > 0.1, night: sun < -6, templeNear: this.context.hotspot?.kind === 'temple', altitudeAglM: p.embodied ? 0 : (this.engine.altitudeAboveGround() ?? 0) }, this.engine.audio.isEnabled, now);
    }
    if (now - this.lastNetworkSync > 1500) {
      this.lastNetworkSync = now;
      this.network.sync(this.engine.osm?.loadedTiles ?? []);
      this.network.nearby(centre.lat, centre.lon, FULL_RADIUS_M, this.nearbySegs);
    }
    if (now - this.lastManage > MANAGE_MS || this.justSpawned) {
      this.lastManage = now;
      this.manage(centre, now);
      this.stalls.twinkle();
      this.justSpawned = false;
    }
    this.simulate(centre, ctx.dt, now, p.embodied);
  }

  private manage(centre: LatLon, now: number): void {
    // Despawn far pedestrians.
    for (const ped of this.pool) {
      if (!ped.active) continue;
      const o = enuOffsetM(centre.lat, centre.lon, ped.lat, ped.lon);
      if (o.east * o.east + o.north * o.north > DESPAWN_M * DESPAWN_M) this.deactivate(ped);
    }
    // Thin the crowd gradually when the target drops (nightfall, rain): retire the farthest pedestrians first.
    if (this.active > this.target + 4) {
      let farthest: Ped | null = null, farD = -1;
      for (const ped of this.pool) {
        if (!ped.active) continue;
        const o = enuOffsetM(centre.lat, centre.lon, ped.lat, ped.lon);
        const d = o.east * o.east + o.north * o.north;
        if (d > farD) { farD = d; farthest = ped; }
      }
      if (farthest) this.deactivate(farthest);
    }
    // Spawn up to the target (a few per tick so arrival is gradual, or all at once right after a spawn).
    let budget = this.justSpawned ? MAX_PEDESTRIANS : 6;
    for (const ped of this.pool) {
      if (this.active >= this.target || budget <= 0) break;
      if (ped.active) continue;
      if (this.activate(ped, centre, now)) budget--;
      else budget -= 2; // no valid place found this tick; try again later
    }
  }

  private activate(ped: Ped, centre: LatLon, now: number): boolean {
    const ctx = this.context;
    if (!ctx) return false;
    const rng = this.rng;
    const minDist = this.justSpawned ? 4 : 25;
    ped.mode = 'wander';
    ped.seg = null;
    ped.target = null;
    // 1) Groups at stalls: ~30% of arrivals linger at a counter when stalls are near.
    if (this.nearbySpots.length > 0 && rng.next() < 0.3) {
      const spot = rng.pick(this.nearbySpots);
      const jitter = 1.4;
      const ll = offsetToLonLat(spot.lat, spot.lon, rng.range(-jitter, jitter), rng.range(-jitter, jitter));
      ped.lat = ll.lat; ped.lon = ll.lon;
      ped.mode = 'linger';
      ped.lingerUntil = now + rng.range(8000, 40000);
    } else if (this.nearbySegs.length > 0 && rng.next() < 0.8) {
      // 2) Walking along the road network (pavement side chosen at random).
      let seg: WalkSegment | null = null;
      for (let tries = 0; tries < 6 && !seg; tries++) {
        const cand = rng.pick(this.nearbySegs);
        const t = rng.range(0, cand.length);
        this.network.positionAt(cand, t, 1, scratchLL);
        const o = enuOffsetM(centre.lat, centre.lon, scratchLL.lat, scratchLL.lon);
        const d2 = o.east * o.east + o.north * o.north;
        if (d2 < FULL_RADIUS_M * FULL_RADIUS_M && d2 > minDist * minDist) { seg = cand; ped.t = t; }
      }
      if (!seg) return false;
      ped.seg = seg;
      ped.dir = rng.next() < 0.5 ? 1 : -1;
      ped.side = rng.next() < 0.5 ? 1 : -1;
      ped.mode = 'walk';
      this.network.positionAt(seg, ped.t, ped.side, scratchLL);
      ped.lat = scratchLL.lat; ped.lon = scratchLL.lon;
    } else {
      // 3) Free wander around the hotspot anchor (or the player) when no roads are loaded.
      const anchor = ctx.hotspot ?? centre;
      const r = ctx.hotspot ? Math.min(ctx.hotspot.radiusM, FULL_RADIUS_M) : 120;
      let ok = false;
      for (let tries = 0; tries < 6 && !ok; tries++) {
        const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
        const ll = offsetToLonLat(anchor.lat, anchor.lon, Math.cos(a) * d, Math.sin(a) * d);
        const o = enuOffsetM(centre.lat, centre.lon, ll.lat, ll.lon);
        const d2 = o.east * o.east + o.north * o.north;
        if (d2 > FULL_RADIUS_M * FULL_RADIUS_M || d2 < minDist * minDist || this.blocked(ll.lat, ll.lon)) continue;
        ped.lat = ll.lat; ped.lon = ll.lon; ok = true;
      }
      if (!ok) return false;
      ped.mode = rng.next() < 0.25 ? 'linger' : 'wander';
      ped.lingerUntil = now + rng.range(5000, 25000);
      this.pickWanderTarget(ped, anchor, r);
    }
    ped.palette = ctx.palette;
    ped.variant = rng.int(VARIANTS_PER_PALETTE);
    ped.sprite = this.sprites.set(ped.palette, ped.variant);
    ped.speed = rng.range(0.9, 1.6);
    ped.frame = -1;
    ped.animT = rng.next();
    ped.h = this.groundAt(ped.lat, ped.lon) ?? this.fallbackH;
    ped.hAt = now + rng.range(0, 1000);
    this.setFrame(ped, ped.mode === 'linger' ? STAND_FRAME : 0);
    ped.bb.show = true;
    ped.active = true;
    this.active++;
    return true;
  }

  private pickWanderTarget(ped: Ped, anchor: LatLon, r: number): void {
    for (let tries = 0; tries < 5; tries++) {
      const a = this.rng.range(0, Math.PI * 2), d = 6 + this.rng.next() * Math.min(40, r);
      const ll = offsetToLonLat(ped.lat, ped.lon, Math.cos(a) * d, Math.sin(a) * d);
      const o = enuOffsetM(anchor.lat, anchor.lon, ll.lat, ll.lon);
      if (o.east * o.east + o.north * o.north > r * r || this.blocked(ll.lat, ll.lon)) continue;
      ped.target = { lat: ll.lat, lon: ll.lon };
      return;
    }
    ped.target = null;
    ped.mode = 'linger';
    ped.lingerUntil = performance.now() + 5000;
  }

  /** True when the point lies inside a building (OSM or procedural). */
  private blocked(lat: number, lon: number): boolean {
    const g = this.groundAt(lat, lon);
    const osmTop = this.engine.osm?.heightAt(lat, lon) ?? null;
    if (osmTop !== null && (g === null || osmTop > g + 1)) return true;
    const nfTop = this.engine.nearField?.heightAt(lat, lon) ?? null;
    return nfTop !== null && (g === null || nfTop > g + 1);
  }

  private groundAt(lat: number, lon: number): number | null {
    Cartographic.fromDegrees(lon, lat, 0, scratchCarto);
    const h = this.engine.viewer.scene.globe.getHeight(scratchCarto);
    return h === undefined ? null : h;
  }

  private simulate(centre: LatLon, dt: number, now: number, embodied: boolean): void {
    const rng = this.rng;
    const mLat = 111_132, mLon = 111_320 * Math.cos((centre.lat * Math.PI) / 180);
    for (const ped of this.pool) {
      if (!ped.active) continue;
      let moving = false;
      if (ped.mode === 'walk' && ped.seg) {
        ped.t += ped.speed * dt * ped.dir;
        if (ped.t >= ped.seg.length || ped.t <= 0) this.turn(ped);
        this.network.positionAt(ped.seg, ped.t, ped.side, scratchLL);
        ped.lat = scratchLL.lat; ped.lon = scratchLL.lon;
        moving = true;
        if (rng.next() < dt * 0.02) { ped.mode = 'linger'; ped.lingerUntil = now + rng.range(3000, 12000); }
      } else if (ped.mode === 'wander') {
        const tgt = ped.target;
        if (!tgt) this.pickWanderTarget(ped, this.context?.hotspot ?? centre, this.context?.hotspot?.radiusM ?? 120);
        else {
          const dx = (tgt.lon - ped.lon) * mLon, dy = (tgt.lat - ped.lat) * mLat;
          const d = Math.hypot(dx, dy);
          if (d < 0.8) { if (rng.next() < 0.4) { ped.mode = 'linger'; ped.lingerUntil = now + rng.range(4000, 20000); } else this.pickWanderTarget(ped, this.context?.hotspot ?? centre, this.context?.hotspot?.radiusM ?? 120); }
          else { const step = Math.min(d, ped.speed * dt); ped.lon += (dx / d) * step / mLon; ped.lat += (dy / d) * step / mLat; moving = true; }
        }
      } else if (now > ped.lingerUntil) {
        if (ped.seg) ped.mode = 'walk';
        else { ped.mode = 'wander'; this.pickWanderTarget(ped, this.context?.hotspot ?? centre, this.context?.hotspot?.radiusM ?? 120); }
      }
      // Step aside for the player.
      if (embodied) {
        const dx = (ped.lon - centre.lon) * mLon, dy = (ped.lat - centre.lat) * mLat;
        const d2 = dx * dx + dy * dy;
        if (d2 < 2.2 * 2.2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (2.2 - d) * dt * 2.5;
          ped.lon += (dx / d) * push / mLon; ped.lat += (dy / d) * push / mLat;
        }
      }
      // Ground height, refreshed about once a second (staggered).
      if (now > ped.hAt) {
        ped.hAt = now + 900 + rng.next() * 300;
        ped.h = this.groundAt(ped.lat, ped.lon) ?? this.fallbackH;
      }
      Cartesian3.fromDegrees(ped.lon, ped.lat, ped.h, undefined, scratchPos);
      ped.bb.position = scratchPos;
      // Walk animation (6 fps) for pedestrians close to the centre; others hold a frame.
      const ox = (ped.lon - centre.lon) * mLon, oy = (ped.lat - centre.lat) * mLat;
      if (moving && ox * ox + oy * oy < ANIM_RADIUS_M * ANIM_RADIUS_M) {
        ped.animT += dt * 6 * ped.speed;
        this.setFrame(ped, Math.floor(ped.animT) % WALK_FRAMES);
      } else if (!moving) this.setFrame(ped, STAND_FRAME);
    }
  }

  private turn(ped: Ped): void {
    const seg = ped.seg!;
    const atEnd = ped.dir === 1;
    const list = this.network.neighbours(seg, atEnd, this.neighbourScratch);
    if (list.length > 0 && this.rng.next() < 0.85) {
      const next = this.rng.pick(list);
      const endPt = atEnd ? seg.pts[seg.pts.length - 1] : seg.pts[0];
      const startsHere = WalkNetwork.startsAt(next, endPt);
      ped.seg = next;
      ped.t = startsHere ? 0 : next.length;
      ped.dir = startsHere ? 1 : -1;
      return;
    }
    ped.dir = ped.dir === 1 ? -1 : 1;
    ped.t = Math.max(0, Math.min(seg.length, ped.t));
  }

  private setFrame(ped: Ped, frame: number): void {
    if (frame === ped.frame || !ped.sprite) return;
    ped.frame = frame;
    ped.bb.setImage(ped.sprite.ids[frame], ped.sprite.canvases[frame]);
  }

  private deactivate(ped: Ped): void {
    ped.active = false;
    ped.bb.show = false;
    this.active--;
  }

  private despawnAll(): void {
    for (const ped of this.pool) if (ped.active) this.deactivate(ped);
  }

  stats(): Record<string, string | number> {
    const s = this.stalls.stats();
    return {
      pedestrians: this.active,
      target: this.target,
      pooled: MAX_PEDESTRIANS,
      place: this.context ? `${this.context.kind}${this.context.hotspot ? ` (${this.context.hotspot.name})` : ''}` : '—',
      localHour: Math.round(this.localHour * 10) / 10,
      estimated1km: this.estimate,
      walkSegments: this.nearbySegs.length,
      stalls: `${s.stalls} at ${s.hotspots} hotspots`,
      festivalLights: this.stalls.festivalLights ? `on (${s.lights})` : 'off',
      sprites: this.sprites.size,
      ...this.ambience.stats(),
    };
  }

  destroy(): void {
    this.despawnAll();
    this.engine.viewer.scene.primitives.remove(this.collection);
    this.stalls.destroy();
    this.ambience.destroy();
  }
}
