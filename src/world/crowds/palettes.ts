/**
 * Regional clothing palettes for procedural pedestrians (colour sets only — no real people, no branded uniforms).
 * Sarees, kurtas, salwar-kameez, shirts/trousers and generic school uniforms are described as top/bottom/accent
 * colours plus a silhouette kind used by the sprite painter.
 */
import type { Rng } from '@/util/hash';

export type OutfitKind = 'saree' | 'kurta' | 'salwar' | 'shirt' | 'uniform' | 'dhoti' | 'tshirt';

export interface Outfit {
  kind: OutfitKind;
  top: string;
  bottom: string;
  accent: string;
}

export type PaletteId = 'city' | 'village' | 'campus' | 'temple' | 'coast' | 'station' | 'market';

const SAREE = ['#c2185b', '#e64a19', '#7b1fa2', '#00796b', '#1565c0', '#f9a825', '#ad1457', '#2e7d32', '#d84315', '#6a1b9a'];
const GOLD = ['#f2c14e', '#e8b04a', '#d9a03d'];
const KURTA = ['#f5f0e6', '#efe6d0', '#dfe8ef', '#e8dcc8', '#f7f3ea', '#cfe0d6', '#e6d6e8', '#f0e4cc'];
const SALWAR = ['#ef6c00', '#8e24aa', '#00838f', '#c62828', '#558b2f', '#3949ab', '#f06292', '#ffb300'];
const SHIRT = ['#ffffff', '#e3f2fd', '#e8f5e9', '#fff3e0', '#ede7f6', '#b0bec5', '#90a4ae', '#546e7a', '#37474f'];
const TROUSER = ['#263238', '#37474f', '#3e2723', '#455a64', '#1a237e', '#212121', '#5d4037'];
const DHOTI = ['#f5f5f0', '#efebe0', '#e0dccf'];
const TSHIRT = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#00acc1', '#ff7043', '#eceff1'];
const UNIFORM_TOP = ['#ffffff', '#e3f2fd'];
const UNIFORM_BOTTOM = ['#1a237e', '#283593', '#0d47a1'];

export const SKIN_TONES = ['#c68642', '#8d5524', '#a0673f', '#b57a4d', '#7a4a2a', '#d9a577', '#6b3f22'];
export const HAIR = '#1a1210';

/** Relative weights of outfit kinds per palette (sum need not be 1). */
const MIX: Record<PaletteId, Partial<Record<OutfitKind, number>>> = {
  city: { saree: 2, kurta: 1.5, salwar: 2, shirt: 4, tshirt: 2.5, dhoti: 0.2 },
  village: { saree: 4, kurta: 2.5, salwar: 1.5, shirt: 2, tshirt: 1, dhoti: 1.5 },
  campus: { uniform: 6, shirt: 1.5, tshirt: 1, salwar: 0.5, kurta: 0.5 },
  temple: { saree: 4, kurta: 3, salwar: 2, shirt: 1.5, dhoti: 1.5, tshirt: 0.5 },
  coast: { saree: 2, kurta: 1.5, salwar: 2, shirt: 2, tshirt: 3, dhoti: 0.5 },
  station: { saree: 2, kurta: 1.5, salwar: 2, shirt: 4, tshirt: 2, dhoti: 0.3 },
  market: { saree: 3, kurta: 2, salwar: 2.5, shirt: 2.5, tshirt: 1.5, dhoti: 0.8 },
};

export function pickOutfitKind(palette: PaletteId, rng: Rng): OutfitKind {
  const mix = MIX[palette];
  const kinds = Object.keys(mix) as OutfitKind[];
  const total = kinds.reduce((a, k) => a + (mix[k] ?? 0), 0);
  let r = rng.next() * total;
  for (const k of kinds) { r -= mix[k] ?? 0; if (r <= 0) return k; }
  return kinds[kinds.length - 1];
}

export function outfitFor(palette: PaletteId, rng: Rng): Outfit {
  const kind = pickOutfitKind(palette, rng);
  switch (kind) {
    case 'saree': return { kind, top: rng.pick(SAREE), bottom: rng.pick(SAREE), accent: rng.pick(GOLD) };
    case 'kurta': return { kind, top: rng.pick(KURTA), bottom: rng.pick(KURTA), accent: rng.pick(TROUSER) };
    case 'salwar': { const c = rng.pick(SALWAR); return { kind, top: c, bottom: rng.next() < 0.5 ? c : rng.pick(SALWAR), accent: rng.pick(GOLD) }; }
    case 'shirt': return { kind, top: rng.pick(SHIRT), bottom: rng.pick(TROUSER), accent: '#222' };
    case 'uniform': return { kind, top: rng.pick(UNIFORM_TOP), bottom: rng.pick(UNIFORM_BOTTOM), accent: '#c62828' };
    case 'dhoti': return { kind, top: rng.pick(KURTA), bottom: rng.pick(DHOTI), accent: rng.pick(GOLD) };
    case 'tshirt': return { kind, top: rng.pick(TSHIRT), bottom: rng.pick(TROUSER), accent: '#222' };
  }
}

/** Number of distinct outfit variants painted per palette (sprite cache size). */
export const VARIANTS_PER_PALETTE = 12;
