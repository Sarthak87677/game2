/**
 * Parametric procedural stand-ins for well-known landmarks. These are deliberately abstract interpretations built from
 * primitives (no licensed models are bundled) and are labelled as procedural wherever they appear. Geometry is in a
 * local east-north-up frame (metres) anchored at the landmark's base; the renderer's MeshBuilder/appearances are reused.
 */
import { MeshBuilder, type MeshData } from '@/world/render';
import { addCone, addEllipsoid } from '@/world/render/geometry/shapes';
import { parseColour, type RGB } from '@/world/render/geometry/colour';
import { Rng } from '@/util/hash';

export type LandmarkArchetype =
  | 'latticeTower' | 'obelisk' | 'pyramid' | 'steppedPyramid' | 'domedBuilding' | 'classicalTemple' | 'archMonument' | 'statueOnPedestal'
  | 'skyscraperTapered' | 'twinTowers' | 'suspensionBridge' | 'shellRoof' | 'stupaTemple' | 'clockTower' | 'observationTower' | 'stoneCircle' | 'gatewayArch' | 'terraces' | 'genericMonument';

export interface ShapeParams {
  heightM: number;
  footprintM: number;
  colour: RGB;
  seed: number;
}

const SOLID = 255;

function box(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB, shade = 1): void {
  const dark: RGB = [c[0] * 0.78 * shade, c[1] * 0.78 * shade, c[2] * 0.78 * shade];
  const lit: RGB = [c[0] * shade, c[1] * shade, c[2] * shade];
  const faces: [number[][], number[], RGB][] = [
    [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], dark],
    [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], lit],
    [[[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], [0, 1, 0], dark],
    [[[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [-1, 0, 0], lit],
    [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9]],
  ];
  for (const [pts, n, col] of faces) {
    const ids = pts.map((p) => b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], col, SOLID, -1, -1, 0));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

/** Rotated box helper: centre (cx, cy), size (w, d), height z0..z1, rotation about z. */
function rbox(b: MeshBuilder, cx: number, cy: number, w: number, d: number, z0: number, z1: number, rot: number, c: RGB): void {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const corner = (dx: number, dy: number): [number, number] => [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
  const p = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
  const n = [[-sn, cs], [cs, sn], [sn, -cs], [-cs, -sn]];
  for (let i = 0; i < 4; i++) {
    const a = p[i], e = p[(i + 1) % 4];
    const nn = n[(i + 3) % 4];
    const shade = 0.75 + 0.25 * Math.max(0, nn[0] * 0.6 + nn[1] * 0.4);
    const col: RGB = [c[0] * shade, c[1] * shade, c[2] * shade];
    const i0 = b.vertex(a[0], a[1], z0, nn[0], nn[1], 0, col, SOLID, -1, -1, 0);
    const i1 = b.vertex(e[0], e[1], z0, nn[0], nn[1], 0, col, SOLID, -1, -1, 0);
    const i2 = b.vertex(e[0], e[1], z1, nn[0], nn[1], 0, col, SOLID, -1, -1, 0);
    const i3 = b.vertex(a[0], a[1], z1, nn[0], nn[1], 0, col, SOLID, -1, -1, 0);
    b.quad(i0, i1, i2, i3);
  }
  const top: RGB = [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9];
  const t = p.map((q) => b.vertex(q[0], q[1], z1, 0, 0, 1, top, SOLID, -1, -1, 0));
  b.quad(t[0], t[1], t[2], t[3]);
}

function pyramidFrustum(b: MeshBuilder, cx: number, cy: number, z0: number, half0: number, z1: number, half1: number, c: RGB): void {
  const corners = (h: number, z: number) => [[cx - h, cy - h, z], [cx + h, cy - h, z], [cx + h, cy + h, z], [cx - h, cy + h, z]];
  const lo = corners(half0, z0), hi = corners(half1, z1);
  const normals = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const n = normals[i];
    const shade = i % 2 === 0 ? 0.8 : 1;
    const col: RGB = [c[0] * shade, c[1] * shade, c[2] * shade];
    const slope = Math.atan2(half0 - half1, z1 - z0);
    const nx = n[0] * Math.cos(slope), ny = n[1] * Math.cos(slope), nz = Math.sin(slope);
    const a = b.vertex(lo[i][0], lo[i][1], lo[i][2], nx, ny, nz, col, SOLID, -1, -1, 0);
    const bb = b.vertex(lo[j][0], lo[j][1], lo[j][2], nx, ny, nz, col, SOLID, -1, -1, 0);
    const cc = b.vertex(hi[j][0], hi[j][1], hi[j][2], nx, ny, nz, col, SOLID, -1, -1, 0);
    const d = b.vertex(hi[i][0], hi[i][1], hi[i][2], nx, ny, nz, col, SOLID, -1, -1, 0);
    b.quad(a, bb, cc, d);
  }
  if (half1 > 0.01) {
    const t = hi.map((q) => b.vertex(q[0], q[1], q[2], 0, 0, 1, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], SOLID, -1, -1, 0));
    b.quad(t[0], t[1], t[2], t[3]);
  }
}

function column(b: MeshBuilder, x: number, y: number, z0: number, z1: number, r: number, c: RGB): void {
  addCone(b, x, y, z0, r, z1, r * 0.9, 8, () => c, 0, 0, false, SOLID);
}

function tint(c: RGB, k: number): RGB { return [c[0] * k, c[1] * k, c[2] * k]; }

export function buildLatticeTower(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, base = p.footprintM / 2;
  const c = p.colour;
  // Four curved legs approximated by stacked segments converging to the top section.
  const levels = [0, 0.18, 0.35, 0.55, 0.75, 0.9];
  const spread = (t: number) => base * Math.pow(1 - t, 1.6) + 0.02 * base;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let i = 0; i < levels.length - 1; i++) {
      const t0 = levels[i], t1 = levels[i + 1];
      const r0 = spread(t0);
      const leg0 = Math.max(0.6, base * 0.06 * (1 - t0));
      const leg1 = Math.max(0.5, base * 0.06 * (1 - t1));
      addCone(b, sx * r0 * 0.75, sy * r0 * 0.75, t0 * H, leg0, t1 * H, leg1, 6, () => c, 0, 0, false, SOLID);
      // Cross braces between adjacent legs.
      const nextX = sx * r0 * 0.75, nextY = -sy * r0 * 0.75;
      addCone(b, (sx * r0 * 0.75 + nextX) / 2, (sy * r0 * 0.75 + nextY) / 2, t0 * H + (t1 - t0) * H * 0.5, Math.max(0.3, leg0 * 0.5), t0 * H + (t1 - t0) * H * 0.5 + 0.5, 0.2, 4, () => tint(c, 0.85), 0, 0, false, SOLID);
    }
  }
  // Platforms.
  for (const t of [0.18, 0.35, 0.75]) {
    const r = spread(t) * 0.9 + base * 0.05;
    box(b, -r, -r, t * H - H * 0.01, r, r, t * H + H * 0.012, tint(c, 0.7));
  }
  // Upper mast and antenna.
  addCone(b, 0, 0, 0.9 * H, base * 0.05, 0.98 * H, base * 0.02, 8, () => c, 0, 0, false, SOLID);
  addCone(b, 0, 0, 0.98 * H, 0.6, H, 0.15, 6, () => tint(c, 0.6), 0, 0, false, SOLID);
  return b.build();
}

export function buildObelisk(p: ShapeParams): MeshData {
  const b = new MeshBuilder(256, 512);
  const half = p.footprintM / 2;
  pyramidFrustum(b, 0, 0, 0, half * 1.4, p.heightM * 0.04, half * 1.4, tint(p.colour, 0.85));
  pyramidFrustum(b, 0, 0, p.heightM * 0.04, half, p.heightM * 0.9, half * 0.62, p.colour);
  pyramidFrustum(b, 0, 0, p.heightM * 0.9, half * 0.62, p.heightM, 0, tint(p.colour, 1.05));
  return b.build();
}

export function buildPyramid(p: ShapeParams): MeshData {
  const b = new MeshBuilder(256, 512);
  pyramidFrustum(b, 0, 0, 0, p.footprintM / 2, p.heightM, 0, p.colour);
  return b.build();
}

export function buildSteppedPyramid(p: ShapeParams): MeshData {
  const b = new MeshBuilder(1024, 2048);
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const h0 = (p.footprintM / 2) * (1 - t0 * 0.8), h1 = (p.footprintM / 2) * (1 - t1 * 0.8);
    pyramidFrustum(b, 0, 0, t0 * p.heightM * 0.85, h0, t1 * p.heightM * 0.85, h1 + (h0 - h1) * 0.6, i % 2 ? p.colour : tint(p.colour, 0.92));
  }
  // Temple on top.
  rbox(b, 0, 0, p.footprintM * 0.16, p.footprintM * 0.16, p.heightM * 0.85, p.heightM, 0, tint(p.colour, 0.95));
  return b.build();
}

export function buildDomedBuilding(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const w = p.footprintM, H = p.heightM, c = p.colour;
  rbox(b, 0, 0, w, w * 0.8, 0, H * 0.42, 0, c);
  addCone(b, 0, 0, H * 0.42, w * 0.28, H * 0.55, w * 0.28, 24, () => tint(c, 0.95), 0, 0, false, SOLID);
  addEllipsoid(b, 0, 0, H * 0.55, w * 0.3, w * 0.3, H * 0.36, 24, 12, () => tint(c, 1.02), 0, SOLID);
  addCone(b, 0, 0, H * 0.9, 1.2, H, 0.2, 8, () => tint(c, 0.7), 0, 0, false, SOLID);
  const rng = new Rng(p.seed);
  // Four minarets/spires at the corners.
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const r = w * 0.04 + rng.range(0, 0.5);
    column(b, sx * w * 0.55, sy * w * 0.45, 0, H * 0.95, r, c);
    addCone(b, sx * w * 0.55, sy * w * 0.45, H * 0.95, r * 1.3, H * 1.05, 0.1, 8, () => tint(c, 0.8), 0, 0, false, SOLID);
  }
  return b.build();
}

export function buildClassicalTemple(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const w = p.footprintM, d = p.footprintM * 0.45, H = p.heightM, c = p.colour;
  rbox(b, 0, 0, w * 1.15, d * 1.25, 0, H * 0.12, 0, tint(c, 0.85));
  rbox(b, 0, 0, w * 1.05, d * 1.12, H * 0.12, H * 0.2, 0, tint(c, 0.9));
  const cols = 8, rows = 4;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue;
    column(b, -w / 2 + (i / (cols - 1)) * w, -d / 2 + (j / (rows - 1)) * d, H * 0.2, H * 0.78, Math.max(0.6, w * 0.02), c);
  }
  rbox(b, 0, 0, w * 1.08, d * 1.15, H * 0.78, H * 0.86, 0, tint(c, 0.95));
  // Pediment (triangular roof) as a wedge of quads.
  const z0 = H * 0.86, z1 = H;
  for (const side of [-1, 1]) {
    const n = [0, side * 0.8, 0.6];
    const a = b.vertex(-w * 0.55, side * d * 0.58, z0, n[0], n[1], n[2], tint(c, 0.9), SOLID, -1, -1, 0);
    const e = b.vertex(w * 0.55, side * d * 0.58, z0, n[0], n[1], n[2], tint(c, 0.9), SOLID, -1, -1, 0);
    const f = b.vertex(w * 0.55, 0, z1, n[0], n[1], n[2], tint(c, 0.9), SOLID, -1, -1, 0);
    const g = b.vertex(-w * 0.55, 0, z1, n[0], n[1], n[2], tint(c, 0.9), SOLID, -1, -1, 0);
    b.quad(a, e, f, g);
  }
  return b.build();
}

export function buildArchMonument(p: ShapeParams): MeshData {
  const b = new MeshBuilder(1024, 2048);
  const w = p.footprintM, H = p.heightM, c = p.colour;
  const pier = w * 0.28;
  rbox(b, -w / 2 + pier / 2, 0, pier, w * 0.45, 0, H * 0.62, 0, c);
  rbox(b, w / 2 - pier / 2, 0, pier, w * 0.45, 0, H * 0.62, 0, c);
  rbox(b, 0, 0, w, w * 0.45, H * 0.62, H, 0, tint(c, 0.95));
  // Arch soffit approximated by a half-cylinder of quads.
  const segs = 10, r = (w - 2 * pier) / 2;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (i / segs), a1 = Math.PI * ((i + 1) / segs);
    const x0 = Math.cos(a0) * r, z0 = H * 0.62 - r * 0.9 + Math.sin(a0) * r * 0.9;
    const x1 = Math.cos(a1) * r, z1 = H * 0.62 - r * 0.9 + Math.sin(a1) * r * 0.9;
    const nx = -(Math.cos(a0) + Math.cos(a1)) / 2, nz = -(Math.sin(a0) + Math.sin(a1)) / 2;
    const col = tint(c, 0.8);
    const v0 = b.vertex(x0, -w * 0.225, z0, nx, 0, nz, col, SOLID, -1, -1, 0);
    const v1 = b.vertex(x1, -w * 0.225, z1, nx, 0, nz, col, SOLID, -1, -1, 0);
    const v2 = b.vertex(x1, w * 0.225, z1, nx, 0, nz, col, SOLID, -1, -1, 0);
    const v3 = b.vertex(x0, w * 0.225, z0, nx, 0, nz, col, SOLID, -1, -1, 0);
    b.quad(v0, v1, v2, v3);
  }
  return b.build();
}

export function buildStatueOnPedestal(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  const pedestalH = H * 0.45;
  pyramidFrustum(b, 0, 0, 0, w / 2, pedestalH * 0.15, w * 0.42, tint(c, 0.8));
  rbox(b, 0, 0, w * 0.6, w * 0.6, pedestalH * 0.15, pedestalH, 0, tint(c, 0.85));
  const fig = H - pedestalH;
  const g: RGB = tint(c, 1.1);
  // Abstract figure: body, head, raised arm.
  addCone(b, 0, 0, pedestalH, w * 0.13, pedestalH + fig * 0.62, w * 0.09, 10, () => g, 0, 0, false, SOLID);
  addEllipsoid(b, 0, 0, pedestalH + fig * 0.7, w * 0.055, w * 0.055, fig * 0.07, 10, 6, () => g, 0, SOLID);
  addCone(b, w * 0.1, 0, pedestalH + fig * 0.55, w * 0.03, pedestalH + fig, w * 0.02, 6, () => g, 0, 0, false, SOLID);
  addCone(b, -w * 0.1, 0, pedestalH + fig * 0.55, w * 0.03, pedestalH + fig * 0.6, w * 0.02, 6, () => g, 0, 0, false, SOLID);
  return b.build();
}

export function buildSkyscraperTapered(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  const rng = new Rng(p.seed);
  const tiers = 6;
  let z = 0;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const tw = w * (1 - t * 0.78);
    const z1 = i === tiers - 1 ? H * 0.86 : z + (H * 0.86) / tiers * (0.8 + rng.range(0, 0.4));
    const rot = i * 0.26;
    rbox(b, 0, 0, tw, tw, z, Math.min(H * 0.86, z1), rot, tint(c, 0.95 + 0.02 * i));
    z = Math.min(H * 0.86, z1);
  }
  addCone(b, 0, 0, H * 0.86, w * 0.06, H, 0.3, 8, () => tint(c, 0.8), 0, 0, false, SOLID);
  return b.build();
}

export function buildTwinTowers(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  for (const sx of [-1, 1]) {
    const cx = sx * w * 0.36;
    rbox(b, cx, 0, w * 0.5, w * 0.5, 0, H * 0.7, Math.PI / 8, c);
    rbox(b, cx, 0, w * 0.34, w * 0.34, H * 0.7, H * 0.88, Math.PI / 8, tint(c, 0.97));
    addCone(b, cx, 0, H * 0.88, w * 0.1, H, 0.3, 8, () => tint(c, 0.8), 0, 0, false, SOLID);
  }
  rbox(b, 0, 0, w * 0.22, w * 0.12, H * 0.38, H * 0.42, 0, tint(c, 0.9));
  return b.build();
}

export function buildSuspensionBridge(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const L = p.footprintM, H = p.heightM, c = p.colour;
  const deckZ = H * 0.28, towerX = L * 0.3;
  rbox(b, 0, 0, L, 14, deckZ - 2, deckZ, 0, tint(c, 0.6));
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) column(b, sx * towerX, sy * 6, 0, H, 3, c);
    rbox(b, sx * towerX, 0, 8, 14, H * 0.5, H * 0.53, 0, c);
    rbox(b, sx * towerX, 0, 8, 14, H * 0.95, H, 0, c);
  }
  // Main cables (catenary) as thin cone segments, plus hangers.
  const segs = 24;
  for (const sy of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const x0 = -L / 2 + (i / segs) * L, x1 = -L / 2 + ((i + 1) / segs) * L;
      const cab = (x: number) => { const u = Math.max(0, Math.min(1, (Math.abs(x) - towerX) / (L / 2 - towerX))); const inner = Math.abs(x) <= towerX ? 1 - Math.pow(1 - Math.pow(Math.abs(x) / towerX, 2), 1) : 1; return Math.abs(x) <= towerX ? deckZ + 6 + (H - deckZ - 6) * Math.pow(Math.abs(x) / towerX, 2) * inner : H - (H - deckZ - 4) * u; };
      const z0 = cab(x0), z1 = cab(x1);
      addCone(b, (x0 + x1) / 2, sy * 6, Math.min(z0, z1), 0.6, Math.max(z0, z1) + 0.01, 0.6, 4, () => tint(c, 0.7), 0, 0, false, SOLID);
      if (i % 2 === 0) addCone(b, x0, sy * 6, deckZ, 0.25, z0, 0.25, 4, () => tint(c, 0.75), 0, 0, false, SOLID);
    }
  }
  return b.build();
}

export function buildShellRoof(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  rbox(b, 0, 0, w * 1.1, w * 0.6, 0, H * 0.12, 0, tint(c, 0.75));
  const shells = [[-w * 0.3, 0, 1], [-w * 0.05, 0, 0.85], [w * 0.2, 0, 0.7], [w * 0.4, w * 0.15, 0.5]];
  for (const [x, y, k] of shells) {
    // Each shell: a quarter-sphere-like sail (ellipsoid cap) leaning forward.
    addEllipsoid(b, x, y, H * 0.12, w * 0.16 * k, w * 0.2 * k, H * 0.85 * k, 16, 8, (nx, _ny, nz) => (nz > 0.2 && nx < 0 ? tint(c, 1.05) : tint(c, 0.97)), 0, SOLID);
  }
  return b.build();
}

export function buildStupaTemple(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const half = (w / 2) * (1 - t * 0.7);
    rbox(b, 0, 0, half * 2, half * 2, t * H * 0.7, (t + 1 / tiers) * H * 0.7 - H * 0.02, 0, i % 2 ? tint(c, 0.92) : c);
  }
  addEllipsoid(b, 0, 0, H * 0.7, w * 0.16, w * 0.16, H * 0.2, 16, 8, () => tint(c, 1.02), 0, SOLID);
  addCone(b, 0, 0, H * 0.88, w * 0.03, H, 0.2, 8, () => tint(c, 0.85), 0, 0, false, SOLID);
  return b.build();
}

export function buildClockTower(p: ShapeParams): MeshData {
  const b = new MeshBuilder(1024, 2048);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  rbox(b, 0, 0, w, w, 0, H * 0.7, 0, c);
  rbox(b, 0, 0, w * 1.1, w * 1.1, H * 0.7, H * 0.8, 0, tint(c, 0.9));
  pyramidFrustum(b, 0, 0, H * 0.8, w * 0.55, H * 0.97, w * 0.05, tint(c, 0.7));
  addCone(b, 0, 0, H * 0.97, 0.4, H, 0.1, 6, () => tint(c, 0.6), 0, 0, false, SOLID);
  return b.build();
}

export function buildObservationTower(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  addCone(b, 0, 0, 0, w * 0.5, H * 0.6, w * 0.16, 16, () => c, 0, 0, false, SOLID);
  addEllipsoid(b, 0, 0, H * 0.66, w * 0.55, w * 0.55, H * 0.06, 20, 6, () => tint(c, 0.95), 0, SOLID);
  addCone(b, 0, 0, H * 0.72, w * 0.14, H * 0.85, w * 0.08, 12, () => c, 0, 0, false, SOLID);
  addCone(b, 0, 0, H * 0.85, w * 0.05, H, 0.2, 8, () => tint(c, 0.7), 0, 0, false, SOLID);
  return b.build();
}

export function buildStoneCircle(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, r = p.footprintM / 2, c = p.colour;
  const rng = new Rng(p.seed);
  const n = 30;
  for (let i = 0; i < n; i++) {
    if (rng.next() < 0.3) continue; // fallen stones
    const a = (i / n) * Math.PI * 2;
    rbox(b, Math.cos(a) * r, Math.sin(a) * r, r * 0.12, r * 0.06, 0, H * rng.range(0.8, 1), a, tint(c, rng.range(0.85, 1)));
    if (i % 2 === 0) rbox(b, Math.cos(a + Math.PI / n) * r, Math.sin(a + Math.PI / n) * r, r * 0.24, r * 0.06, H * 0.95, H * 1.12, a + Math.PI / n, tint(c, 0.9));
  }
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.3 + i * 0.5;
    rbox(b, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.14, r * 0.07, 0, H * 1.4, a, tint(c, 0.95));
  }
  return b.build();
}

export function buildGatewayArch(p: ShapeParams): MeshData {
  const b = new MeshBuilder(2048, 4096);
  const H = p.heightM, span = p.footprintM, c = p.colour;
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    // Weighted catenary.
    const f = (t: number) => ({ x: -span / 2 + t * span, z: H * (1 - Math.cosh((t - 0.5) * 3.2) / Math.cosh(1.6)) });
    const a = f(t0), e = f(t1);
    const thick = 4 + 10 * Math.abs(t0 - 0.5);
    addCone(b, (a.x + e.x) / 2, 0, Math.min(a.z, e.z), thick, Math.max(a.z, e.z) + 0.01, thick, 4, () => tint(c, 0.9 + 0.1 * Math.sin(t0 * 9)), 0, 0, false, SOLID);
  }
  return b.build();
}

export function buildTerraces(p: ShapeParams): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const H = p.heightM, w = p.footprintM, c = p.colour;
  const rng = new Rng(p.seed);
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    rbox(b, (t - 0.5) * w * 0.4, rng.range(-w * 0.1, w * 0.1), w * (1 - t * 0.5), w * 0.5, t * H, (t + 1 / steps) * H - 0.2, 0.15, i % 2 ? tint(c, 0.9) : c);
  }
  for (let i = 0; i < 14; i++) rbox(b, rng.range(-w * 0.3, w * 0.3), rng.range(-w * 0.2, w * 0.2), 6, 5, H, H + 4, rng.range(0, 3), tint([150, 140, 125], rng.range(0.85, 1)));
  return b.build();
}

export function buildGenericMonument(p: ShapeParams): MeshData {
  const b = new MeshBuilder(512, 1024);
  rbox(b, 0, 0, p.footprintM, p.footprintM, 0, p.heightM, 0, p.colour);
  return b.build();
}

export const LANDMARK_BUILDERS: Record<LandmarkArchetype, (p: ShapeParams) => MeshData> = {
  latticeTower: buildLatticeTower, obelisk: buildObelisk, pyramid: buildPyramid, steppedPyramid: buildSteppedPyramid, domedBuilding: buildDomedBuilding,
  classicalTemple: buildClassicalTemple, archMonument: buildArchMonument, statueOnPedestal: buildStatueOnPedestal, skyscraperTapered: buildSkyscraperTapered,
  twinTowers: buildTwinTowers, suspensionBridge: buildSuspensionBridge, shellRoof: buildShellRoof, stupaTemple: buildStupaTemple, clockTower: buildClockTower,
  observationTower: buildObservationTower, stoneCircle: buildStoneCircle, gatewayArch: buildGatewayArch, terraces: buildTerraces, genericMonument: buildGenericMonument,
};

export function buildLandmark(archetype: LandmarkArchetype, heightM: number, footprintM: number, colour: string, seed: number): MeshData {
  return LANDMARK_BUILDERS[archetype]({ heightM, footprintM, colour: parseColour(colour), seed });
}
