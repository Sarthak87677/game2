/**
 * Runtime representation of a corridor: densified polyline, station arc lengths, speed-limit sections, block
 * signalling and a vertical profile sampled from the terrain provider so that trains follow the ground (lifted over
 * crests, never cutting through hills). Profiles are sampled in chunks starting near the player.
 */
import { Cartographic, Color, Math as CMath, Cartesian3, PolylineCollection, sampleTerrain, type Viewer } from 'cesium';
import type { RailCorridor, Station } from '@/data/maharashtra/types';
import type { TerraEngine } from '@/engine/TerraEngine';
import { Polyline } from '@/gameplay/journeys/geo';
import { buildTrackProfile } from '@/gameplay/journeys/trackProfile';
import { BlockSystem } from './blocks';
import { SERVICE_MOTION } from './motion';

export interface LimitSection { fromS: number; toS: number; ms: number }

export class TrackRuntime {
  readonly line: Polyline;
  readonly stationS: number[];
  readonly limits: LimitSection[] = [];
  readonly blocks: BlockSystem;
  readonly baseLimitMs: number;
  readonly spacingM: number;
  /** Fraction of vertices with a sampled profile height (0..1). */
  profileProgress = 0;
  private profileStarted = false;
  private disposed = false;
  private ground: Float64Array;

  constructor(readonly corridor: RailCorridor, stations: (id: string) => Station | undefined) {
    const raw = new Polyline(corridor.path);
    this.spacingM = raw.lengthM > 250_000 ? 400 : 150;
    this.line = raw.densify(this.spacingM);
    this.stationS = corridor.stations.map((id) => { const st = stations(id); return st ? this.line.nearestS(st) : 0; });
    this.baseLimitMs = SERVICE_MOTION[corridor.service].maxMs;
    for (const sec of corridor.slowSections ?? []) {
      const a = corridor.stations.indexOf(sec.between[0]), b = corridor.stations.indexOf(sec.between[1]);
      if (a < 0 || b < 0) continue;
      const s0 = Math.min(this.stationS[a], this.stationS[b]), s1 = Math.max(this.stationS[a], this.stationS[b]);
      this.limits.push({ fromS: s0, toS: s1, ms: sec.maxKmh / 3.6 });
    }
    this.blocks = new BlockSystem(this.stationS, this.line.lengthM);
    this.ground = new Float64Array(this.line.points.length).fill(NaN);
    this.line.heights = new Array<number>(this.line.points.length).fill(NaN);
  }

  /** Rail height at arc length s, or NaN while the profile there is still being sampled. */
  heightAt(s: number): number {
    const i = this.line.segmentAt(s);
    const h = this.line.heights!;
    const a = h[i], b = h[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? a : b;
    const len = this.line.cumulative[i + 1] - this.line.cumulative[i];
    const t = len > 0 ? (s - this.line.cumulative[i]) / len : 0;
    return a + (b - a) * t;
  }

  /** Samples the terrain along the line in chunks ordered by distance from `fromS` and fills the profile. */
  async buildProfile(engine: TerraEngine, fromS: number): Promise<void> {
    if (this.profileStarted) return;
    this.profileStarted = true;
    const pts = this.line.points;
    const n = pts.length;
    const chunk = 192;
    const chunks: number[] = [];
    for (let i = 0; i < n; i += chunk) chunks.push(i);
    const centre = this.line.segmentAt(fromS);
    chunks.sort((a, b) => Math.abs(a + chunk / 2 - centre) - Math.abs(b + chunk / 2 - centre));
    const viewer = engine.viewer;
    let done = 0;
    for (const start of chunks) {
      const end = Math.min(n, start + chunk);
      const cartos: Cartographic[] = [];
      for (let i = start; i < end; i++) cartos.push(Cartographic.fromDegrees(pts[i].lon, pts[i].lat));
      let ok = false;
      try {
        // The terrain host may be unreachable (sandbox/CI): give each chunk a bounded time, then fall back.
        const timeout = new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), 12_000));
        const r = await Promise.race([sampleTerrain(viewer.terrainProvider, 12, cartos).then(() => 'ok' as const), timeout]);
        ok = r === 'ok' && cartos.every((c) => Number.isFinite(c.height));
      } catch { ok = false; }
      if (this.disposed) return;
      for (let i = start; i < end; i++) {
        const c = cartos[i - start];
        const h = ok && Number.isFinite(c.height) ? c.height : (engine.worldMap?.sample(pts[i].lat, pts[i].lon).elevationM ?? 0);
        this.ground[i] = Math.max(0, Number.isFinite(h) ? h : 0);
      }
      this.applyProfile(start, end);
      done += end - start;
      this.profileProgress = done / n;
    }
  }

  private applyProfile(start: number, end: number): void {
    // Re-run the profile over the chunk plus a margin so the smoothing windows see their neighbours.
    const margin = 6;
    const a = Math.max(0, start - margin), b = Math.min(this.ground.length, end + margin);
    const slice: number[] = [];
    for (let i = a; i < b; i++) slice.push(Number.isFinite(this.ground[i]) ? this.ground[i] : (Number.isFinite(this.ground[start]) ? this.ground[start] : 0));
    const prof = buildTrackProfile(slice, { elevatedM: this.corridor.elevatedM ?? 0, clearanceM: 0.6, crestWindow: 2, smoothWindow: 3 });
    for (let i = start; i < end; i++) this.line.heights![i] = prof[i - a];
  }

  dispose(): void { this.disposed = true; }

  /** Nearest station index to arc length s. */
  nearestStationIndex(s: number): number {
    let best = 0, bd = Infinity;
    this.stationS.forEach((v, i) => { const d = Math.abs(v - s); if (d < bd) { bd = d; best = i; } });
    return best;
  }
}

/** Draws the rails of a corridor as a wide dark polyline within a window around a point (rebuilt as the point moves). */
export class TrackRenderer {
  private readonly collection: PolylineCollection;
  private centreS = NaN;
  private lastProgress = -1;
  private readonly positions: Cartesian3[] = [];
  constructor(private readonly viewer: Viewer, readonly track: TrackRuntime) {
    this.collection = viewer.scene.primitives.add(new PolylineCollection());
  }

  /** Call regularly with the arc length nearest to the player; rebuilds every ~1.5 km of movement or when the profile grows. */
  update(s: number): void {
    const t = this.track;
    if (Number.isFinite(this.centreS) && Math.abs(s - this.centreS) < 1500 && t.profileProgress === this.lastProgress) return;
    this.centreS = s;
    this.lastProgress = t.profileProgress;
    const windowM = 5000;
    const i0 = t.line.segmentAt(Math.max(0, s - windowM)), i1 = Math.min(t.line.points.length - 1, t.line.segmentAt(Math.min(t.line.lengthM, s + windowM)) + 1);
    this.positions.length = 0;
    const heights = t.line.heights!;
    for (let i = i0; i <= i1; i++) {
      const p = t.line.points[i];
      const h = Number.isFinite(heights[i]) ? heights[i] : (this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat)) ?? 0) + 0.6;
      this.positions.push(Cartesian3.fromDegrees(p.lon, p.lat, h + 0.15));
    }
    this.collection.removeAll();
    if (this.positions.length >= 2) {
      const elevated = (t.corridor.elevatedM ?? 0) > 0;
      this.collection.add({ positions: this.positions.slice(), width: elevated ? 14 : 6, material: undefined });
      const pl = this.collection.get(0);
      pl.material.uniforms.color = elevated ? Color.fromCssColorString('#6b6f75') : Color.fromCssColorString('#3a3532');
    }
  }

  destroy(): void { this.viewer.scene.primitives.remove(this.collection); }
}

export function railHeadingRad(headingDeg: number, direction: 1 | -1): number {
  return CMath.toRadians(direction > 0 ? headingDeg : headingDeg + 180);
}
