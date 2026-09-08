/**
 * Gameplay system `interiors`: finds enterable buildings near the player (hero campus buildings, OpenStreetMap
 * buildings with a category, procedural near-field buildings), offers "Enter … (procedural interior)" at their door
 * point, builds the interior as a separate streamed level on enter (one active at a time), routes walking collision
 * through it, runs the elevator overlay, exits, fall protection and the hero campus exterior.
 */
import { Cartographic } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { useTerraStore } from '@/state/store';
import { buildInteriorPlan, INTERIOR_NOTE, enterLabelFor, type InteriorCategory, type InteriorPlan } from '@/world/interiors/grammar';
import { InteriorLevel } from '@/world/interiors/InteriorLevel';
import { frameFor, planHeadingDeg } from '@/world/interiors/frame';
import { Campus } from '@/world/hero/Campus';
import { SGIS_CAMPUS, campusBuildingDoor, campusBuildingFootprint, type CampusBuildingSpec } from '@/data/maharashtra/campus';
import { categoryForOsmBuilding } from '@/data/maharashtra/interiorGrammar';
import { haversineM } from '@/util/geo';
import { fadeThrough } from './fade';
import type { LonLat, OsmRoad } from '@/data/adapters/features/types';

/** A building the player can enter. */
export interface Enterable {
  id: string;
  name: string;
  category: InteriorCategory;
  /** Footprint ring as [lon, lat]. */
  footprint: LonLat[];
  heightM: number;
  floors?: number;
  /** Door point (nearest footprint edge midpoint to a road, or the campus entrance). */
  door: { lat: number; lon: number };
  source: 'campus' | 'osm' | 'procedural';
  campus?: CampusBuildingSpec;
  /** Ground height at the door (ellipsoid metres) when known. */
  baseM?: number;
}

interface Active {
  enterable: Enterable;
  plan: InteriorPlan;
  level: InteriorLevel;
  enteredAt: number;
  lastFloor: number;
  /** Set once the walker has been observed inside; auto-exit only triggers after that. */
  wasInside: boolean;
}

const SCAN_MS = 900;
const CANDIDATE_RADIUS_M = 60;
const FALL_RESPAWN_M = 8;
const SAFE_SAMPLE_MS = 1000;

export class InteriorSystem implements GameplaySystem {
  readonly id = 'interiors';
  readonly label = 'Interiors';
  readonly campus: Campus;
  private active: Active | null = null;
  private candidates: Enterable[] = [];
  private lastScan = 0;
  private lastSafe: { lat: number; lon: number; heightM: number; t: number }[] = [];
  private lastSafeT = 0;
  private removeCampusSampler: () => void;
  private statusOwned: string | null = null;
  private doorCache = new Map<string, { lat: number; lon: number }>();
  private fallsRespawned = 0;
  private entered = 0;
  private lastEnterMs = 0;

  constructor(private readonly engine: TerraEngine) {
    this.campus = new Campus(engine.viewer, { groundHeight: (lat, lon) => engine.groundHeightAt(lat, lon), terrainHeight: (lat, lon) => engine.terrainHeight(lat, lon) });
    this.removeCampusSampler = engine.modes.addHeightSampler(this.campus.heightAt);
    const prevFall = engine.modes.onFall;
    engine.modes.onFall = (fallM) => { prevFall?.(fallM); this.onFall(fallM); };
  }

  // ---------------------------------------------------------------------------------------------------------------

  update(ctx: GameplayContext): void {
    this.campus.update();
    const modes = this.engine.modes;
    if (!ctx.player.embodied || ctx.player.mode === 'passenger') { if (this.active) this.exit(false); this.clearStatus(); return; }
    if (this.active) {
      const changed = this.active.level.update(modes.bodyPosition());
      const outside = this.active.level.playerOutside();
      if (!outside) this.active.wasInside = true;
      else if (this.active.wasInside && ctx.nowMs - this.active.enteredAt > 800) { this.exit(true); return; }
      if (changed || ctx.nowMs - this.lastScan > SCAN_MS) this.refreshStatus();
    } else {
      // Persistent campus note while walking on the campus grounds.
      if (this.campus.placed && this.campus.onCampus(ctx.player.lat, ctx.player.lon)) this.setStatus(SGIS_CAMPUS.note);
      else this.clearStatus();
    }
    // Last safe points for fall protection (sampled once a second while standing on the ground).
    if (ctx.nowMs - this.lastSafeT > SAFE_SAMPLE_MS && modes.getState().onGround) {
      this.lastSafeT = ctx.nowMs;
      this.lastSafe.push({ lat: ctx.player.lat, lon: ctx.player.lon, heightM: ctx.player.heightM, t: ctx.nowMs });
      if (this.lastSafe.length > 6) this.lastSafe.shift();
    }
  }

  interactions(ctx: GameplayContext): Interaction[] {
    if (!ctx.player.embodied || ctx.player.mode === 'passenger') return [];
    const out: Interaction[] = [];
    if (this.active) {
      const { level, plan } = this.active;
      const floor = level.floor();
      if (floor.index === 0) {
        for (const ex of floor.exits) {
          const p = level.toLonLat(ex.x, ex.y);
          out.push({ id: `interior-exit-${ex.doorId}`, label: `Exit ${plan.displayName}`, lat: p.lat, lon: p.lon, radiusM: 2.6, priority: 2, modes: ['walk'], run: () => this.exit(false) });
        }
      }
      for (const el of floor.elevators) {
        const p = level.toLonLat(el.lobby.x, el.lobby.y);
        out.push({ id: `interior-lift-${floor.index}`, label: 'Call elevator', lat: p.lat, lon: p.lon, radiusM: 2.8, priority: 1, modes: ['walk'], run: () => this.openElevator() });
      }
      return out;
    }
    if (ctx.nowMs - this.lastScan > SCAN_MS) { this.lastScan = ctx.nowMs; this.candidates = this.scan(ctx.player.lat, ctx.player.lon); }
    for (const c of this.candidates) {
      out.push({ id: `interior-enter-${c.id}`, label: c.source === 'campus' ? `Enter ${c.name} (procedural interior)` : `${enterLabelFor(c.category)} (procedural interior)`, lat: c.door.lat, lon: c.door.lon, radiusM: 4.5, priority: c.source === 'campus' ? 1 : 0, modes: ['walk'], run: () => this.enter(c) });
    }
    return out;
  }

  stats(): Record<string, string | number> {
    const s: Record<string, string | number> = { active: this.active ? this.active.plan.displayName : 'none', candidates: this.candidates.length, entered: this.entered, fallRespawns: this.fallsRespawned };
    if (this.active) {
      const ls = this.active.level.stats();
      s.floor = `${ls.floor} (${this.active.level.floor().name})`;
      s.builtFloors = ls.builtFloors;
      s.boxes = ls.boxes;
      s.labels = ls.labels;
      s.lastBuildMs = Math.round(this.lastEnterMs);
    }
    const cs = this.campus.stats();
    s.campus = cs.placed ? `placed (${cs.boxes} boxes, base ${cs.baseM} m)` : 'not placed';
    return s;
  }

  onSpawn(): void {
    if (this.active) this.exit(false);
    this.lastSafe = [];
    this.lastScan = 0;
  }

  destroy(): void {
    if (this.active) this.exit(false);
    this.removeCampusSampler();
    this.campus.destroy();
    this.clearStatus();
  }

  /** The active level (tests and diagnostics). */
  activeLevel(): InteriorLevel | null { return this.active?.level ?? null; }
  activePlan(): InteriorPlan | null { return this.active?.plan ?? null; }

  // ---------------------------------------------------------------------------------------------------------------
  // Candidates

  private scan(lat: number, lon: number): Enterable[] {
    const out: Enterable[] = [];
    // Hero campus buildings.
    if (this.campus.placed && haversineM(lat, lon, SGIS_CAMPUS.origin.lat, SGIS_CAMPUS.origin.lon) < 600) {
      const base = this.campus.baseHeight() ?? undefined;
      for (const b of SGIS_CAMPUS.buildings) {
        const [de, dn] = campusBuildingDoor(b);
        const door = this.campus.toLonLat(de, dn);
        if (haversineM(lat, lon, door.lat, door.lon) > CANDIDATE_RADIUS_M) continue;
        const footprint = campusBuildingFootprint(b).map(([e, n]) => { const p = this.campus.toLonLat(e, n); return [p.lon, p.lat] as LonLat; });
        out.push({ id: `campus:${b.id}`, name: b.name, category: b.category, footprint, heightM: b.heightM, floors: b.floors, door, source: 'campus', campus: b, baseM: base });
      }
    }
    // OpenStreetMap buildings (real footprints, generated interiors).
    const osm = this.engine.osm;
    if (osm) {
      // Every loaded tile whose bounds come within reach of the player (buildings near a tile edge belong to a
      // neighbouring tile).
      for (const tile of osm.loadedTiles) {
        const bb = tile.bbox;
        const clampLat = Math.max(bb.south, Math.min(bb.north, lat)), clampLon = Math.max(bb.west, Math.min(bb.east, lon));
        if (haversineM(lat, lon, clampLat, clampLon) > CANDIDATE_RADIUS_M + 40) continue;
        for (const b of tile.buildings) {
          if (b.outer.length < 4) continue;
          const category = categoryForOsmBuilding(b.type, b.name) ?? null;
          if (!category) continue;
          if (haversineM(lat, lon, b.centroid[1], b.centroid[0]) > CANDIDATE_RADIUS_M + 40) continue;
          const cat: InteriorCategory = b.type === 'yes' && b.heightM > 24 ? 'office' : category;
          const door = this.doorPoint(`osm:${b.id}`, b.outer, tile.roads);
          if (haversineM(lat, lon, door.lat, door.lon) > CANDIDATE_RADIUS_M) continue;
          out.push({ id: `osm:${b.id}`, name: b.name ?? cat, category: cat, footprint: b.outer, heightM: b.heightM, floors: b.levels ?? undefined, door, source: 'osm' });
        }
      }
    }
    // Procedural near-field buildings (villages / urban blocks where OSM is absent).
    const near = this.engine.nearField;
    if (near && out.length < 12) {
      for (const b of near.buildingsNear(lat, lon, CANDIDATE_RADIUS_M)) {
        if (b.source === 'osm') continue;
        const cat: InteriorCategory = b.style === 'tower' ? 'office' : b.style === 'industrial' ? 'showroom' : b.style === 'urban' ? (b.heightM > 12 ? 'office' : 'mall') : 'residential';
        const door = this.doorPoint(`nf:${b.id}`, b.footprint, []);
        if (haversineM(lat, lon, door.lat, door.lon) > CANDIDATE_RADIUS_M) continue;
        out.push({ id: `nf:${b.id}`, name: cat, category: cat, footprint: b.footprint, heightM: b.heightM, door, source: 'procedural', baseM: b.baseZ });
      }
    }
    return out.slice(0, 16);
  }

  /** Nearest footprint edge midpoint to a road (or to the player when no roads are known), pushed 1.2 m outside. */
  private doorPoint(key: string, ring: LonLat[], roads: OsmRoad[]): { lat: number; lon: number } {
    const cached = this.doorCache.get(key);
    if (cached) return cached;
    const pts = ring.slice();
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;
    let best: { lat: number; lon: number } | null = null, bestScore = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const edgeLen = haversineM(a[1], a[0], b[1], b[0]);
      if (edgeLen < 2.5) continue;
      let score = Infinity;
      for (const r of roads) for (const c of r.coords) { const d = haversineM(my, mx, c[1], c[0]); if (d < score) score = d; }
      if (!Number.isFinite(score)) score = 1000 - edgeLen; // no roads: prefer the longest edge
      if (score < bestScore) {
        bestScore = score;
        // Push the midpoint outward (away from the centroid) by ~1.2 m.
        const dx = mx - cx, dy = my - cy;
        const len = Math.hypot(dx * 111_320 * Math.cos((my * Math.PI) / 180), dy * 111_132) || 1;
        best = { lon: mx + (dx / len) * 1.2, lat: my + (dy / len) * 1.2 };
      }
    }
    const door = best ?? { lat: cy, lon: cx };
    if (this.doorCache.size > 500) this.doorCache.clear();
    this.doorCache.set(key, door);
    return door;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Enter / exit

  enter(c: Enterable): void {
    if (this.active) this.exit(false);
    const t0 = performance.now();
    const modes = this.engine.modes;
    const plan = buildInteriorPlan({ footprint: c.footprint, heightM: c.heightM, floors: c.floors, category: c.category, name: c.name, entrance: [c.door.lon, c.door.lat], layout: c.campus?.layout, maxFloors: 24 });
    const frame = frameFor(plan);
    const base = c.baseM ?? this.engine.groundHeightAt(c.door.lat, c.door.lon) ?? Cartographic.fromCartesian(modes.bodyPosition()).height;
    const level = new InteriorLevel(this.engine.viewer, plan, { baseHeightM: base, frame });
    this.active = { enterable: c, plan, level, enteredAt: performance.now(), lastFloor: 0, wasInside: false };
    if (c.campus) this.campus.setBuildingHidden(c.campus.id);
    modes.groundOverride = level.groundOverride;
    modes.moveFilter = level.moveFilter;
    // Stand just inside the exterior door nearest the door point, facing into the building.
    const exits = plan.floors[0].exits;
    let exit = exits[0];
    let bestD = Infinity;
    for (const e of exits) { const p = level.toLonLat(e.outsideX, e.outsideY); const d = haversineM(p.lat, p.lon, c.door.lat, c.door.lon); if (d < bestD) { bestD = d; exit = e; } }
    const inside = level.toLonLat(exit.x, exit.y);
    const heading = planHeadingDeg(frame, exit.x - exit.outsideX, exit.y - exit.outsideY);
    level.forceReference(0);
    fadeThrough(() => {
      if (this.active?.level !== level) return;
      this.engine.gameplay.teleport(inside.lat, inside.lon, heading);
      modes.setBody(inside.lat, inside.lon, heading, base);
      level.update(modes.bodyPosition());
      this.refreshStatus();
    }).catch(() => undefined);
    this.entered++;
    this.lastEnterMs = performance.now() - t0;
    useTerraStore.getState().log('info', `Entered ${plan.displayName}: ${plan.floors.length} levels, ${plan.floors.reduce((n, f) => n + f.rooms.length, 0)} rooms (seed ${plan.seed.toString(16)}) — ${INTERIOR_NOTE}`);
  }

  /** Leaves the active interior: level disposed, collision hooks cleared, player placed outside the nearest exit. */
  exit(walkedOut: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const modes = this.engine.modes;
    if (modes.groundOverride === a.level.groundOverride) modes.groundOverride = null;
    if (modes.moveFilter === a.level.moveFilter) modes.moveFilter = null;
    const p = a.level.player;
    let exit = a.plan.floors[0].exits[0];
    let bestD = Infinity;
    for (const e of a.plan.floors[0].exits) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bestD) { bestD = d; exit = e; } }
    const outside = exit ? a.level.toLonLat(exit.outsideX, exit.outsideY) : a.enterable.door;
    const heading = exit ? planHeadingDeg(a.level.frame, exit.outsideX - exit.x, exit.outsideY - exit.y) : undefined;
    if (a.enterable.campus) this.campus.setBuildingHidden(null);
    a.level.destroy();
    const place = () => {
      if (!this.engine.modes) return;
      this.engine.gameplay.teleport(outside.lat, outside.lon, heading);
      modes.setBody(outside.lat, outside.lon, heading, a.level.baseHeightM);
    };
    if (walkedOut) place(); else fadeThrough(place).catch(() => undefined);
    this.engine.gameplay.closeOverlay();
    this.clearStatus();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Elevator

  private openElevator(): void {
    const a = this.active;
    if (!a) return;
    const floor = a.level.floor();
    const el = floor.elevators[0];
    if (!el) return;
    const floors = a.plan.floors.filter((f) => f.kind === 'floor' && el.servesFloors.includes(f.index));
    this.engine.gameplay.showOverlay({
      title: `Elevator — ${a.plan.displayName}`,
      lines: [`You are on ${floor.name}. Choose a floor.`],
      actions: floors.map((f) => ({ id: `floor-${f.index}`, label: f.name, disabled: f.index === floor.index })),
      note: `${INTERIOR_NOTE}. The ride is a fade — no waiting.`,
    }, (id) => {
      const idx = Number(id.replace('floor-', ''));
      const target = a.plan.floors[idx];
      if (!target) return;
      this.engine.gameplay.closeOverlay();
      this.rideTo(idx);
    });
  }

  /** Teleports the walker to the elevator lobby of a floor behind a fade. */
  rideTo(floorIndex: number): void {
    const a = this.active;
    if (!a) return;
    const target = a.plan.floors[floorIndex];
    const el = target?.elevators[0] ?? a.plan.floors[0].elevators[0];
    if (!target || !el) return;
    const modes = this.engine.modes;
    fadeThrough(() => {
      if (this.active !== a) return;
      a.level.forceReference(floorIndex);
      const p = a.level.toLonLat(el.lobby.x, el.lobby.y);
      const heading = planHeadingDeg(a.level.frame, 0, -1);
      modes.setBody(p.lat, p.lon, heading, a.level.baseHeightM + target.z);
      a.level.update(modes.bodyPosition());
      this.refreshStatus();
    }).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Fall protection

  private onFall(fallM: number): void {
    if (fallM < FALL_RESPAWN_M) return;
    const now = performance.now();
    // Respawn at a point recorded at least two seconds before the landing so we do not land back on the edge.
    const safe = [...this.lastSafe].reverse().find((s) => now - s.t > 2000) ?? this.lastSafe[0];
    if (!safe) return;
    this.fallsRespawned++;
    const modes = this.engine.modes;
    fadeThrough(() => {
      if (this.active) this.active.level.forceReference(this.floorIndexForHeight(safe.heightM));
      modes.setBody(safe.lat, safe.lon, undefined, safe.heightM);
      this.setStatus(this.active ? `${INTERIOR_NOTE} · ${this.active.level.floor().name} — fall protection: returned to a safe spot` : 'Fall protection: returned to a safe spot');
    }).catch(() => undefined);
  }

  private floorIndexForHeight(h: number): number {
    const a = this.active;
    if (!a) return 0;
    const z = h - a.level.baseHeightM;
    let best = 0, bestD = Infinity;
    for (const f of a.plan.floors) { const d = Math.abs(f.z - z); if (d < bestD) { bestD = d; best = f.index; } }
    return best;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // HUD status

  private refreshStatus(): void {
    const a = this.active;
    if (!a) return;
    const room = a.level.roomAtPlayer();
    const note = a.enterable.campus ? `${INTERIOR_NOTE} · ${SGIS_CAMPUS.note}` : INTERIOR_NOTE;
    this.setStatus(`${note} · ${a.plan.displayName} · ${a.level.floor().name}${room ? ` · ${room}` : ''}`);
  }

  private setStatus(text: string): void {
    const store = useTerraStore.getState();
    if (store.gameplay.status === text) return;
    if (store.gameplay.status !== null && store.gameplay.status !== this.statusOwned) return; // another system owns the line
    this.statusOwned = text;
    store.setGameplay({ status: text });
  }

  private clearStatus(): void {
    if (this.statusOwned === null) return;
    const store = useTerraStore.getState();
    if (store.gameplay.status === this.statusOwned) store.setGameplay({ status: null });
    this.statusOwned = null;
  }
}
