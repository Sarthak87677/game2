import { Cartesian3, Cartographic, Color, PointPrimitiveCollection, type PointPrimitive, type Viewer, Math as CMath, NearFarScalar } from 'cesium';
import type { RoadKind } from '@/data/adapters/features/types';
import { enuOffsetM } from '@/util/geo';
import { fnv1a, Rng } from '@/util/hash';
import type { OsmLayer } from '@/world/osm/OsmLayer';
import type { EnvironmentController } from '@/engine/environment';
import { connectRoads, disconnectRoads, insertCrossings, laneOffsetM, makeGraphRoad, nextNodeAhead, pickTurn, roadNearPoint, roadPosition, signalGreen, trafficDensity, type GraphNode, type GraphRoad, type RoadPoint } from './roadGraph';
import { Pedestrians } from './Pedestrians';

const SPEED_MS: Partial<Record<RoadKind, number>> = { motorway: 30, trunk: 25, primary: 16, secondary: 14, tertiary: 12, residential: 9 };
const SPACING_M: Partial<Record<RoadKind, number>> = { motorway: 55, trunk: 70, primary: 90, secondary: 120, tertiary: 160, residential: 260 };
const LAMP_SPACING_M = 34;
const BODY_COLOURS = ['#d9d9d9', '#2b2f36', '#9aa3ad', '#b8352a', '#2f5fa8', '#e0c04a', '#5b6b7a', '#f2f2f2'];
const KINDS_BY_ROAD: Partial<Record<RoadKind, string[]>> = {
  motorway: ['sedan', 'suv', 'truck', 'bus', 'hatchback'], trunk: ['sedan', 'suv', 'truck', 'bus', 'hatchback', 'taxi'],
  primary: ['hatchback', 'sedan', 'taxi', 'bus', 'rickshaw', 'suv'], secondary: ['hatchback', 'taxi', 'rickshaw', 'sedan', 'suv'],
  tertiary: ['hatchback', 'rickshaw', 'taxi', 'hatchback'], residential: ['hatchback', 'rickshaw', 'rickshaw', 'hatchback', 'taxi'],
};
/** Full simulation radius (lanes, signals, following, avoidance). */
const SIM_RADIUS_M = 400;
/** Coarse simulation radius; beyond it vehicles are frozen and counted statistically. */
const COARSE_RADIUS_M = 1500;
const BODY_RADIUS_M = 160;

/** A primitive vehicle body lent by the gameplay vehicle system for traffic near the player. */
export interface TrafficBody {
  setPose(position: Cartesian3, headingRad: number, dt: number, speedMs: number, steerRad: number): void;
  setLamps(s: { headlights?: boolean; brake?: boolean; night?: boolean; roof?: boolean }): void;
  show: boolean;
}
export interface TrafficBodyPool { acquire(hint: { kind: string; seed: number }): TrafficBody | null; release(body: TrafficBody): void }
export interface TrafficPlayer { lat: number; lon: number; headingDeg: number; speedMs: number }

interface Vehicle {
  road: GraphRoad;
  t: number;
  dir: 1 | -1;
  cruise: number;
  speed: number;
  laneM: number;
  kind: string;
  seed: number;
  rank: number;
  body: PointPrimitive;
  light: PointPrimitive;
  tail: PointPrimitive;
  body3d: TrafficBody | null;
  lat: number;
  lon: number;
  headingDeg: number;
  braking: boolean;
  waitingAt: string | null;
  active: boolean;
  zone: 0 | 1 | 2;
}

const scratchOut = { lon: 0, lat: 0, h: 0, headingDeg: 0 };
const scratchPos = new Cartesian3();

/**
 * Ambient traffic and street lighting derived from loaded OpenStreetMap roads. Vehicles keep to the left lane,
 * flow through junctions, stop at simple two-phase signals, follow the vehicle ahead, brake for pedestrians and the
 * player, and vary in density by time of day and place size. Only vehicles within ~400 m of the player are fully
 * simulated; further ones move coarsely or are frozen (statistical). Pedestrians walk the pavements nearby.
 * Everything is simulated — not observed traffic.
 */
export class TrafficLayer {
  private roads = new Map<string, GraphRoad[]>();
  private nodes = new Map<string, GraphNode>();
  private vehicles: Vehicle[] = [];
  private lamps = new Map<string, PointPrimitive[]>();
  private bodies: PointPrimitiveCollection;
  private lights: PointPrimitiveCollection;
  private lampCollection: PointPrimitiveCollection;
  private remove: () => void;
  private lastUpdate = 0;
  private lastSync = 0;
  private lastDensity = 0;
  private coarseTick = 0;
  private night = 0;
  private density = 1;
  private pool: TrafficBodyPool | null = null;
  private player: (() => TrafficPlayer | null) | null = null;
  private exclusion: { lat: number; lon: number; radiusM: number } | null = null;
  readonly pedestrians: Pedestrians;
  private counts = { simulated: 0, coarse: 0, frozen: 0, bodies3d: 0, waiting: 0 };
  private byRoad = new Map<GraphRoad, Vehicle[]>();
  enabled = true;
  maxVehicles = 500;
  maxLamps = 2500;

  constructor(private viewer: Viewer, private osm: OsmLayer, private environment: EnvironmentController) {
    const p = viewer.scene.primitives;
    this.bodies = p.add(new PointPrimitiveCollection());
    this.lights = p.add(new PointPrimitiveCollection({ blendOption: undefined }));
    this.lampCollection = p.add(new PointPrimitiveCollection());
    this.pedestrians = new Pedestrians(viewer);
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  stats(): { vehicles: number; lamps: number; roads: number; simulated: number; coarse: number; frozen: number; bodies3d: number; waiting: number; intersections: number; signals: number; pedestrians: number; density: number } {
    let roads = 0;
    for (const r of this.roads.values()) roads += r.length;
    let signals = 0;
    for (const n of this.nodes.values()) if (n.signal) signals++;
    return { vehicles: this.vehicles.length, lamps: this.lampCollection.length, roads, ...this.counts, intersections: this.nodes.size, signals, pedestrians: this.pedestrians.stats().active, density: Math.round(this.density * 100) / 100 };
  }

  /** Additive hooks for the vehicle gameplay system. */
  setBodyPool(pool: TrafficBodyPool | null): void {
    if (this.pool && pool !== this.pool) for (const v of this.vehicles) this.releaseBody(v);
    this.pool = pool;
  }
  setPlayer(fn: (() => TrafficPlayer | null) | null): void { this.player = fn; }
  /** Suppresses traffic inside a circle (closed-course time trial). */
  setExclusion(zone: { lat: number; lon: number; radiusM: number } | null): void { this.exclusion = zone; }

  /** Roads currently loaded near a point (for pedestrians and other consumers). */
  roadsNear(lat: number, lon: number, radiusM: number): GraphRoad[] {
    const out: GraphRoad[] = [];
    for (const list of this.roads.values()) for (const r of list) if (roadNearPoint(r, lat, lon, radiusM)) out.push(r);
    return out;
  }

  private update(): void {
    const now = performance.now();
    const dt = Math.min(0.2, (now - this.lastUpdate) / 1000);
    if (now - this.lastUpdate < 50) return;
    this.lastUpdate = now;
    const cam = this.viewer.camera.positionCartographic;
    const agl = cam.height - (this.viewer.scene.globe.getHeight(cam) ?? 0);
    const visible = this.enabled && agl < 3500;
    this.bodies.show = visible;
    this.lights.show = visible;
    this.lampCollection.show = visible;
    if (!visible) { for (const v of this.vehicles) this.releaseBody(v); this.pedestrians.update(dt, null, [], [], null, 12, this.sampleH, now); return; }
    if (now - this.lastSync > 1500) { this.lastSync = now; this.syncRoads(); }
    const player = this.player?.() ?? null;
    const focus = player ?? { lat: CMath.toDegrees(cam.latitude), lon: CMath.toDegrees(cam.longitude) };
    const sun = this.environment.sunElevationDeg(focus.lat, focus.lon);
    this.night = 1 - Math.min(1, Math.max(0, (sun + 4) / 8));
    const date = this.environment.getDate();
    const localHour = ((date.getUTCHours() + date.getUTCMinutes() / 60 + focus.lon / 15) % 24 + 24) % 24;
    if (now - this.lastDensity > 5000) { this.lastDensity = now; this.density = trafficDensity(localHour, this.placePopulation(focus.lat, focus.lon)); }
    this.coarseTick++;
    const nowS = now / 1000;
    const peds = this.pedestrians.positions();
    this.byRoad.clear();
    this.counts = { simulated: 0, coarse: 0, frozen: 0, bodies3d: 0, waiting: 0 };
    // Zone assignment and per-road buckets for car following.
    for (const v of this.vehicles) {
      const off = enuOffsetM(focus.lat, focus.lon, v.lat, v.lon);
      const d = Math.hypot(off.east, off.north);
      v.zone = d < SIM_RADIUS_M ? 0 : d < COARSE_RADIUS_M ? 1 : 2;
      const excluded = this.exclusion ? enuDist(this.exclusion.lat, this.exclusion.lon, v.lat, v.lon) < this.exclusion.radiusM : false;
      const active = v.rank < this.density && !excluded;
      if (active !== v.active) { v.active = active; v.body.show = active && !v.body3d; v.light.show = active && !v.body3d; v.tail.show = active && !v.body3d; if (!active) this.releaseBody(v); }
      if (v.active && v.zone === 0) { const l = this.byRoad.get(v.road); if (l) l.push(v); else this.byRoad.set(v.road, [v]); }
    }
    const near: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (!v.active) continue;
      if (v.zone === 0) { this.simulate(v, dt, nowS, player, peds); this.counts.simulated++; near.push(v); }
      else if (v.zone === 1) { this.counts.coarse++; if (this.coarseTick % 8 === 0) this.advance(v, dt * 8, nowS); else continue; }
      else { this.counts.frozen++; if (v.body3d) this.releaseBody(v); continue; }
    }
    this.assignBodies(near, focus, player, dt);
    for (const list of this.lamps.values()) for (const l of list) l.show = this.night > 0.15;
    const vehiclePositions = near.map((v) => ({ lat: v.lat, lon: v.lon }));
    this.pedestrians.update(dt, player ? focus : agl < 120 ? focus : null, this.roadsNear(focus.lat, focus.lon, 260), vehiclePositions, player, localHour, this.sampleH, now);
  }

  private placePopulation(lat: number, lon: number): number | null {
    let best: number | null = null;
    for (const t of this.osm.loadedTiles) for (const p of t.pois) if (p.population !== null && enuDist(lat, lon, p.lat, p.lon) < 6000 && (best === null || p.population > best)) best = p.population;
    return best;
  }

  private syncRoads(): void {
    const tiles = this.osm.loadedTiles;
    const present = new Set(tiles.map((t) => t.key));
    for (const key of [...this.roads.keys()]) if (!present.has(key)) this.unloadTile(key);
    for (const t of tiles) {
      if (this.roads.has(t.key)) continue;
      const roads: GraphRoad[] = [];
      const drivable = t.roads.filter((r) => SPEED_MS[r.kind] && r.coords.length >= 2 && !r.tunnel);
      // Copy coordinates so crossing insertion never mutates the OSM tile itself.
      const copies = drivable.map((r) => ({ coords: r.coords.map(([lon, lat]) => [lon, lat] as [number, number]) }));
      insertCrossings(copies.filter((_, i) => !drivable[i].bridge));
      drivable.forEach((r, i) => roads.push(makeGraphRoad(r.id, r.kind, copies[i].coords, t.key, r.widthM, r.lanes, r.oneway)));
      this.roads.set(t.key, roads);
      connectRoads(roads, this.nodes);
      this.spawn(roads, t.key);
    }
  }

  private sampleH = (p: RoadPoint): number => {
    if (p.h === null) {
      const h = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat));
      if (h !== undefined) p.h = h;
    }
    return p.h ?? 0;
  };

  private spawn(roads: GraphRoad[], tile: string): void {
    const rng = new Rng(fnv1a(tile));
    const lamps: PointPrimitive[] = [];
    for (const road of roads) {
      const spacing = SPACING_M[road.kind] ?? 200;
      const n = Math.min(40, Math.floor(road.length / spacing));
      for (let k = 0; k < n && this.vehicles.length < this.maxVehicles; k++) {
        const t = rng.range(0, road.length);
        const dir: 1 | -1 = road.oneway ? 1 : rng.next() < 0.5 ? 1 : -1;
        const cruise = (SPEED_MS[road.kind] ?? 10) * rng.range(0.75, 1.2);
        const laneM = laneOffsetM(road.widthM, road.lanes, road.oneway, road.oneway && (road.lanes ?? 1) > 1 ? rng.int(road.lanes ?? 1) : 0);
        const p = roadPosition(road, t, dir, laneM, this.sampleH, scratchOut);
        const pos = Cartesian3.fromDegrees(p.lon, p.lat, p.h + 0.9);
        const body = this.bodies.add({ position: pos, pixelSize: 4, color: Color.fromCssColorString(rng.pick(BODY_COLOURS)), scaleByDistance: new NearFarScalar(200, 1.6, 3000, 0.4), translucencyByDistance: new NearFarScalar(1500, 1, 3500, 0) });
        const light = this.lights.add({ position: pos, pixelSize: 5, color: Color.fromBytes(255, 245, 210, 0), scaleByDistance: new NearFarScalar(200, 1.8, 3000, 0.6) });
        const tail = this.lights.add({ position: pos, pixelSize: 3, color: Color.fromBytes(255, 40, 30, 0), scaleByDistance: new NearFarScalar(200, 1.5, 3000, 0.5) });
        const kinds = KINDS_BY_ROAD[road.kind] ?? ['hatchback'];
        this.vehicles.push({ road, t, dir, cruise, speed: cruise, laneM, kind: rng.pick(kinds), seed: rng.int(1 << 30), rank: rng.next(), body, light, tail, body3d: null, lat: p.lat, lon: p.lon, headingDeg: p.headingDeg, braking: false, waitingAt: null, active: true, zone: 2 });
      }
      if (road.kind !== 'motorway' && road.kind !== 'trunk') {
        for (let t = LAMP_SPACING_M / 2; t < road.length && this.lampCollection.length < this.maxLamps; t += LAMP_SPACING_M) {
          const p = roadPosition(road, t, 1, 0, this.sampleH, scratchOut);
          const pos = Cartesian3.fromDegrees(p.lon, p.lat, p.h + 0.9);
          const lifted = Cartesian3.add(pos, Cartesian3.multiplyByScalar(Cartesian3.normalize(pos, new Cartesian3()), 6.5, new Cartesian3()), new Cartesian3());
          lamps.push(this.lampCollection.add({ position: lifted, pixelSize: 6, color: Color.fromBytes(255, 214, 150, 220), show: false, scaleByDistance: new NearFarScalar(100, 1.5, 3000, 0.5), translucencyByDistance: new NearFarScalar(800, 1, 3500, 0) }));
        }
      }
    }
    this.lamps.set(tile, lamps);
  }

  /** Full simulation: target speed from signals, the vehicle ahead, pedestrians and the player; then advance. */
  private simulate(v: Vehicle, dt: number, nowS: number, player: TrafficPlayer | null, peds: { lat: number; lon: number }[]): void {
    let target = v.cruise;
    v.braking = false;
    // Signals: stop short of a red junction ahead.
    const ahead = nextNodeAhead(v.road, v.t, v.dir, 16);
    if (ahead) {
      const node = this.nodes.get(ahead.key);
      if (node?.signal) {
        const green = signalGreen(nowS, node.offsetS, v.headingDeg);
        if (!green && ahead.distM > 1.5) { target = Math.min(target, Math.max(0, (ahead.distM - 3) * 1.2)); v.waitingAt = ahead.key; }
        else if (green && v.waitingAt === ahead.key) v.waitingAt = null;
        if (!green) this.counts.waiting++;
      }
    }
    // Car following on the same road and direction.
    const bucket = this.byRoad.get(v.road);
    if (bucket && bucket.length > 1) {
      for (const o of bucket) {
        if (o === v || o.dir !== v.dir) continue;
        const gap = (o.t - v.t) * v.dir;
        if (gap > 0 && gap < 14) target = Math.min(target, gap < 6 ? 0 : o.speed);
      }
    }
    // Emergency braking for the player and pedestrians in the path ahead.
    const h = (v.headingDeg * Math.PI) / 180;
    const fe = Math.sin(h), fn = Math.cos(h);
    const inPath = (lat: number, lon: number, aheadM: number, lateralM: number) => {
      const rel = enuOffsetM(v.lat, v.lon, lat, lon);
      const f = rel.east * fe + rel.north * fn;
      const l = Math.abs(rel.east * fn - rel.north * fe);
      return f > -1 && f < aheadM && l < lateralM;
    };
    if (player && inPath(player.lat, player.lon, 18, 3)) { target = 0; v.braking = true; }
    if (target > 0) for (const p of peds) if (inPath(p.lat, p.lon, 10, 2.6)) { target = 0; v.braking = true; break; }
    // Accelerate/decelerate toward the target.
    if (v.speed > target) { v.braking = v.braking || v.speed - target > 2; v.speed = Math.max(target, v.speed - (v.braking ? 8 : 4) * dt); }
    else v.speed = Math.min(target, v.speed + 2.5 * dt);
    this.advance(v, dt, nowS);
  }

  private advance(v: Vehicle, dt: number, nowS: number): void {
    void nowS;
    v.t += v.speed * dt * v.dir;
    if (v.t >= v.road.length || v.t <= 0) {
      const endIndex = v.t >= v.road.length ? v.road.pts.length - 1 : 0;
      v.t = v.t >= v.road.length ? v.road.length : 0;
      const key = v.road.nodes[endIndex];
      const node = key ? this.nodes.get(key) : undefined;
      const turn = node ? pickTurn(node, v.road, hashUnit(v.seed, Math.floor(nowS))) : null;
      if (turn) { v.road = turn.road; v.t = turn.t; v.dir = turn.dir; v.cruise = (SPEED_MS[turn.road.kind] ?? 10) * (0.8 + 0.4 * hashUnit(v.seed, 7)); v.laneM = laneOffsetM(turn.road.widthM, turn.road.lanes, turn.road.oneway); }
      else if (v.road.oneway) { v.t = 0; }
      else v.dir = v.dir === 1 ? -1 : 1;
    }
    const p = roadPosition(v.road, v.t, v.dir, v.laneM, this.sampleH, scratchOut);
    v.lat = p.lat; v.lon = p.lon; v.headingDeg = p.headingDeg;
    const n = this.night;
    if (v.body3d) {
      Cartesian3.fromDegrees(p.lon, p.lat, p.h, undefined, scratchPos);
      v.body3d.setPose(scratchPos, (p.headingDeg * Math.PI) / 180, dt, v.speed, 0);
      v.body3d.setLamps({ headlights: n > 0.3, night: n > 0.3, brake: v.braking || v.speed < 0.2, roof: n > 0.3 });
      return;
    }
    const pos = Cartesian3.fromDegrees(p.lon, p.lat, p.h + 0.9, undefined, scratchPos);
    v.body.position = pos;
    v.light.position = pos;
    v.tail.position = pos;
    v.body.color = Color.fromAlpha(v.body.color, 1 - n * 0.6, v.body.color);
    v.light.color = Color.fromBytes(255, 245, 210, Math.round(230 * n), v.light.color);
    v.tail.color = Color.fromBytes(255, 40, 30, Math.round(v.braking ? 255 : 200 * n), v.tail.color);
  }

  /** Lends 3D bodies to the vehicles nearest the player and takes them back from the rest. */
  private assignBodies(near: Vehicle[], focus: { lat: number; lon: number }, player: TrafficPlayer | null, dt: number): void {
    if (!this.pool || !player) { for (const v of near) this.releaseBody(v); return; }
    const ranked = near.map((v) => ({ v, d: enuDist(focus.lat, focus.lon, v.lat, v.lon) })).filter((x) => x.d < BODY_RADIUS_M).sort((a, b) => a.d - b.d);
    const keep = new Set<Vehicle>();
    for (const { v } of ranked) {
      if (!v.body3d) {
        const b = this.pool.acquire({ kind: v.kind, seed: v.seed });
        if (!b) break;
        v.body3d = b;
        v.body.show = false; v.light.show = false; v.tail.show = false;
        const p = roadPosition(v.road, v.t, v.dir, v.laneM, this.sampleH, scratchOut);
        b.setPose(Cartesian3.fromDegrees(p.lon, p.lat, p.h, undefined, scratchPos), (p.headingDeg * Math.PI) / 180, dt, v.speed, 0);
      }
      keep.add(v);
    }
    for (const v of near) if (v.body3d && !keep.has(v)) this.releaseBody(v);
    this.counts.bodies3d = keep.size;
  }

  private releaseBody(v: Vehicle): void {
    if (!v.body3d) return;
    this.pool?.release(v.body3d);
    v.body3d = null;
    v.body.show = v.active; v.light.show = v.active; v.tail.show = v.active;
  }

  private unloadTile(key: string): void {
    this.roads.delete(key);
    disconnectRoads(key, this.nodes);
    const keep: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.road.tile === key) { this.releaseBody(v); this.bodies.remove(v.body); this.lights.remove(v.light); this.lights.remove(v.tail); } else keep.push(v);
    }
    this.vehicles = keep;
    for (const l of this.lamps.get(key) ?? []) this.lampCollection.remove(l);
    this.lamps.delete(key);
  }

  destroy(): void {
    this.remove();
    for (const v of this.vehicles) this.releaseBody(v);
    const p = this.viewer.scene.primitives;
    p.remove(this.bodies);
    p.remove(this.lights);
    p.remove(this.lampCollection);
    this.pedestrians.destroy();
    this.vehicles = [];
    this.roads.clear();
    this.nodes.clear();
  }
}

function enuDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const o = enuOffsetM(lat1, lon1, lat2, lon2);
  return Math.hypot(o.east, o.north);
}

function hashUnit(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
