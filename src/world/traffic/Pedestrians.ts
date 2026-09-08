import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, EllipsoidGeometry, GeometryInstance, HeadingPitchRoll, Matrix3, Matrix4, PerInstanceColorAppearance, Primitive, PrimitiveCollection, Transforms, type Viewer } from 'cesium';
import { enuOffsetM } from '@/util/geo';
import { Rng } from '@/util/hash';
import { roadNearPoint, roadPosition, type GraphRoad, type RoadPoint } from './roadGraph';

/**
 * Pooled pedestrians walking along the pavements of nearby roads: regional clothing palettes (colour sets only, no
 * real people), a simple walk cycle (bobbing torso, swinging legs), avoidance of the player and of vehicles.
 * Simulated only within ~200 m of the focus point; walkers that drift further are recycled near the focus.
 *
 * Shared contract for the living-world track (see docs/PLAN_MAHARASHTRA.md): `positions()` exposes active walkers
 * so other systems (traffic braking, crowds) can read them without importing this class.
 */
export interface WalkerPalette { tops: string[]; bottoms: string[]; skins: string[]; label: string }

export const PALETTES: Record<'maharashtra' | 'india' | 'generic', WalkerPalette> = {
  maharashtra: { label: 'Maharashtra (saris, kurtas, school and office wear)', tops: ['#c2185b', '#e65100', '#00897b', '#8e24aa', '#fdd835', '#43a047', '#f5f5f5', '#1e88e5', '#6d4c41', '#d81b60', '#f9a825'], bottoms: ['#f5f5f5', '#263238', '#5d4037', '#37474f', '#efebe9', '#1a237e'], skins: ['#8d5524', '#c68642', '#a1665e', '#6b4423', '#b07a4a'] },
  india: { label: 'India (general)', tops: ['#c2185b', '#e65100', '#00897b', '#f5f5f5', '#1e88e5', '#fdd835', '#6d4c41'], bottoms: ['#f5f5f5', '#263238', '#5d4037', '#37474f'], skins: ['#8d5524', '#c68642', '#a1665e', '#6b4423'] },
  generic: { label: 'Generic', tops: ['#37474f', '#455a64', '#1565c0', '#b71c1c', '#f5f5f5', '#212121', '#6a1b9a'], bottoms: ['#263238', '#3e2723', '#1a237e', '#5d4037', '#607d8b'], skins: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'] },
};

export function paletteFor(lat: number, lon: number): WalkerPalette {
  if (lat > 15.5 && lat < 22.2 && lon > 72.5 && lon < 81) return PALETTES.maharashtra;
  if (lat > 6 && lat < 37 && lon > 68 && lon < 98) return PALETTES.india;
  return PALETTES.generic;
}

/** Fraction of the pool that is out walking at a local hour. */
export function pedestrianActivity(localHour: number): number {
  const h = ((localHour % 24) + 24) % 24;
  if (h < 5) return 0.15;
  if (h < 7) return 0.5;
  if (h < 10) return 1;
  if (h < 17) return 0.8;
  if (h < 21) return 1;
  return 0.45;
}

const WALKABLE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'service', 'pedestrian', 'path', 'other']);
const VF = PerInstanceColorAppearance.VERTEX_FORMAT;
const SIM_RADIUS_M = 200;
const scratchHpr = new HeadingPitchRoll();
const scratchM3 = new Matrix3();
const scratchM4 = new Matrix4();
const scratchT = new Cartesian3();
const scratchPos = new Cartesian3();
const scratchOut = { lon: 0, lat: 0, h: 0, headingDeg: 0 };

interface Walker {
  body: Primitive;
  legL: Primitive;
  legR: Primitive;
  frame: Matrix4;
  road: GraphRoad | null;
  t: number;
  dir: 1 | -1;
  sideM: number;
  baseSideM: number;
  speed: number;
  phase: number;
  active: boolean;
  lat: number;
  lon: number;
  rank: number;
  paused: number;
}

/** Distance along the road of the point nearest to lat/lon (flat-earth metres). */
function nearestT(road: GraphRoad, lat: number, lon: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < road.pts.length; i++) {
    const a = enuOffsetM(lat, lon, road.pts[i - 1].lat, road.pts[i - 1].lon);
    const b = enuOffsetM(lat, lon, road.pts[i].lat, road.pts[i].lon);
    const dx = b.east - a.east, dy = b.north - a.north;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.east * dx - a.north * dy) / len2));
    const d = Math.hypot(a.east + dx * t, a.north + dy * t);
    if (d < bestD) { bestD = d; best = road.cum[i - 1] + t * (road.cum[i] - road.cum[i - 1]); }
  }
  return best;
}

export class Pedestrians {
  private collection: PrimitiveCollection;
  private walkers: Walker[] = [];
  private rng = new Rng(0x5eed);
  private lastSpawn = 0;
  private paletteKey = '';
  maxWalkers = 20;

  constructor(private viewer: Viewer) {
    this.collection = viewer.scene.primitives.add(new PrimitiveCollection());
  }

  stats(): { active: number; pooled: number; palette: string } {
    return { active: this.walkers.filter((w) => w.active).length, pooled: this.walkers.length, palette: this.paletteKey };
  }

  /** Lat/lon of every active walker (for vehicle braking and crowd systems). */
  positions(): { lat: number; lon: number }[] {
    const out: { lat: number; lon: number }[] = [];
    for (const w of this.walkers) if (w.active) out.push({ lat: w.lat, lon: w.lon });
    return out;
  }

  private build(palette: WalkerPalette, seed: number): Walker {
    const rng = new Rng(seed);
    const top = Color.fromCssColorString(rng.pick(palette.tops));
    const bottom = Color.fromCssColorString(rng.pick(palette.bottoms));
    const skin = Color.fromCssColorString(rng.pick(palette.skins));
    const box = (x: number, y: number, z: number, l: number, w: number, h: number, c: Color) => new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(l, w, h), vertexFormat: VF }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(x, y, z)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(c) } });
    const torso = box(0, 0, 1.12, 0.22, 0.36, 0.56, top);
    const armL = box(0, 0.24, 1.08, 0.1, 0.1, 0.5, top);
    const armR = box(0, -0.24, 1.08, 0.1, 0.1, 0.5, top);
    const head = new GeometryInstance({ geometry: new EllipsoidGeometry({ radii: new Cartesian3(0.1, 0.1, 0.12), vertexFormat: VF }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 1.53)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(skin) } });
    const hair = box(0, 0, 1.6, 0.16, 0.2, 0.08, Color.fromCssColorString('#1a1a1a'));
    const appearance = () => new PerInstanceColorAppearance({ translucent: false, closed: true });
    const body = this.collection.add(new Primitive({ geometryInstances: [torso, armL, armR, head, hair], appearance: appearance(), asynchronous: false, allowPicking: false, show: false }));
    const leg = () => this.collection.add(new Primitive({ geometryInstances: [box(0, 0, -0.42, 0.14, 0.14, 0.84, bottom)], appearance: appearance(), asynchronous: false, allowPicking: false, show: false }));
    return { body, legL: leg(), legR: leg(), frame: new Matrix4(), road: null, t: 0, dir: 1, sideM: 0, baseSideM: 0, speed: 1.2, phase: rng.range(0, Math.PI * 2), active: false, lat: 0, lon: 0, rank: rng.next(), paused: 0 };
  }

  private spawn(w: Walker, roads: GraphRoad[], focus: { lat: number; lon: number }): boolean {
    const near = roads.filter((r) => WALKABLE.has(r.kind) && r.length > 20 && roadNearPoint(r, focus.lat, focus.lon, 150));
    if (near.length === 0) return false;
    const road = this.rng.pick(near);
    w.road = road;
    // Start within ~120 m of the focus along the road rather than anywhere on a kilometre-long way.
    const along = nearestT(road, focus.lat, focus.lon);
    w.t = Math.max(0, Math.min(road.length, along + this.rng.range(-120, 120)));
    w.dir = this.rng.next() < 0.5 ? 1 : -1;
    const side = this.rng.next() < 0.5 ? 1 : -1;
    w.baseSideM = side * (road.widthM / 2 + 1.3);
    w.sideM = w.baseSideM;
    w.speed = this.rng.range(0.9, 1.6);
    w.active = true;
    w.paused = 0;
    return true;
  }

  private setActive(w: Walker, on: boolean): void {
    w.active = on;
    w.body.show = on; w.legL.show = on; w.legR.show = on;
  }

  update(dt: number, focus: { lat: number; lon: number } | null, roads: GraphRoad[], vehicles: { lat: number; lon: number }[], player: { lat: number; lon: number } | null, localHour: number, sampleH: (p: RoadPoint) => number, nowMs: number): void {
    if (!focus) { for (const w of this.walkers) if (w.active) this.setActive(w, false); return; }
    const palette = paletteFor(focus.lat, focus.lon);
    if (palette.label !== this.paletteKey) {
      this.paletteKey = palette.label;
      for (const w of this.walkers) { this.collection.remove(w.body); this.collection.remove(w.legL); this.collection.remove(w.legR); }
      this.walkers = [];
    }
    while (this.walkers.length < this.maxWalkers) this.walkers.push(this.build(palette, 0x9e37 + this.walkers.length * 7919));
    const activity = pedestrianActivity(localHour);
    const roadsById = new Set(roads);
    for (const w of this.walkers) {
      const wanted = w.rank < activity;
      if (!wanted) { if (w.active) this.setActive(w, false); continue; }
      if (w.road && !roadsById.has(w.road)) { w.road = null; this.setActive(w, false); }
      if (!w.active || !w.road) {
        if (nowMs - this.lastSpawn < 120) continue;
        this.lastSpawn = nowMs;
        if (this.spawn(w, roads, focus)) this.setActive(w, true); else continue;
      }
      const road = w.road!;
      // Recycle walkers that drifted far from the focus.
      const off = enuOffsetM(focus.lat, focus.lon, w.lat || focus.lat, w.lon || focus.lon);
      if (Math.hypot(off.east, off.north) > SIM_RADIUS_M + 40) { this.setActive(w, false); w.road = null; continue; }
      // Avoidance: pause for a vehicle very close by, step aside and slow for the player.
      let speed = w.speed;
      let targetSide = w.baseSideM;
      if (player) {
        const rel = enuOffsetM(w.lat, w.lon, player.lat, player.lon);
        const d = Math.hypot(rel.east, rel.north);
        if (d < 1.8) { speed *= 0.35; targetSide = w.baseSideM + Math.sign(w.baseSideM) * 1.2; }
      }
      for (const v of vehicles) {
        const rel = enuOffsetM(w.lat, w.lon, v.lat, v.lon);
        if (Math.abs(rel.east) < 3.5 && Math.abs(rel.north) < 3.5 && Math.hypot(rel.east, rel.north) < 3.2) { speed = 0; break; }
      }
      w.sideM += (targetSide - w.sideM) * Math.min(1, dt * 3);
      w.t += speed * dt * w.dir;
      if (w.t >= road.length) { w.t = road.length; w.dir = -1; }
      if (w.t <= 0) { w.t = 0; w.dir = 1; }
      if (speed > 0.05) w.phase += dt * speed * 4.2;
      const p = roadPosition(road, w.t, w.dir, w.sideM, sampleH, scratchOut);
      w.lat = p.lat; w.lon = p.lon;
      const bob = 0.045 * Math.abs(Math.sin(w.phase));
      Cartesian3.fromDegrees(p.lon, p.lat, p.h + bob, undefined, scratchPos);
      scratchHpr.heading = (p.headingDeg * Math.PI) / 180 - Math.PI / 2; scratchHpr.pitch = 0; scratchHpr.roll = 0;
      Transforms.headingPitchRollToFixedFrame(scratchPos, scratchHpr, undefined, undefined, w.frame);
      w.body.modelMatrix = w.frame;
      const swing = speed > 0.05 ? Math.sin(w.phase) * 0.55 : 0;
      this.placeLeg(w.legL, w.frame, 0.1, swing);
      this.placeLeg(w.legR, w.frame, -0.1, -swing);
    }
  }

  private placeLeg(leg: Primitive, frame: Matrix4, y: number, pitch: number): void {
    Matrix3.fromRotationY(pitch, scratchM3);
    scratchT.x = 0; scratchT.y = y; scratchT.z = 0.86;
    Matrix4.fromRotationTranslation(scratchM3, scratchT, scratchM4);
    leg.modelMatrix = Matrix4.multiply(frame, scratchM4, leg.modelMatrix);
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.collection);
    this.walkers = [];
  }
}
