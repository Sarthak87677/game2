/**
 * Procedural pedestrian sprites: tiny canvas figures (24×48 px) painted from an outfit palette, four walk-cycle
 * frames each. Billboards swap frames at ~6 fps for a simple procedural walk animation. No photographs, no real
 * people — abstract figures only.
 */
import { Rng, mixSeed } from '@/util/hash';
import { HAIR, SKIN_TONES, VARIANTS_PER_PALETTE, outfitFor, type Outfit, type PaletteId } from './palettes';

export const SPRITE_W = 24;
export const SPRITE_H = 48;
export const WALK_FRAMES = 4;
/** Frame index used while standing still. */
export const STAND_FRAME = 1;

export interface SpriteSet {
  /** Image ids registered in the billboard atlas, one per walk frame. */
  ids: string[];
  canvases: HTMLCanvasElement[];
  outfit: Outfit;
}

/** Leg/arm swing per frame (pixels). */
const SWING = [-3, 0, 3, 0];

function paintFrame(ctx: CanvasRenderingContext2D, outfit: Outfit, skin: string, frame: number, tall: number): void {
  const w = SPRITE_W, h = SPRITE_H;
  ctx.clearRect(0, 0, w, h);
  const s = SWING[frame % WALK_FRAMES];
  const cx = w / 2;
  const headR = 3.6;
  const headY = 6 + (1 - tall) * 3;
  const shoulderY = headY + headR + 2;
  const hipY = shoulderY + 14;
  const footY = h - 2;
  // Legs (drawn first so tops overlap them).
  const drawLeg = (dx: number, colour: string, width: number) => {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 3, hipY); ctx.lineTo(cx - 3 + dx, footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 3, hipY); ctx.lineTo(cx + 3 - dx, footY); ctx.stroke();
  };
  const trouserColour = outfit.kind === 'uniform' ? skin : outfit.bottom;
  if (outfit.kind === 'saree' || outfit.kind === 'dhoti') {
    // Long drape: trapezoid from the hips to the ankles, swaying slightly with the step.
    ctx.fillStyle = outfit.bottom;
    ctx.beginPath();
    ctx.moveTo(cx - 5, hipY - 2); ctx.lineTo(cx + 5, hipY - 2); ctx.lineTo(cx + 8 + s * 0.3, footY); ctx.lineTo(cx - 8 + s * 0.3, footY); ctx.closePath(); ctx.fill();
    if (outfit.kind === 'saree') { ctx.fillStyle = outfit.accent; ctx.fillRect(cx - 8 + s * 0.3, footY - 2, 16, 2); }
    // Feet peeking out.
    ctx.fillStyle = skin; ctx.fillRect(cx - 4 + s * 0.4, footY - 1, 3, 2); ctx.fillRect(cx + 1 - s * 0.4, footY - 1, 3, 2);
  } else if (outfit.kind === 'uniform') {
    ctx.fillStyle = outfit.bottom;
    ctx.fillRect(cx - 5, hipY - 2, 10, 8); // shorts / skirt
    drawLeg(s, trouserColour, 3);
    ctx.fillStyle = '#111'; ctx.fillRect(cx - 5 + s, footY - 1, 4, 2); ctx.fillRect(cx + 1 - s, footY - 1, 4, 2);
  } else {
    drawLeg(s, trouserColour, outfit.kind === 'salwar' ? 4.5 : 3.5);
    ctx.fillStyle = '#2a1e16'; ctx.fillRect(cx - 5 + s, footY - 1, 4, 2); ctx.fillRect(cx + 1 - s, footY - 1, 4, 2);
  }
  // Torso.
  const torsoBottom = outfit.kind === 'kurta' || outfit.kind === 'salwar' || outfit.kind === 'dhoti' ? hipY + 6 : hipY;
  ctx.fillStyle = outfit.top;
  ctx.beginPath();
  ctx.moveTo(cx - 5, shoulderY); ctx.lineTo(cx + 5, shoulderY); ctx.lineTo(cx + 5.5, torsoBottom); ctx.lineTo(cx - 5.5, torsoBottom); ctx.closePath(); ctx.fill();
  if (outfit.kind === 'saree') {
    // Pallu: diagonal accent band across the torso.
    ctx.strokeStyle = outfit.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + 4, shoulderY); ctx.lineTo(cx - 4, hipY - 1); ctx.stroke();
  }
  if (outfit.kind === 'salwar') {
    ctx.strokeStyle = outfit.accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 5, shoulderY + 1); ctx.lineTo(cx + 5, shoulderY + 4); ctx.stroke(); // dupatta
  }
  if (outfit.kind === 'uniform') { ctx.fillStyle = outfit.accent; ctx.fillRect(cx - 1, shoulderY + 1, 2, 5); } // tie
  // Arms (swing opposite to the legs).
  const sleeve = outfit.kind === 'tshirt' || outfit.kind === 'uniform' ? shoulderY + 5 : hipY - 2;
  ctx.strokeStyle = outfit.top; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 5, shoulderY + 1); ctx.lineTo(cx - 7 - s * 0.5, sleeve); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5, shoulderY + 1); ctx.lineTo(cx + 7 + s * 0.5, sleeve); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 7 - s * 0.5, sleeve); ctx.lineTo(cx - 7.5 - s * 0.6, hipY + 1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 7 + s * 0.5, sleeve); ctx.lineTo(cx + 7.5 + s * 0.6, hipY + 1); ctx.stroke();
  // Neck and head.
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 1.5, headY + headR - 1, 3, 3);
  ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = HAIR;
  ctx.beginPath(); ctx.arc(cx, headY - 0.8, headR, Math.PI, Math.PI * 2); ctx.fill();
  if (outfit.kind === 'saree' || outfit.kind === 'salwar') { ctx.fillRect(cx - headR, headY - 1, headR * 2, 2.5); } // longer hair line
}

/** Builds and caches sprite frame sets per palette/variant. */
export class PedestrianSprites {
  private cache = new Map<string, SpriteSet>();
  private available = typeof document !== 'undefined';

  set(palette: PaletteId, variant: number): SpriteSet | null {
    if (!this.available) return null;
    const v = ((variant % VARIANTS_PER_PALETTE) + VARIANTS_PER_PALETTE) % VARIANTS_PER_PALETTE;
    const key = `${palette}:${v}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const rng = new Rng(mixSeed(v * 7919 + 13, palette.length * 31, 4242));
    const outfit = outfitFor(palette, rng);
    const skin = rng.pick(SKIN_TONES);
    const tall = rng.range(0.85, 1.05);
    const ids: string[] = [];
    const canvases: HTMLCanvasElement[] = [];
    for (let f = 0; f < WALK_FRAMES; f++) {
      const c = document.createElement('canvas');
      c.width = SPRITE_W; c.height = SPRITE_H;
      const ctx = c.getContext('2d');
      if (!ctx) { this.available = false; return null; }
      paintFrame(ctx, outfit, skin, f, tall);
      ids.push(`ped:${key}:${f}`);
      canvases.push(c);
    }
    const set = { ids, canvases, outfit };
    this.cache.set(key, set);
    return set;
  }

  get size(): number { return this.cache.size; }
}
