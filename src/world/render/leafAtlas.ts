/**
 * Procedurally drawn 512x512 leaf/flower/grass atlas. Shapes are drawn in white/grey with alpha so the per-vertex
 * colour tints them; the fragment shader alpha-tests at 0.5. The UV layout (ATLAS_CELLS) is static so geometry
 * builders can reference cells without a canvas, and `buildLeafAtlas` returns null where no 2D canvas exists (Node).
 *
 * Cesium uploads canvases with flipY, so canvas row 0 maps to v = 1: a cell's stem/base sits at v0 (bottom) and its
 * tip at v1 (top), matching how cards are built (bottom vertices get v0).
 */
import type { UvRect } from './geometry/shapes';

export const ATLAS_SIZE = 512;
export const ATLAS_GRID = 4;

export type AtlasCell = 'broadleaf' | 'maple' | 'tropical' | 'needle' | 'palm' | 'palmCrown' | 'flower' | 'grass' | 'shrub' | 'crop' | 'twigs' | 'succulent' | 'solid';

const CELL_INDEX: Record<AtlasCell, [number, number]> = {
  broadleaf: [0, 0], maple: [1, 0], tropical: [2, 0], needle: [3, 0],
  palm: [0, 1], palmCrown: [1, 1], flower: [2, 1], grass: [3, 1],
  shrub: [0, 2], crop: [1, 2], twigs: [2, 2], succulent: [3, 2],
  solid: [0, 3],
};

function rectFor(cx: number, cy: number): UvRect {
  const cell = 1 / ATLAS_GRID;
  const inset = 3 / ATLAS_SIZE;
  return { u0: cx * cell + inset, u1: (cx + 1) * cell - inset, v1: 1 - cy * cell - inset, v0: 1 - (cy + 1) * cell + inset };
}

/** UV rectangles of every atlas cell (v grows upwards, see module doc). */
export const ATLAS_CELLS: Record<AtlasCell, UvRect> = Object.fromEntries(
  (Object.keys(CELL_INDEX) as AtlasCell[]).map((k) => [k, rectFor(CELL_INDEX[k][0], CELL_INDEX[k][1])]),
) as Record<AtlasCell, UvRect>;

type Ctx = CanvasRenderingContext2D;
const S = ATLAS_SIZE / ATLAS_GRID; // 128 px per cell

function leaf(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, shade: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  const g = Math.round(150 + 105 * shade);
  ctx.fillStyle = `rgb(${g},${g},${g})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,90,90,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ry * 0.9);
  ctx.lineTo(0, -ry * 0.9);
  ctx.stroke();
  ctx.restore();
}

function hashf(i: number, j: number): number {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawBroadleaf(ctx: Ctx): void {
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hashf(i, 1) * 0.5;
    const r = 18 + hashf(i, 2) * 34;
    leaf(ctx, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r * 0.95, 9 + hashf(i, 3) * 5, 16 + hashf(i, 4) * 8, a + Math.PI / 2 + hashf(i, 5) * 0.8, 0.45 + hashf(i, 6) * 0.55);
  }
}

function lobedLeaf(ctx: Ctx, x: number, y: number, r: number, rot: number, shade: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) {
    const t = (k / 40) * Math.PI * 2;
    const rad = r * (0.55 + 0.45 * Math.abs(Math.cos(t * 2.5)));
    const px = Math.cos(t) * rad, py = Math.sin(t) * rad;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = Math.round(150 + 105 * shade);
  ctx.fillStyle = `rgb(${g},${g},${g})`;
  ctx.fill();
  ctx.restore();
}

function drawMaple(ctx: Ctx): void {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hashf(i, 7) * 0.6;
    const r = 14 + hashf(i, 8) * 34;
    lobedLeaf(ctx, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 16 + hashf(i, 9) * 9, hashf(i, 10) * Math.PI, 0.4 + hashf(i, 11) * 0.6);
  }
}

function drawTropical(ctx: Ctx): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hashf(i, 12) * 0.4;
    const r = 12 + hashf(i, 13) * 20;
    leaf(ctx, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 13 + hashf(i, 14) * 6, 38 + hashf(i, 15) * 14, a + Math.PI / 2, 0.45 + hashf(i, 16) * 0.5);
  }
}

function drawNeedle(ctx: Ctx): void {
  // Conical evergreen silhouette made of needle strokes: works both as a sprig card and a whole-tree medium-LOD card.
  ctx.lineCap = 'round';
  for (let row = 0; row < 14; row++) {
    const y = 12 + row * 8;
    const half = 6 + row * 4;
    const count = 4 + row * 2;
    for (let k = 0; k < count; k++) {
      const x = S / 2 - half + (k / (count - 1)) * half * 2;
      const shade = 0.5 + hashf(row, k) * 0.5;
      const g = Math.round(140 + 115 * shade);
      ctx.strokeStyle = `rgb(${g},${g},${g})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (hashf(k, row) - 0.5) * 6, y + 9 + hashf(row + 3, k) * 5);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgb(120,105,90)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(S / 2, 14);
  ctx.lineTo(S / 2, S - 4);
  ctx.stroke();
}

function frond(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, shade: number): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const g = Math.round(150 + 105 * shade);
  ctx.strokeStyle = `rgb(${g},${g},${g})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const n = Math.floor(len / 4);
  ctx.lineWidth = 1.8;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cx = x0 + dx * t, cy = y0 + dy * t;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 2;
    ctx.beginPath();
    ctx.moveTo(cx + px * w, cy + py * w + w * 0.35);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - px * w, cy - py * w + w * 0.35);
    ctx.stroke();
  }
}

function drawPalm(ctx: Ctx): void {
  frond(ctx, S / 2, S - 6, S / 2, 8, 24, 0.8);
}

function drawPalmCrown(ctx: Ctx): void {
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI + (i / 8) * Math.PI;
    frond(ctx, S / 2, S * 0.55, S / 2 + Math.cos(a) * 56, S * 0.55 + Math.sin(a) * 50 + 14, 12, 0.45 + hashf(i, 17) * 0.55);
  }
  ctx.strokeStyle = 'rgb(120,105,90)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(S / 2, S * 0.55);
  ctx.lineTo(S / 2, S - 4);
  ctx.stroke();
}

function drawFlower(ctx: Ctx): void {
  const cx = S / 2, cy = S / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 17, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(245,245,245)';
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fillStyle = 'rgb(255,215,90)';
  ctx.fill();
}

function drawGrass(ctx: Ctx): void {
  for (let i = 0; i < 7; i++) {
    const x0 = 22 + i * 14 + hashf(i, 18) * 6;
    const lean = (hashf(i, 19) - 0.5) * 40;
    const g = Math.round(150 + 105 * (0.4 + hashf(i, 20) * 0.6));
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.beginPath();
    ctx.moveTo(x0 - 4, S - 4);
    ctx.quadraticCurveTo(x0 + lean * 0.5, S * 0.5, x0 + lean, 10 + hashf(i, 21) * 20);
    ctx.quadraticCurveTo(x0 + lean * 0.5 + 3, S * 0.5, x0 + 4, S - 4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawShrub(ctx: Ctx): void {
  for (let i = 0; i < 40; i++) {
    const a = hashf(i, 22) * Math.PI * 2;
    const r = Math.sqrt(hashf(i, 23)) * 52;
    leaf(ctx, S / 2 + Math.cos(a) * r, S / 2 + 6 + Math.sin(a) * r * 0.85, 6 + hashf(i, 24) * 4, 10 + hashf(i, 25) * 6, hashf(i, 26) * Math.PI, 0.35 + hashf(i, 27) * 0.65);
  }
}

function drawCrop(ctx: Ctx): void {
  // Cereal-like stalk: stem, two leaves and a seed head near the top.
  ctx.strokeStyle = 'rgb(200,200,200)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(S / 2, S - 4);
  ctx.lineTo(S / 2 + 4, 26);
  ctx.stroke();
  leaf(ctx, S / 2 - 14, S * 0.62, 6, 26, 0.6, 0.8);
  leaf(ctx, S / 2 + 16, S * 0.5, 6, 24, -0.7, 0.7);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    leaf(ctx, S / 2 + 2 + (i % 2 ? 7 : -7), 20 + t * 34, 5, 8, (i % 2 ? -1 : 1) * 0.5, 0.9);
  }
}

function drawTwigs(ctx: Ctx): void {
  ctx.strokeStyle = 'rgb(210,200,190)';
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    ctx.lineWidth = Math.max(1, 3 - depth);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (depth < 3) {
      branch(x1, y1, ang - 0.5 - hashf(depth, len) * 0.3, len * 0.66, depth + 1);
      branch(x1, y1, ang + 0.5 + hashf(len, depth) * 0.3, len * 0.66, depth + 1);
    }
  };
  branch(S / 2, S - 6, -Math.PI / 2, 40, 0);
}

function drawSucculent(ctx: Ctx): void {
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
    ctx.save();
    ctx.translate(S / 2, S - 8);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(0, -60 - hashf(i, 28) * 30);
    ctx.lineTo(9, 0);
    ctx.closePath();
    const g = Math.round(160 + 90 * hashf(i, 29));
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fill();
    ctx.restore();
  }
}

function drawSolid(ctx: Ctx): void {
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, S, S);
}

const DRAWERS: Record<AtlasCell, (ctx: Ctx) => void> = {
  broadleaf: drawBroadleaf, maple: drawMaple, tropical: drawTropical, needle: drawNeedle, palm: drawPalm, palmCrown: drawPalmCrown,
  flower: drawFlower, grass: drawGrass, shrub: drawShrub, crop: drawCrop, twigs: drawTwigs, succulent: drawSucculent, solid: drawSolid,
};

/**
 * Builds the atlas canvas, or returns null when `document`/2D canvas is unavailable (Node tests, workers without
 * OffscreenCanvas support).
 */
export function buildLeafAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = ATLAS_SIZE;
    canvas.height = ATLAS_SIZE;
  } catch {
    return null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.ellipse !== 'function') return null;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (const key of Object.keys(CELL_INDEX) as AtlasCell[]) {
    const [cx, cy] = CELL_INDEX[key];
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx * S, cy * S, S, S);
    ctx.clip();
    ctx.translate(cx * S, cy * S);
    DRAWERS[key](ctx);
    ctx.restore();
  }
  return canvas;
}
