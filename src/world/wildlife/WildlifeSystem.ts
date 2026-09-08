/**
 * Wildlife: cattle and street dogs in villages and along roads, bird flocks (gulls over coasts, egrets over fields,
 * crows and pigeons in cities, small birds over forests and hills), butterflies in gardens, parks and the campus.
 * Everything is pooled billboards simulated only within FULL_RADIUS_M of the player/camera; nothing is spawned
 * beyond. Reports sightings for the nature-observation activity. Registered as the `wildlife` gameplay system.
 */
import { BillboardCollection, Cartesian3, Cartographic, NearFarScalar, VerticalOrigin, type Billboard } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem } from '@/gameplay/types';
import { useTerraStore } from '@/state/store';
import { fnv1a, Rng } from '@/util/hash';
import { enuOffsetM, offsetToLonLat } from '@/util/geo';
import { classifyPlace, groundFallback, type PlaceContext } from '@/world/crowds/placeContext';
import { advanceFlock, createFlock, memberPosition, type Flock } from './flocks';
import { AnimalSprites, ANIMAL_LABEL, type AnimalKind, type AnimalSprite } from './sprites';
import { reportSighting } from './sightings';

export const FULL_RADIUS_M = 300;
const POOL = { cattle: 8, dog: 6, bird: 60, butterfly: 16 } as const;
const CONTEXT_MS = 3000;
const scratchCarto = new Cartographic();
const scratchPos = new Cartesian3();
const scratchXYZ = { x: 0, y: 0, z: 0 };

interface Ground { bb: Billboard; active: boolean; kind: AnimalKind; lat: number; lon: number; h: number; hAt: number; target: { lat: number; lon: number } | null; restUntil: number; speed: number; sprite: AnimalSprite | null; frame: number; animT: number }
interface Flyer { bb: Billboard; sprite: AnimalSprite | null; frame: number; animT: number }
interface Butterfly { bb: Billboard; active: boolean; x: number; y: number; z: number; tx: number; ty: number; tz: number; sprite: AnimalSprite | null; frame: number; animT: number }
interface FlockState { kind: AnimalKind; flock: Flock; anchor: { lat: number; lon: number; h: number }; members: Flyer[] }

export class WildlifeSystem implements GameplaySystem {
  readonly id = 'wildlife';
  readonly label = 'Wildlife';
  private readonly collection: BillboardCollection;
  private readonly sprites = new AnimalSprites();
  private readonly rng = new Rng(fnv1a('wildlife'));
  private readonly ground: Ground[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly butterflies: Butterfly[] = [];
  private flocks: FlockState[] = [];
  private context: PlaceContext | null = null;
  private lastContext = 0;
  private lastSighting = 0;
  private centre: { lat: number; lon: number } | null = null;
  private butterflyAnchor: { lat: number; lon: number; h: number } | null = null;
  private wanted = { cattle: 0, dog: 0, butterflies: 0, flocks: [] as { kind: AnimalKind; count: number }[] };
  private justSpawned = false;
  private fallbackH = 0;
  enabled = true;

  constructor(private readonly engine: TerraEngine) {
    const scene = engine.viewer.scene;
    this.collection = scene.primitives.add(new BillboardCollection({ scene }));
    const mk = (w: number, h: number, origin = VerticalOrigin.BOTTOM) => this.collection.add({ position: Cartesian3.ZERO, show: false, verticalOrigin: origin, sizeInMeters: true, width: w, height: h, translucencyByDistance: new NearFarScalar(FULL_RADIUS_M * 0.8, 1, FULL_RADIUS_M * 1.2, 0) });
    for (let i = 0; i < POOL.cattle; i++) this.ground.push({ bb: mk(2.4, 1.6), active: false, kind: 'cattle', lat: 0, lon: 0, h: 0, hAt: 0, target: null, restUntil: 0, speed: 0.4, sprite: null, frame: -1, animT: 0 });
    for (let i = 0; i < POOL.dog; i++) this.ground.push({ bb: mk(1, 0.62), active: false, kind: 'dog', lat: 0, lon: 0, h: 0, hAt: 0, target: null, restUntil: 0, speed: 0.9, sprite: null, frame: -1, animT: 0 });
    for (let i = 0; i < POOL.bird; i++) this.flyers.push({ bb: mk(0.6, 0.5, VerticalOrigin.CENTER), sprite: null, frame: -1, animT: this.rng.next() });
    for (let i = 0; i < POOL.butterfly; i++) this.butterflies.push({ bb: mk(0.16, 0.14, VerticalOrigin.CENTER), active: false, x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, sprite: null, frame: -1, animT: this.rng.next() });
  }

  onSpawn(): void { this.justSpawned = true; this.lastContext = 0; }

  update(ctx: GameplayContext): void {
    const now = ctx.nowMs;
    const p = ctx.player;
    let centre: { lat: number; lon: number } | null = null;
    if (p.embodied) centre = { lat: p.lat, lon: p.lon };
    else if ((this.engine.altitudeAboveGround() ?? p.heightM) < 900) centre = { lat: p.lat, lon: p.lon };
    if (!this.enabled) centre = null;
    if (!centre) { this.centre = null; this.despawnAll(); return; }
    this.centre = centre;
    this.fallbackH = groundFallback(this.engine, p);
    if (now - this.lastContext > CONTEXT_MS || this.justSpawned) {
      this.lastContext = now;
      this.context = classifyPlace(this.engine, centre.lat, centre.lon);
      this.decide(this.context, centre);
      this.reconcile(centre, now);
      this.justSpawned = false;
    }
    this.simulate(centre, ctx.dt, now);
    if (now - this.lastSighting > 2000) { this.lastSighting = now; this.report(now); }
  }

  /** Decides which animals belong here from the place context, time of day and weather. */
  private decide(c: PlaceContext, centre: { lat: number; lon: number }): void {
    const sun = this.engine.environment.sunElevationDeg(centre.lat, centre.lon);
    const weather = useTerraStore.getState().weather;
    const storm = weather?.condition === 'storm';
    const day = sun > 0;
    const rural = c.kind === 'village' || c.kind === 'rural' || c.farmland;
    const urban = c.kind === 'urban' || c.kind === 'suburban' || c.kind === 'market' || c.kind === 'station' || c.kind === 'promenade' || c.kind === 'temple' || c.kind === 'monument';
    const flocks: { kind: AnimalKind; count: number }[] = [];
    if (!storm) {
      if (c.coastal) flocks.push({ kind: 'gull', count: 16 });
      if (rural || c.farmland) flocks.push({ kind: 'egret', count: 10 });
      if (urban || c.kind === 'campus') { flocks.push({ kind: 'crow', count: 12 }); if (day) flocks.push({ kind: 'pigeon', count: 14 }); }
      if ((c.forest || c.kind === 'none' || c.elevationM > 600) && flocks.length === 0) flocks.push({ kind: 'bird', count: 8 });
    }
    this.wanted = {
      cattle: rural ? (day ? 4 : 2) : c.kind === 'lake' || c.kind === 'fort' ? 1 : 0,
      dog: rural ? 2 : urban || c.kind === 'campus' || c.kind === 'beach' ? 1 : 0,
      butterflies: day && !storm && (c.park || c.forest || c.kind === 'village' || c.kind === 'campus' || c.kind === 'lake' || c.farmland) ? 10 : 0,
      flocks: flocks.slice(0, 3),
    };
  }

  private reconcile(centre: { lat: number; lon: number }, now: number): void {
    // Ground animals: despawn beyond the radius, then top up per kind.
    for (const g of this.ground) if (g.active) { const o = enuOffsetM(centre.lat, centre.lon, g.lat, g.lon); if (o.east * o.east + o.north * o.north > FULL_RADIUS_M * FULL_RADIUS_M * 1.3) this.deactivateGround(g); }
    for (const kind of ['cattle', 'dog'] as const) {
      const want = this.wanted[kind];
      let have = 0;
      for (const g of this.ground) if (g.active && g.kind === kind) have++;
      for (const g of this.ground) {
        if (have >= want) break;
        if (g.active || g.kind !== kind) continue;
        if (this.activateGround(g, centre, now)) have++;
      }
      for (const g of this.ground) { if (have <= want) break; if (g.active && g.kind === kind) { this.deactivateGround(g); have--; } }
    }
    // Flocks: rebuild when the wanted set changes.
    const wantedKey = this.wanted.flocks.map((f) => `${f.kind}:${f.count}`).join('|');
    const haveKey = this.flocks.map((f) => `${f.kind}:${f.members.length}`).join('|');
    if (wantedKey !== haveKey) {
      for (const f of this.flocks) for (const m of f.members) m.bb.show = false;
      this.flocks = [];
      let next = 0;
      for (const w of this.wanted.flocks) {
        const members: Flyer[] = [];
        for (let i = 0; i < w.count && next < this.flyers.length; i++) members.push(this.flyers[next++]);
        if (members.length === 0) break;
        const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(60, 140);
        const ll = offsetToLonLat(centre.lat, centre.lon, Math.cos(a) * d, Math.sin(a) * d);
        const h = this.groundAt(ll.lat, ll.lon) ?? this.fallbackH;
        const altitude = w.kind === 'pigeon' ? 12 : w.kind === 'gull' ? 18 : w.kind === 'egret' ? 14 : w.kind === 'crow' ? 16 : 25;
        const spread = w.kind === 'pigeon' ? 6 : 9;
        const speed = w.kind === 'pigeon' ? 9 : w.kind === 'egret' ? 6 : 8;
        const flock = createFlock(this.rng, members.length, spread, altitude, 70, speed);
        const sprite = this.sprites.get(w.kind);
        for (const m of members) { m.sprite = sprite; m.frame = -1; if (sprite) { m.bb.width = sprite.widthM; m.bb.height = sprite.heightM; } m.bb.show = true; }
        this.flocks.push({ kind: w.kind, flock, anchor: { lat: ll.lat, lon: ll.lon, h }, members });
      }
    }
    // Butterflies around a garden anchor near the player.
    const bWant = this.wanted.butterflies;
    let bHave = 0;
    for (const b of this.butterflies) if (b.active) bHave++;
    if (bWant > 0 && (!this.butterflyAnchor || enuDist(this.butterflyAnchor, centre) > 45)) {
      const ll = offsetToLonLat(centre.lat, centre.lon, this.rng.range(-12, 12), this.rng.range(-12, 12));
      this.butterflyAnchor = { lat: ll.lat, lon: ll.lon, h: this.groundAt(ll.lat, ll.lon) ?? this.fallbackH };
    }
    for (const b of this.butterflies) {
      if (bHave >= bWant) break;
      if (b.active) continue;
      b.active = true; bHave++;
      b.x = this.rng.range(-15, 15); b.y = this.rng.range(-15, 15); b.z = this.rng.range(0.4, 2.2);
      b.tx = b.x; b.ty = b.y; b.tz = b.z;
      b.sprite = this.sprites.get('butterfly', this.rng.int(5)); b.frame = -1;
      b.bb.show = true;
    }
    for (const b of this.butterflies) { if (bHave <= bWant) break; if (b.active) { b.active = false; b.bb.show = false; bHave--; } }
  }

  private activateGround(g: Ground, centre: { lat: number; lon: number }, now: number): boolean {
    for (let tries = 0; tries < 6; tries++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(g.kind === 'dog' ? 10 : 20, 140);
      const ll = offsetToLonLat(centre.lat, centre.lon, Math.cos(a) * d, Math.sin(a) * d);
      if (this.blocked(ll.lat, ll.lon)) continue;
      g.lat = ll.lat; g.lon = ll.lon;
      g.h = this.groundAt(ll.lat, ll.lon) ?? this.fallbackH;
      g.hAt = now + this.rng.range(0, 1000);
      g.sprite = this.sprites.get(g.kind, this.rng.int(5));
      g.frame = -1;
      g.target = null;
      g.restUntil = now + this.rng.range(2000, 15000);
      g.bb.show = true;
      g.active = true;
      this.setFrame(g, 0);
      return true;
    }
    return false;
  }

  private deactivateGround(g: Ground): void { g.active = false; g.bb.show = false; }

  private blocked(lat: number, lon: number): boolean {
    const g = this.groundAt(lat, lon);
    const osm = this.engine.osm?.heightAt(lat, lon) ?? null;
    if (osm !== null && (g === null || osm > g + 1)) return true;
    const nf = this.engine.nearField?.heightAt(lat, lon) ?? null;
    return nf !== null && (g === null || nf > g + 1);
  }

  private groundAt(lat: number, lon: number): number | null {
    Cartographic.fromDegrees(lon, lat, 0, scratchCarto);
    const h = this.engine.viewer.scene.globe.getHeight(scratchCarto);
    return h === undefined ? null : h;
  }

  private simulate(centre: { lat: number; lon: number }, dt: number, now: number): void {
    const mLat = 111_132, mLon = 111_320 * Math.cos((centre.lat * Math.PI) / 180);
    for (const g of this.ground) {
      if (!g.active) continue;
      let moving = false;
      if (now > g.restUntil) {
        if (!g.target) {
          const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(4, g.kind === 'dog' ? 30 : 18);
          const ll = offsetToLonLat(g.lat, g.lon, Math.cos(a) * d, Math.sin(a) * d);
          if (!this.blocked(ll.lat, ll.lon)) g.target = ll; else g.restUntil = now + 2000;
        } else {
          const dx = (g.target.lon - g.lon) * mLon, dy = (g.target.lat - g.lat) * mLat;
          const d = Math.hypot(dx, dy);
          if (d < 0.5) { g.target = null; g.restUntil = now + this.rng.range(3000, g.kind === 'cattle' ? 25000 : 10000); }
          else { const step = Math.min(d, g.speed * dt); g.lon += (dx / d) * step / mLon; g.lat += (dy / d) * step / mLat; moving = true; }
        }
      }
      // Keep clear of the player.
      const px = (g.lon - centre.lon) * mLon, py = (g.lat - centre.lat) * mLat;
      const pd2 = px * px + py * py;
      if (pd2 < 9 && pd2 > 0.001) { const pd = Math.sqrt(pd2); const push = (3 - pd) * dt * 1.5; g.lon += (px / pd) * push / mLon; g.lat += (py / pd) * push / mLat; }
      if (now > g.hAt) { g.hAt = now + 1000; g.h = this.groundAt(g.lat, g.lon) ?? this.fallbackH; }
      Cartesian3.fromDegrees(g.lon, g.lat, g.h, undefined, scratchPos);
      g.bb.position = scratchPos;
      if (moving) { g.animT += dt * 3; this.setFrame(g, Math.floor(g.animT) % 2); } else this.setFrame(g, 0);
    }
    for (const f of this.flocks) {
      advanceFlock(f.flock, dt, this.rng.next());
      for (let i = 0; i < f.members.length; i++) {
        const m = f.members[i];
        memberPosition(f.flock, i, scratchXYZ);
        const ll = offsetToLonLat(f.anchor.lat, f.anchor.lon, scratchXYZ.x, scratchXYZ.y);
        Cartesian3.fromDegrees(ll.lon, ll.lat, f.anchor.h + scratchXYZ.z, undefined, scratchPos);
        m.bb.position = scratchPos;
        m.animT += dt * (f.kind === 'egret' || f.kind === 'gull' ? 4 : 8);
        const frame = Math.floor(m.animT) % 2;
        if (frame !== m.frame && m.sprite) { m.frame = frame; m.bb.setImage(m.sprite.ids[frame], m.sprite.canvases[frame]); }
      }
    }
    const ba = this.butterflyAnchor;
    if (ba) for (const b of this.butterflies) {
      if (!b.active) continue;
      const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.3) { b.tx = b.x + this.rng.range(-3, 3); b.ty = b.y + this.rng.range(-3, 3); b.tz = Math.max(0.3, Math.min(2.5, b.z + this.rng.range(-0.8, 0.8))); }
      else { const step = Math.min(d, 1.2 * dt); b.x += (dx / d) * step; b.y += (dy / d) * step; b.z += (dz / d) * step + Math.sin(b.animT * 9) * dt * 0.3; }
      const ll = offsetToLonLat(ba.lat, ba.lon, b.x, b.y);
      Cartesian3.fromDegrees(ll.lon, ll.lat, ba.h + b.z, undefined, scratchPos);
      b.bb.position = scratchPos;
      b.animT += dt * 10;
      const frame = Math.floor(b.animT) % 2;
      if (frame !== b.frame && b.sprite) { b.frame = frame; b.bb.setImage(b.sprite.ids[frame], b.sprite.canvases[frame]); }
    }
  }

  private setFrame(g: Ground, frame: number): void {
    if (frame === g.frame || !g.sprite) return;
    g.frame = frame;
    g.bb.setImage(g.sprite.ids[frame], g.sprite.canvases[frame]);
  }

  private report(now: number): void {
    const counts = new Map<AnimalKind, { n: number; lat: number; lon: number }>();
    for (const g of this.ground) if (g.active) { const c = counts.get(g.kind) ?? { n: 0, lat: g.lat, lon: g.lon }; c.n++; counts.set(g.kind, c); }
    for (const f of this.flocks) counts.set(f.kind, { n: f.members.length, lat: f.anchor.lat, lon: f.anchor.lon });
    let bn = 0;
    for (const b of this.butterflies) if (b.active) bn++;
    if (bn > 0 && this.butterflyAnchor) counts.set('butterfly', { n: bn, lat: this.butterflyAnchor.lat, lon: this.butterflyAnchor.lon });
    for (const [kind, c] of counts) reportSighting(kind, ANIMAL_LABEL[kind], c.lat, c.lon, c.n, now);
  }

  private despawnAll(): void {
    for (const g of this.ground) if (g.active) this.deactivateGround(g);
    for (const f of this.flocks) for (const m of f.members) m.bb.show = false;
    this.flocks = [];
    for (const b of this.butterflies) { b.active = false; b.bb.show = false; }
  }

  stats(): Record<string, string | number> {
    let cattle = 0, dogs = 0, butterflies = 0, birds = 0;
    for (const g of this.ground) if (g.active) { if (g.kind === 'cattle') cattle++; else dogs++; }
    for (const b of this.butterflies) if (b.active) butterflies++;
    for (const f of this.flocks) birds += f.members.length;
    return { cattle, dogs, birds: `${birds}${this.flocks.length ? ` (${this.flocks.map((f) => f.kind).join(', ')})` : ''}`, butterflies, place: this.context ? `${this.context.kind}${this.context.coastal ? ', coastal' : ''}${this.context.farmland ? ', farmland' : ''}` : '—', simulated: this.centre ? 'yes' : 'no (too high)' };
  }

  destroy(): void {
    this.despawnAll();
    this.engine.viewer.scene.primitives.remove(this.collection);
  }
}

function enuDist(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const o = enuOffsetM(a.lat, a.lon, b.lat, b.lon);
  return Math.hypot(o.east, o.north);
}
