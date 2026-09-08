/**
 * Pure geometry helpers shared by the rail, air and marine journeys (no Cesium, unit-testable in Node).
 */
import type { GeoPoint } from '@/data/maharashtra/types';

export const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees clockwise from north (0..360). */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG, dλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Point at fraction t (0..1) along the great circle from a to b (spherical linear interpolation). */
export function greatCircleInterpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const φ1 = a.lat * DEG, λ1 = a.lon * DEG, φ2 = b.lat * DEG, λ2 = b.lon * DEG;
  const d = distanceM(a, b) / EARTH_RADIUS_M;
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG, lon: Math.atan2(y, x) / DEG };
}

/** Destination point from `from` along `bearingDeg` for `distM` metres. */
export function destinationPoint(from: GeoPoint, bearing: number, distM: number): GeoPoint {
  const δ = distM / EARTH_RADIUS_M, θ = bearing * DEG;
  const φ1 = from.lat * DEG, λ1 = from.lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: ((λ2 / DEG + 540) % 360) - 180 };
}

/** Local east/north offset (metres) of `p` from `origin` — equirectangular, fine for a few kilometres. */
export function enuOffset(origin: GeoPoint, p: GeoPoint): { x: number; y: number } {
  const x = (p.lon - origin.lon) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG);
  const y = (p.lat - origin.lat) * DEG * EARTH_RADIUS_M;
  return { x, y };
}

/** Inverse of enuOffset. */
export function offsetPoint(origin: GeoPoint, x: number, y: number): GeoPoint {
  return { lat: origin.lat + y / (DEG * EARTH_RADIUS_M), lon: origin.lon + x / (DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG)) };
}

export interface PathSample { lat: number; lon: number; headingDeg: number; segment: number; heightM: number }

/**
 * A polyline with cumulative arc length: trains, ferries and ships advance a scalar `s` (metres) along it. Optional
 * per-vertex heights (track profile) are interpolated. Densify first for smooth heading changes.
 */
export class Polyline {
  readonly points: GeoPoint[];
  readonly cumulative: number[];
  readonly lengthM: number;
  heights: number[] | null = null;
  private readonly headings: number[];

  constructor(points: GeoPoint[]) {
    if (points.length < 2) throw new Error('Polyline needs at least two points');
    this.points = points;
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) this.cumulative.push(this.cumulative[i - 1] + distanceM(points[i - 1], points[i]));
    this.lengthM = this.cumulative[this.cumulative.length - 1];
    this.headings = points.map((p, i) => (i < points.length - 1 ? bearingDeg(p, points[i + 1]) : bearingDeg(points[i - 1], p)));
  }

  /** Returns a new polyline with vertices at most `spacingM` apart (great-circle subdivision). */
  densify(spacingM: number): Polyline {
    const out: GeoPoint[] = [this.points[0]];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const n = Math.max(1, Math.ceil(distanceM(a, b) / spacingM));
      for (let k = 1; k <= n; k++) out.push(k === n ? b : greatCircleInterpolate(a, b, k / n));
    }
    return new Polyline(out);
  }

  /** Index of the segment containing arc length s (binary search). */
  segmentAt(s: number): number {
    const c = this.cumulative;
    if (s <= 0) return 0;
    if (s >= this.lengthM) return c.length - 2;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
    return lo;
  }

  /** Position, heading and height at arc length s (clamped). `out` avoids allocation in hot loops. */
  sample(s: number, out?: PathSample): PathSample {
    const r = out ?? { lat: 0, lon: 0, headingDeg: 0, segment: 0, heightM: 0 };
    const sc = Math.max(0, Math.min(this.lengthM, s));
    const i = this.segmentAt(sc);
    const a = this.points[i], b = this.points[i + 1];
    const len = this.cumulative[i + 1] - this.cumulative[i];
    const t = len > 0 ? (sc - this.cumulative[i]) / len : 0;
    r.lat = a.lat + (b.lat - a.lat) * t;
    r.lon = a.lon + (b.lon - a.lon) * t;
    // Blend headings across the vertex so long vehicles do not snap at corners.
    const h0 = this.headings[i], h1 = this.headings[Math.min(i + 1, this.headings.length - 1)];
    r.headingDeg = lerpAngleDeg(h0, h1, t);
    r.segment = i;
    r.heightM = this.heights ? this.heights[i] + (this.heights[i + 1] - this.heights[i]) * t : 0;
    return r;
  }

  /** Arc length of the polyline vertex nearest to a point (used to place stations on the track). */
  nearestS(p: GeoPoint): number {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = distanceM(this.points[i], p);
      if (d < bestD) { bestD = d; best = i; }
    }
    // Refine within the two adjacent segments by projection in a local frame.
    let bestS = this.cumulative[best];
    for (const i of [best - 1, best]) {
      if (i < 0 || i >= this.points.length - 1) continue;
      const a = this.points[i], b = this.points[i + 1];
      const ab = enuOffset(a, b), ap = enuOffset(a, p);
      const l2 = ab.x * ab.x + ab.y * ab.y;
      if (l2 === 0) continue;
      const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / l2));
      const q = { x: ab.x * t, y: ab.y * t };
      const d = Math.hypot(ap.x - q.x, ap.y - q.y);
      if (d <= bestD) { bestD = d; bestS = this.cumulative[i] + t * (this.cumulative[i + 1] - this.cumulative[i]); }
    }
    return bestS;
  }

  /** Distance in metres from a point to the nearest vertex (continuity checks, "near the track" tests). */
  distanceToNearestVertexM(p: GeoPoint): number {
    let best = Infinity;
    for (const q of this.points) best = Math.min(best, distanceM(q, p));
    return best;
  }

  /** Largest gap between consecutive vertices. */
  maxGapM(): number {
    let m = 0;
    for (let i = 1; i < this.cumulative.length; i++) m = Math.max(m, this.cumulative[i] - this.cumulative[i - 1]);
    return m;
  }
}

export function lerpAngleDeg(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (!Number.isFinite(d)) d = 0;
  return (a + d * t + 360) % 360;
}

export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** Formats seconds as m:ss or h:mm. */
export function formatDuration(s: number): string {
  const sec = Math.max(0, Math.round(s));
  if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')} min`;
  if (sec >= 60) return `${Math.floor(sec / 60)} min`;
  return `${sec} s`;
}
