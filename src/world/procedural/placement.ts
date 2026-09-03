/**
 * Deterministic spatial sampling, height-field interpolation and small 2-D geometry helpers for the near-field
 * generator. Everything works in a tile-local frame (metres, x east, y north, origin at the tile centre) and is pure:
 * the same Rng state always yields the same points.
 */
import type { Rng } from '@/util/hash';
import { METRES_PER_DEGREE_LAT, metresPerDegreeLon, tileBounds } from '@/util/geo';
import type { HeightField } from './types';

/** 2-D point in local metres. */
export type Point2 = [number, number];

/** Axis-aligned bounds in local metres. */
export interface Bounds2 { minX: number; minY: number; maxX: number; maxY: number }

/** Geometry of one generation tile: anchor (tile centre) and local extent in metres. */
export interface TileFrame {
  anchorLat: number;
  anchorLon: number;
  /** East–west extent in metres. */
  widthM: number;
  /** North–south extent in metres. */
  heightM: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

/** East–west width of a slippy-map tile in metres at a latitude. */
export function metresPerTile(lat: number, z: number): number {
  return (360 / 2 ** z) * metresPerDegreeLon(lat);
}

/** Tile geometry for slippy x/y/z: anchor at the tile centre, extents in local metres. */
export function tileFrame(x: number, y: number, z: number): TileFrame {
  const b = tileBounds(x, y, z);
  const anchorLat = (b.north + b.south) / 2;
  const anchorLon = (b.west + b.east) / 2;
  return { anchorLat, anchorLon, widthM: (b.east - b.west) * metresPerDegreeLon(anchorLat), heightM: (b.north - b.south) * METRES_PER_DEGREE_LAT, ...b };
}

/** Local metres from lon/lat for a frame (flat-earth approximation, valid over a few km). */
export function localFromLonLat(frame: TileFrame, lon: number, lat: number): Point2 {
  let dLon = lon - frame.anchorLon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  return [dLon * metresPerDegreeLon(frame.anchorLat), (lat - frame.anchorLat) * METRES_PER_DEGREE_LAT];
}

/**
 * Jittered grid over a square of `tileSizeM` centred on the origin. `jitter` 0 gives a regular lattice, 1 lets each
 * point wander anywhere within its cell. Points are emitted row by row so RNG consumption is order-stable.
 */
export function jitteredGrid(rng: Rng, tileSizeM: number, spacingM: number, jitter: number): Point2[] {
  const n = Math.max(1, Math.floor(tileSizeM / Math.max(0.01, spacingM)));
  const step = tileSizeM / n;
  const half = tileSizeM / 2;
  const j = Math.max(0, Math.min(1, jitter));
  const out: Point2[] = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = -half + (gx + 0.5 + (rng.next() - 0.5) * j) * step;
      const y = -half + (gy + 0.5 + (rng.next() - 0.5) * j) * step;
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * Bridson Poisson-disk sampling over a `widthM × heightM` rectangle centred on the origin: no two points closer than
 * `radiusM`, at most `maxPoints` points. Deterministic for a given Rng.
 */
export function poissonDisk(rng: Rng, widthM: number, heightM: number, radiusM: number, maxPoints: number): Point2[] {
  const out: Point2[] = [];
  if (maxPoints <= 0 || widthM <= 0 || heightM <= 0 || radiusM <= 0) return out;
  const r2 = radiusM * radiusM;
  const cell = radiusM / Math.SQRT2;
  const gw = Math.max(1, Math.ceil(widthM / cell));
  const gh = Math.max(1, Math.ceil(heightM / cell));
  const grid = new Int32Array(gw * gh).fill(-1);
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const active: number[] = [];
  const K = 16;
  const insert = (p: Point2) => {
    const gx = Math.min(gw - 1, Math.floor((p[0] + halfW) / cell));
    const gy = Math.min(gh - 1, Math.floor((p[1] + halfH) / cell));
    grid[gy * gw + gx] = out.length;
    out.push(p);
    active.push(out.length - 1);
  };
  const fits = (px: number, py: number): boolean => {
    if (px < -halfW || px >= halfW || py < -halfH || py >= halfH) return false;
    const gx = Math.min(gw - 1, Math.floor((px + halfW) / cell));
    const gy = Math.min(gh - 1, Math.floor((py + halfH) / cell));
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) {
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const idx = grid[yy * gw + xx];
        if (idx < 0) continue;
        const q = out[idx];
        const dx = q[0] - px;
        const dy = q[1] - py;
        if (dx * dx + dy * dy < r2) return false;
      }
    }
    return true;
  };
  insert([rng.range(-halfW, halfW), rng.range(-halfH, halfH)]);
  while (active.length > 0 && out.length < maxPoints) {
    const ai = rng.int(active.length);
    const p = out[active[ai]];
    let found = false;
    for (let k = 0; k < K; k++) {
      const ang = rng.next() * Math.PI * 2;
      const d = radiusM * (1 + rng.next());
      const px = p[0] + Math.cos(ang) * d;
      const py = p[1] + Math.sin(ang) * d;
      if (fits(px, py)) {
        insert([px, py]);
        found = true;
        break;
      }
    }
    if (!found) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }
  return out;
}

interface GridTransform { au: number; bu: number; av: number; bv: number; cellXM: number; cellYM: number }

/** Linear map from local metres to height-field grid coordinates (u along columns west→east, v along rows north→south). */
function gridTransform(hf: HeightField, frame: TileFrame): GridTransform {
  const mLon = metresPerDegreeLon(frame.anchorLat);
  const dLon = Math.max(1e-9, hf.east - hf.west);
  const dLat = Math.max(1e-9, hf.north - hf.south);
  const cols = Math.max(1, hf.width - 1);
  const rows = Math.max(1, hf.height - 1);
  return {
    au: cols / (dLon * mLon),
    bu: ((frame.anchorLon - hf.west) / dLon) * cols,
    av: -rows / (dLat * METRES_PER_DEGREE_LAT),
    bv: ((hf.north - frame.anchorLat) / dLat) * rows,
    cellXM: (dLon * mLon) / cols,
    cellYM: (dLat * METRES_PER_DEGREE_LAT) / rows,
  };
}

function bilinear(hf: HeightField, u: number, v: number): number {
  const w = hf.width;
  const h = hf.height;
  if (w <= 0 || h <= 0 || hf.heights.length < w * h) return 0;
  const cu = Math.max(0, Math.min(w - 1, u));
  const cv = Math.max(0, Math.min(h - 1, v));
  const i0 = Math.floor(cu);
  const j0 = Math.floor(cv);
  const i1 = Math.min(w - 1, i0 + 1);
  const j1 = Math.min(h - 1, j0 + 1);
  const fx = cu - i0;
  const fy = cv - j0;
  const a = hf.heights[j0 * w + i0];
  const b = hf.heights[j0 * w + i1];
  const c = hf.heights[j1 * w + i0];
  const d = hf.heights[j1 * w + i1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Bilinearly interpolated terrain height (m) at local metres (xM east, yM north) of `frame`. */
export function sampleHeight(hf: HeightField, xM: number, yM: number, frame: TileFrame): number {
  const t = gridTransform(hf, frame);
  return bilinear(hf, t.au * xM + t.bu, t.av * yM + t.bv);
}

/** Terrain slope at a local point, 0 (flat) .. 1 (vertical): atan(rise/run) normalised by π/2. */
export function slope(hf: HeightField, xM: number, yM: number, frame: TileFrame): number {
  const t = gridTransform(hf, frame);
  return slopeFromTransform(hf, t, xM, yM);
}

function slopeFromTransform(hf: HeightField, t: GridTransform, xM: number, yM: number): number {
  const sx = Math.max(1, t.cellXM / 2);
  const sy = Math.max(1, t.cellYM / 2);
  const hx0 = bilinear(hf, t.au * (xM - sx) + t.bu, t.av * yM + t.bv);
  const hx1 = bilinear(hf, t.au * (xM + sx) + t.bu, t.av * yM + t.bv);
  const hy0 = bilinear(hf, t.au * xM + t.bu, t.av * (yM - sy) + t.bv);
  const hy1 = bilinear(hf, t.au * xM + t.bu, t.av * (yM + sy) + t.bv);
  const dzdx = (hx1 - hx0) / (2 * sx);
  const dzdy = (hy1 - hy0) / (2 * sy);
  return Math.atan(Math.hypot(dzdx, dzdy)) / (Math.PI / 2);
}

/** Cached height/slope sampler for one tile (avoids recomputing the grid transform per point). */
export interface HeightSampler {
  heightAt(xM: number, yM: number): number;
  slopeAt(xM: number, yM: number): number;
}

/** Sampler over a height field; a null field yields z = 0 and slope 0 everywhere. */
export function createHeightSampler(hf: HeightField | null, frame: TileFrame): HeightSampler {
  if (!hf || hf.width <= 0 || hf.height <= 0 || hf.heights.length < hf.width * hf.height) return { heightAt: () => 0, slopeAt: () => 0 };
  const t = gridTransform(hf, frame);
  return {
    heightAt: (xM, yM) => bilinear(hf, t.au * xM + t.bu, t.av * yM + t.bv),
    slopeAt: (xM, yM) => slopeFromTransform(hf, t, xM, yM),
  };
}

// ---- 2-D geometry ---------------------------------------------------------------------------------------------------

/** Even-odd point-in-polygon test (ring need not be closed). */
export function pointInPolygon(poly: readonly Point2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Distance from a point to the nearest segment of an open polyline. */
export function distanceToPolyline(line: readonly Point2[], x: number, y: number): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(x - line[0][0], y - line[0][1]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const d = distToSegment(x, y, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance from a point to the boundary of a polygon (closing edge included). */
export function distanceToPolygonEdge(poly: readonly Point2[], x: number, y: number): number {
  if (poly.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Axis-aligned bounds of a point list. */
export function polygonBounds(poly: readonly Point2[]): Bounds2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Unsigned polygon area (shoelace). */
export function polygonArea(poly: readonly Point2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

/** Vertex-average centroid (adequate for the small convex footprints used here). */
export function polygonCentroid(poly: readonly Point2[]): Point2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  const n = Math.max(1, poly.length);
  return [x / n, y / n];
}

/** True when `b` intersects `a` expanded by `margin` on every side. */
export function boundsIntersect(a: Bounds2, b: Bounds2, margin = 0): boolean {
  return b.minX <= a.maxX + margin && b.maxX >= a.minX - margin && b.minY <= a.maxY + margin && b.maxY >= a.minY - margin;
}

/** Separating-axis overlap test for two CONVEX polygons; touching edges count as overlapping when `gap` > 0. */
export function convexPolygonsOverlap(a: readonly Point2[], b: readonly Point2[], gap = 0): boolean {
  const axes = (poly: readonly Point2[]): Point2[] => {
    const out: Point2[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ex = poly[i][0] - poly[j][0];
      const ey = poly[i][1] - poly[j][1];
      const len = Math.hypot(ex, ey) || 1;
      out.push([-ey / len, ex / len]);
    }
    return out;
  };
  for (const [nx, ny] of [...axes(a), ...axes(b)]) {
    let aMin = Infinity;
    let aMax = -Infinity;
    let bMin = Infinity;
    let bMax = -Infinity;
    for (const [x, y] of a) {
      const p = x * nx + y * ny;
      if (p < aMin) aMin = p;
      if (p > aMax) aMax = p;
    }
    for (const [x, y] of b) {
      const p = x * nx + y * ny;
      if (p < bMin) bMin = p;
      if (p > bMax) bMax = p;
    }
    if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
  }
  return true;
}

/** Sutherland–Hodgman clip of a polygon against an axis-aligned rectangle; returns [] when nothing remains. */
export function clipPolygonToRect(poly: readonly Point2[], minX: number, minY: number, maxX: number, maxY: number): Point2[] {
  let out: Point2[] = poly.slice();
  const clipEdge = (inside: (p: Point2) => boolean, intersect: (p: Point2, q: Point2) => Point2) => {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (prevIn) out.push(intersect(prev, cur));
    }
  };
  const atX = (x: number) => (p: Point2, q: Point2): Point2 => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0] || 1e-12)];
  const atY = (y: number) => (p: Point2, q: Point2): Point2 => [p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1] || 1e-12), y];
  clipEdge((p) => p[0] >= minX, atX(minX));
  if (out.length === 0) return out;
  clipEdge((p) => p[0] <= maxX, atX(maxX));
  if (out.length === 0) return out;
  clipEdge((p) => p[1] >= minY, atY(minY));
  if (out.length === 0) return out;
  clipEdge((p) => p[1] <= maxY, atY(maxY));
  return out.length >= 3 ? out : [];
}

/** Axis-aligned-then-rotated rectangle centred at (cx, cy): half sizes hw/hh, rotation `angle` radians. */
export function rotatedRect(cx: number, cy: number, hw: number, hh: number, angle: number): Point2[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const corner = (dx: number, dy: number): Point2 => [cx + dx * c - dy * s, cy + dx * s + dy * c];
  return [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
}
