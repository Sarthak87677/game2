/**
 * Impostor LOD for tiles between the full-detail radius and three times it: one billboard per tree placement using
 * a few procedurally drawn greyscale sprites (broadleaf, needle, palm, bare) tinted per instance with the species'
 * seasonal leaf colour. Sprites are shared through Billboard.setImage ids so the collection's texture atlas stays
 * tiny. Sized in metres, depth-tested, hidden as soon as the full tile is built.
 */
import { BillboardCollection, Cartesian3, Color, Matrix4, NearFarScalar, VerticalOrigin } from 'cesium';
import type { NearFieldTile, Placement, Species } from '@/world/procedural/types';
import { leafBaseColour, nominalHeight } from './geometry/common';
import { parseColour, type RGB } from './geometry/colour';
import type { SpeciesLookup } from './tileMesh';

export type SpriteKind = 'broadleaf' | 'needle' | 'palm' | 'bare';

export const SPRITE_W = 64;
export const SPRITE_H = 96;

/** Sprite shape for a placement (bare when the tree has dropped its leaves). */
export function spriteKindFor(species: Species, placement: Placement): SpriteKind {
  if (species.leafType === 'palm' || species.kind === 'palm') return 'palm';
  if (species.leafType === 'needle') return placement.leafOn < 0.15 ? 'bare' : 'needle';
  if (species.leafType === 'none' || placement.leafOn < 0.15) return 'bare';
  return 'broadleaf';
}

/** Tint applied to the sprite: seasonal leaf colour, or the trunk colour for bare trees. */
export function impostorTint(species: Species, placement: Placement): RGB {
  return spriteKindFor(species, placement) === 'bare' ? parseColour(species.trunkColour, [96, 78, 60]) : leafBaseColour(species, placement);
}

/** Placements that get an impostor: trees/palms/cacti, capped deterministically by variant order. */
export function selectImpostorPlacements(tile: NearFieldTile, lookup: SpeciesLookup, max: number): { placement: Placement; species: Species }[] {
  const out: { placement: Placement; species: Species }[] = [];
  for (const p of tile.placements) {
    const s = lookup(p.species);
    if (!s) continue;
    if (s.kind === 'tree' || s.kind === 'palm' || (s.kind === 'cactus' && (s.heightM[1] > 2))) out.push({ placement: p, species: s });
  }
  if (out.length <= max) return out;
  out.sort((a, b) => a.placement.variant - b.placement.variant);
  return out.slice(0, max);
}

function drawSprite(kind: SpriteKind, ctx: CanvasRenderingContext2D): void {
  const w = SPRITE_W, h = SPRITE_H;
  ctx.clearRect(0, 0, w, h);
  const trunk = kind === 'bare' ? 'rgb(235,225,215)' : 'rgb(90,70,52)';
  ctx.fillStyle = trunk;
  if (kind === 'palm') ctx.fillRect(w / 2 - 2, 28, 4, h - 28);
  else if (kind === 'needle') ctx.fillRect(w / 2 - 2, h - 18, 4, 18);
  else ctx.fillRect(w / 2 - 4, h * 0.55, 8, h * 0.45);
  if (kind === 'bare') {
    ctx.strokeStyle = trunk;
    ctx.lineCap = 'round';
    const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
      const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
      ctx.lineWidth = Math.max(1, 4 - depth);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
      if (depth < 4) { branch(x1, y1, ang - 0.45, len * 0.68, depth + 1); branch(x1, y1, ang + 0.5, len * 0.66, depth + 1); }
    };
    branch(w / 2, h * 0.58, -Math.PI / 2, 22, 0);
    return;
  }
  const blob = (x: number, y: number, r: number, g: number) => {
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, `rgb(${g + 30},${g + 30},${g + 30})`);
    grad.addColorStop(1, `rgb(${g - 40},${g - 40},${g - 40})`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  if (kind === 'broadleaf') {
    blob(w / 2, h * 0.36, 25, 200);
    blob(w / 2 - 14, h * 0.44, 15, 190);
    blob(w / 2 + 14, h * 0.42, 15, 205);
    blob(w / 2, h * 0.22, 14, 215);
  } else if (kind === 'needle') {
    for (let i = 0; i < 4; i++) {
      const y0 = 8 + i * 20, half = 8 + i * 7;
      const g = 210 - i * 15;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath(); ctx.moveTo(w / 2, y0); ctx.lineTo(w / 2 + half, y0 + 26); ctx.lineTo(w / 2 - half, y0 + 26); ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + (i / 8) * Math.PI;
      const g = 170 + Math.round(((i * 37) % 10) * 7);
      ctx.strokeStyle = `rgb(${g},${g},${g})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 28);
      ctx.quadraticCurveTo(w / 2 + Math.cos(a) * 22, 28 + Math.sin(a) * 18 - 6, w / 2 + Math.cos(a) * 30, 28 + Math.sin(a) * 26 + 14);
      ctx.stroke();
    }
    blob(w / 2, 26, 7, 170);
  }
}

/** Draws (and caches) the sprite canvas for a kind; null without a 2D canvas. */
export class ImpostorSprites {
  private cache = new Map<SpriteKind, HTMLCanvasElement | null>();

  get(kind: SpriteKind): HTMLCanvasElement | null {
    if (this.cache.has(kind)) return this.cache.get(kind) ?? null;
    let canvas: HTMLCanvasElement | null = null;
    if (typeof document !== 'undefined') {
      try {
        const c = document.createElement('canvas');
        c.width = SPRITE_W;
        c.height = SPRITE_H;
        const ctx = c.getContext('2d');
        if (ctx) { drawSprite(kind, ctx); canvas = c; }
      } catch {
        canvas = null;
      }
    }
    this.cache.set(kind, canvas);
    return canvas;
  }
}

export interface ImpostorBuildOptions {
  /** Full-detail radius (m); billboards scale up slightly toward 3R to fight thinning. */
  fullRadiusM: number;
  maxBillboards?: number;
}

/**
 * Builds a BillboardCollection for a tile in its ENU frame (positions are local metres with z relative to the tile
 * anchor). Returns null when nothing qualifies or sprites cannot be drawn.
 */
export function buildImpostorCollection(tile: NearFieldTile, lookup: SpeciesLookup, modelMatrix: Matrix4, sprites: ImpostorSprites, opts: ImpostorBuildOptions): { collection: BillboardCollection; count: number } | null {
  const picks = selectImpostorPlacements(tile, lookup, opts.maxBillboards ?? 1500);
  if (picks.length === 0) return null;
  const collection = new BillboardCollection({ modelMatrix });
  const scale = new NearFarScalar(opts.fullRadiusM, 1.0, opts.fullRadiusM * 3, 1.15);
  let count = 0;
  for (const { placement, species } of picks) {
    const kind = spriteKindFor(species, placement);
    const image = sprites.get(kind);
    if (!image) continue;
    const H = nominalHeight(species, placement);
    const width = Math.max(0.5, H * Math.max(0.2, species.spread) * (kind === 'needle' ? 1.1 : 1.3));
    const tint = impostorTint(species, placement);
    const b = collection.add({
      position: new Cartesian3(placement.x, placement.y, placement.z - tile.anchorHeightM),
      sizeInMeters: true,
      width,
      height: H,
      verticalOrigin: VerticalOrigin.BOTTOM,
      color: Color.fromBytes(tint[0], tint[1], tint[2], 255),
      scaleByDistance: scale,
      disableDepthTestDistance: 0,
    });
    b.setImage(`terra-impostor-${kind}`, image);
    count++;
  }
  if (count === 0) { collection.destroy(); return null; }
  return { collection, count };
}
