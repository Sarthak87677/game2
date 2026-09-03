/**
 * Procedural buildings from BuildingSpec footprints: extruded walls with per-face normals and window-cell texture
 * coordinates (the shader draws/lights window cells), plus flat, gable or hip roofs. Colours come from the spec; the
 * vertex alpha carries a facade code (254 plain windows, 253 curtain-wall tower, 252 sparse industrial, 255 none).
 */
import { fbm2, fnv1a, mixSeed, Rng } from '@/util/hash';
import type { BuildingSpec } from '@/world/procedural/types';
import { MeshBuilder, emptyMesh, type MeshData } from './mesh';
import { addPolygonCap, cleanRing, ringArea } from './shapes';
import { parseColour, scaleColour, type RGB } from './colour';
import { clamp } from './common';

/** Window column pitch (m) and floor height (m) used for facade st coordinates. */
export const WINDOW_PITCH_M = 3.2;
export const FLOOR_HEIGHT_M = 3.0;

const ROOF_PALETTE: Record<BuildingSpec['style'], RGB[]> = {
  rural: [[150, 80, 60], [95, 92, 96], [140, 115, 70]],
  suburban: [[112, 72, 60], [96, 96, 102], [128, 88, 70]],
  urban: [[82, 82, 88], [96, 90, 86]],
  tower: [[72, 80, 96]],
  industrial: [[150, 150, 155], [128, 132, 138]],
  religious: [[86, 86, 96], [120, 100, 80]],
};

/** Top-of-building ellipsoid height for collisions (ridge/parapet). */
export function buildingTopHeight(spec: BuildingSpec): number {
  return spec.baseZ + spec.heightM;
}

/** Extrudes one building. Returns an opaque mesh in absolute local metres. */
export function buildBuilding(spec: BuildingSpec, seed = 0): MeshData {
  const ring = cleanRing(spec.footprint);
  if (!ring || spec.heightM <= 0) return emptyMesh();
  if (ringArea(ring) < 0) ring.reverse();
  const hash = mixSeed(seed, fnv1a(spec.id));
  const rng = new Rng(hash);
  const b = new MeshBuilder(ring.length * 12, ring.length * 24);
  const wall = parseColour(spec.colour, [190, 180, 165]);
  const wallVar = rng.range(0.92, 1.08);
  const roofColour = scaleColour(rng.pick(ROOF_PALETTE[spec.style] ?? ROOF_PALETTE.rural), rng.range(0.9, 1.1));
  const code = spec.style === 'tower' ? 253 : spec.style === 'industrial' ? 252 : 254;
  const n = ring.length;
  const top = spec.baseZ + spec.heightM;
  const bottom = spec.baseZ - 1.5;

  // Oriented axis along the longest edge for pitched roofs.
  let longest = 0, ux = 1, uy = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], c = ring[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len > longest) { longest = len; ux = (c[0] - a[0]) / len; uy = (c[1] - a[1]) / len; }
  }
  const vx = -uy, vy = ux;
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= n; cy /= n;
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  const sOf: number[] = [];
  for (const [x, y] of ring) {
    const s = (x - cx) * ux + (y - cy) * uy, t = (x - cx) * vx + (y - cy) * vy;
    sOf.push(s);
    if (s < smin) smin = s; if (s > smax) smax = s; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
  }
  const shortSide = tmax - tmin;
  let roof = spec.roof;
  if (roof !== 'flat' && (n > 10 || spec.heightM < 2.5 || shortSide < 1.5)) roof = 'flat';
  const roofH = roof === 'flat' ? 0 : Math.min(spec.heightM * 0.5, clamp(shortSide * 0.32, 1.2, 6));
  const eave = top - roofH;

  // Walls.
  for (let i = 0; i < n; i++) {
    const a = ring[i], c = ring[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-4) continue;
    const nx = (c[1] - a[1]) / len, ny = -(c[0] - a[0]) / len;
    const shade = wallVar * (0.9 + 0.2 * fbm2(i * 0.7 + (hash % 1000) / 1000, 0.3, 2, hash));
    const colour = scaleColour(wall, shade);
    const v0 = (bottom - spec.baseZ) / FLOOR_HEIGHT_M, v1 = (eave - spec.baseZ) / FLOOR_HEIGHT_M;
    const u1 = len / WINDOW_PITCH_M;
    const i0 = b.vertex(a[0], a[1], bottom, nx, ny, 0, colour, code, 0, v0, 0);
    const i1 = b.vertex(c[0], c[1], bottom, nx, ny, 0, colour, code, u1, v0, 0);
    const i2 = b.vertex(c[0], c[1], eave, nx, ny, 0, colour, code, u1, v1, 0);
    const i3 = b.vertex(a[0], a[1], eave, nx, ny, 0, colour, code, 0, v1, 0);
    b.quad(i0, i1, i2, i3);
  }

  if (roof === 'flat') {
    addPolygonCap(b, ring, () => top, scaleColour(roofColour, 0.95), true);
    return b.build();
  }

  // Pitched roof: every eave edge connects to its nearest point on the ridge segment (gable: full length so end
  // faces become vertical gables; hip: ridge inset so the ends slope).
  const inset = roof === 'gable' ? 0 : Math.min((smax - smin) * 0.4, shortSide * 0.5);
  const rs0 = smin + inset, rs1 = smax - inset;
  const tr = (tmin + tmax) / 2;
  const ridge = (s: number): [number, number] => {
    const sc = clamp(s, Math.min(rs0, rs1), Math.max(rs0, rs1));
    return [cx + ux * sc + vx * tr, cy + uy * sc + vy * tr];
  };
  const gableWall = scaleColour(wall, wallVar * 0.97);
  for (let i = 0; i < n; i++) {
    const a = ring[i], c = ring[(i + 1) % n];
    const ra = ridge(sOf[i]), rb = ridge(sOf[(i + 1) % n]);
    const ex = c[0] - a[0], ey = c[1] - a[1];
    const fx = ra[0] - a[0], fy = ra[1] - a[1], fz = roofH;
    let nx = ey * fz, ny = -ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const vertical = Math.abs(nz) < 0.2;
    const colour = vertical ? gableWall : scaleColour(roofColour, 0.92 + 0.16 * Math.max(0, nx * 0.5 + ny * 0.3 + nz));
    const alpha = 255;
    const i0 = b.vertex(a[0], a[1], eave, nx, ny, nz, colour, alpha, -1, -1, 0);
    const i1 = b.vertex(c[0], c[1], eave, nx, ny, nz, colour, alpha, -1, -1, 0);
    if (Math.hypot(rb[0] - ra[0], rb[1] - ra[1]) < 0.05) {
      const i2 = b.vertex(ra[0], ra[1], top, nx, ny, nz, colour, alpha, -1, -1, 0);
      b.triangle(i0, i1, i2);
    } else {
      const i2 = b.vertex(rb[0], rb[1], top, nx, ny, nz, colour, alpha, -1, -1, 0);
      const i3 = b.vertex(ra[0], ra[1], top, nx, ny, nz, colour, alpha, -1, -1, 0);
      b.quad(i0, i1, i2, i3);
    }
  }
  return b.build();
}
