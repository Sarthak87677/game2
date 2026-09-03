/**
 * Reusable shape emitters on top of MeshBuilder: tapered tubes (trunks, branches), crossed leaf cards, cones,
 * low-poly ellipsoids, 6-face fruit, polygon caps and 2D polygon helpers. Cesium-free.
 */
import type { MeshBuilder } from './mesh';
import type { RGB } from './colour';

export interface Vec3 { x: number; y: number; z: number }
export interface UvRect { u0: number; v0: number; u1: number; v1: number }

/** Solid white atlas cell UVs used for untextured cutout geometry; opaque geometry uses NO_ST. */
export const NO_ST: UvRect = { u0: -1, v0: -1, u1: -1, v1: -1 };

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: 1 };
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function add(a: Vec3, b: Vec3, k = 1): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

export interface TubeRing { centre: Vec3; radius: number; wind: number }

/**
 * Tapered tube through a polyline of ring centres with parallel-transported frames (no twist). `colourAt(ring, side)`
 * shades each vertex. Radial normals; alpha code 255; st = NO_ST. Rings need at least two entries.
 */
export function addTube(b: MeshBuilder, rings: readonly TubeRing[], sides: number, colourAt: (ring: number, side: number) => RGB, alpha = 255): void {
  const n = rings.length;
  if (n < 2 || sides < 3) return;
  let prevA: Vec3 | null = null;
  const ringStart: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = rings[Math.max(0, i - 1)].centre;
    const next = rings[Math.min(n - 1, i + 1)].centre;
    const t = normalize({ x: next.x - prev.x, y: next.y - prev.y, z: next.z - prev.z });
    const helper: Vec3 = Math.abs(t.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    let a: Vec3 = normalize(cross(helper, t));
    if (prevA) {
      // Parallel transport of the previous frame so the tube does not twist between rings.
      const d = dot(prevA, t);
      const proj = { x: prevA.x - t.x * d, y: prevA.y - t.y * d, z: prevA.z - t.z * d };
      if (Math.hypot(proj.x, proj.y, proj.z) > 1e-4) a = normalize(proj);
    }
    const c = cross(t, a);
    prevA = a;
    const r = rings[i];
    ringStart.push(b.vertexCount);
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = a.x * ca + c.x * sa, ny = a.y * ca + c.y * sa, nz = a.z * ca + c.z * sa;
      b.vertex(r.centre.x + nx * r.radius, r.centre.y + ny * r.radius, r.centre.z + nz * r.radius, nx, ny, nz, colourAt(i, s), alpha, -1, -1, r.wind);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const r0 = ringStart[i], r1 = ringStart[i + 1];
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      b.quad(r0 + s, r0 + s1, r1 + s1, r1 + s);
    }
  }
}

export interface CardOptions {
  /** Custom normal (default: horizontal, perpendicular to the card). */
  normal?: Vec3;
  /** Centre the card vertically on z (default: z is the bottom edge). */
  centred?: boolean;
  /** Mirror the atlas horizontally for variety. */
  flipU?: boolean;
  /** Horizontal lean of the top edge in metres (x, y). */
  lean?: { x: number; y: number };
  alpha?: number;
}

/** One vertical textured quad of width w and height h at (x, y, z), rotated about z. */
export function addCard(b: MeshBuilder, x: number, y: number, z: number, w: number, h: number, rotation: number, bottom: RGB, top: RGB, uv: UvRect, windBottom: number, windTop: number, opts: CardOptions = {}): void {
  const dx = Math.cos(rotation) * w * 0.5, dy = Math.sin(rotation) * w * 0.5;
  const z0 = opts.centred ? z - h * 0.5 : z;
  const z1 = z0 + h;
  const lx = opts.lean?.x ?? 0, ly = opts.lean?.y ?? 0;
  const n = opts.normal ?? { x: -Math.sin(rotation), y: Math.cos(rotation), z: 0 };
  const u0 = opts.flipU ? uv.u1 : uv.u0, u1 = opts.flipU ? uv.u0 : uv.u1;
  const alpha = opts.alpha ?? 255;
  const a = b.vertex(x - dx, y - dy, z0, n.x, n.y, n.z, bottom, alpha, u0, uv.v0, windBottom);
  const c = b.vertex(x + dx, y + dy, z0, n.x, n.y, n.z, bottom, alpha, u1, uv.v0, windBottom);
  const d = b.vertex(x + dx + lx, y + dy + ly, z1, n.x, n.y, n.z, top, alpha, u1, uv.v1, windTop);
  const e = b.vertex(x - dx + lx, y - dy + ly, z1, n.x, n.y, n.z, top, alpha, u0, uv.v1, windTop);
  b.quad(a, c, d, e);
}

/** Two cards crossing at 90 degrees (the classic leaf-cluster / grass-clump billboard pair). */
export function addCrossedCards(b: MeshBuilder, x: number, y: number, z: number, w: number, h: number, rotation: number, bottom: RGB, top: RGB, uv: UvRect, windBottom: number, windTop: number, opts: CardOptions = {}): void {
  addCard(b, x, y, z, w, h, rotation, bottom, top, uv, windBottom, windTop, opts);
  addCard(b, x, y, z, w, h, rotation + Math.PI / 2, bottom, top, uv, windBottom, windTop, { ...opts, flipU: !opts.flipU });
}

/** Six-face "sphere" (triangular bipyramid) for fruit and berries; radial normals. */
export function addBipyramid(b: MeshBuilder, x: number, y: number, z: number, radius: number, colour: RGB, wind: number, alpha = 255): void {
  const r = Math.max(0.005, radius);
  const top = b.vertex(x, y, z + r * 1.05, 0, 0, 1, colour, alpha, -1, -1, wind);
  const bottom = b.vertex(x, y, z - r * 1.05, 0, 0, -1, colour, alpha, -1, -1, wind);
  const eq: number[] = [];
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    eq.push(b.vertex(x + nx * r, y + ny * r, z, nx, ny, 0, colour, alpha, -1, -1, wind));
  }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    b.triangle(top, eq[i], eq[j]);
    b.triangle(bottom, eq[j], eq[i]);
  }
}

/** Low-poly ellipsoid (segsU around, segsV stacks) with per-normal colouring. */
export function addEllipsoid(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number, segsU: number, segsV: number, colourAt: (nx: number, ny: number, nz: number) => RGB, wind: number, alpha = 255, st: UvRect = NO_ST): void {
  const rings: number[][] = [];
  for (let v = 1; v < segsV; v++) {
    const theta = (v / segsV) * Math.PI;
    const st_ = Math.sin(theta), ct = Math.cos(theta);
    const ring: number[] = [];
    for (let u = 0; u < segsU; u++) {
      const phi = (u / segsU) * Math.PI * 2;
      const dx = Math.cos(phi) * st_, dy = Math.sin(phi) * st_, dz = ct;
      const nx = dx / rx, ny = dy / ry, nz = dz / rz;
      ring.push(b.vertex(x + dx * rx, y + dy * ry, z + dz * rz, nx, ny, nz, colourAt(dx, dy, dz), alpha, st.u0, st.v0, wind));
    }
    rings.push(ring);
  }
  const topV = b.vertex(x, y, z + rz, 0, 0, 1, colourAt(0, 0, 1), alpha, st.u0, st.v1, wind);
  const botV = b.vertex(x, y, z - rz, 0, 0, -1, colourAt(0, 0, -1), alpha, st.u0, st.v0, wind);
  for (let u = 0; u < segsU; u++) {
    const u1 = (u + 1) % segsU;
    b.triangle(topV, rings[0][u], rings[0][u1]);
    for (let v = 0; v < rings.length - 1; v++) b.quad(rings[v][u], rings[v + 1][u], rings[v + 1][u1], rings[v][u1]);
    const last = rings[rings.length - 1];
    b.triangle(botV, last[u1], last[u]);
  }
}

/** Frustum/cone between two heights; optional darker bottom disc (conifer tiers seen from below). */
export function addCone(b: MeshBuilder, x: number, y: number, zBase: number, rBase: number, zTop: number, rTop: number, sides: number, colourAt: (angle: number, t: number) => RGB, windBase: number, windTop: number, capBottom = false, alpha = 255): void {
  const h = Math.max(0.001, zTop - zBase);
  const rt = Math.max(0.002, rTop);
  const bottom: number[] = [], top: number[] = [];
  for (let s = 0; s < sides; s++) {
    const ang = (s / sides) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const nx = ca * h, ny = sa * h, nz = rBase - rt;
    bottom.push(b.vertex(x + ca * rBase, y + sa * rBase, zBase, nx, ny, nz, colourAt(ang, 0), alpha, -1, -1, windBase));
    top.push(b.vertex(x + ca * rt, y + sa * rt, zTop, nx, ny, nz, colourAt(ang, 1), alpha, -1, -1, windTop));
  }
  for (let s = 0; s < sides; s++) {
    const s1 = (s + 1) % sides;
    b.quad(bottom[s], bottom[s1], top[s1], top[s]);
  }
  if (capBottom) {
    const centre = b.vertex(x, y, zBase, 0, 0, -1, colourAt(0, -1), alpha, -1, -1, windBase);
    const ring: number[] = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      ring.push(b.vertex(x + Math.cos(ang) * rBase, y + Math.sin(ang) * rBase, zBase, 0, 0, -1, colourAt(ang, -1), alpha, -1, -1, windBase));
    }
    for (let s = 0; s < sides; s++) b.triangle(centre, ring[(s + 1) % sides], ring[s]);
  }
}

/** Signed area of a 2D ring (positive = counter-clockwise). */
export function ringArea(ring: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return -a / 2;
}

/** Ray-casting point-in-ring test in local metres. */
export function pointInRing(ring: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Removes a closing duplicate and consecutive duplicates; returns null when fewer than 3 distinct points remain. */
export function cleanRing(ring: readonly (readonly [number, number])[]): [number, number][] | null {
  const out: [number, number][] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push([p[0], p[1]]);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) out.pop();
  }
  return out.length >= 3 ? out : null;
}

/** Ear-clipping triangulation of a simple polygon; returns index triples in counter-clockwise order. */
export function earClip(ring: readonly (readonly [number, number])[]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  const ccw = ringArea(ring) > 0;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);
  const out: number[] = [];
  const crossZ = (a: number, b: number, c: number) => (ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0]);
  const inTri = (p: number, a: number, b: number, c: number) => crossZ(a, b, p) >= -1e-9 && crossZ(b, c, p) >= -1e-9 && crossZ(c, a, p) >= -1e-9;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (crossZ(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const p of idx) if (p !== a && p !== b && p !== c && inTri(p, a, b, c)) { ok = false; break; }
      if (!ok) continue;
      out.push(a, b, c);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate: fall back to a fan for what is left
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  else for (let i = 1; i < idx.length - 1; i++) out.push(idx[0], idx[i], idx[i + 1]);
  return out;
}

/** Horizontal polygon cap (roof, paddy water); `zAt` may vary per vertex to follow terrain. */
export function addPolygonCap(b: MeshBuilder, ring: readonly (readonly [number, number])[], zAt: (x: number, y: number) => number, colour: RGB, up: boolean, wind = 0, alpha = 255, stAt?: (x: number, y: number) => [number, number]): void {
  const clean = cleanRing(ring);
  if (!clean) return;
  const tris = earClip(clean);
  const base = b.vertexCount;
  for (const [x, y] of clean) {
    const st = stAt ? stAt(x, y) : [-1, -1];
    b.vertex(x, y, zAt(x, y), 0, 0, up ? 1 : -1, colour, alpha, st[0], st[1], wind);
  }
  for (let i = 0; i < tris.length; i += 3) {
    if (up) b.triangle(base + tris[i], base + tris[i + 1], base + tris[i + 2]);
    else b.triangle(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
  }
}

/** Recomputes smooth normals from triangle faces in place (used after vertex displacement). */
export function recomputeNormals(positions: Float32Array, indices: ArrayLike<number>, normals: Float32Array): void {
  normals.fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (l > 1e-12) { normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; } else { normals[i] = 0; normals[i + 1] = 0; normals[i + 2] = 1; }
  }
}
