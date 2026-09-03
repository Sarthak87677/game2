/** Helpers shared by the vegetation builders: seeded RNGs per placement, sizes, phenology colours, atlas cells. */
import { fnv1a, mixSeed, Rng } from '@/util/hash';
import type { Placement, Species } from '@/world/procedural/types';
import { mixColour, parseColour, type RGB } from './colour';
import type { AtlasCell } from '../leafAtlas';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic 32-bit seed for one placement of a species and a named layer. */
export function placementSeed(species: Species, placement: Placement, layer: string): number {
  return mixSeed(fnv1a(species.id), Math.floor(clamp(placement.variant, 0, 1) * 4294967295), fnv1a(layer));
}

/** Seeded RNG for one placement (every random decision of a builder comes from here so tiles regenerate identically). */
export function placementRng(species: Species, placement: Placement, layer: string): Rng {
  return new Rng(placementSeed(species, placement, layer));
}

/** Height in metres: the species' nominal (mid-range) height times the placement scale. */
export function nominalHeight(species: Species, placement: Placement): number {
  const mid = (species.heightM[0] + species.heightM[1]) / 2;
  return Math.max(0.05, mid * (placement.scale > 0 ? placement.scale : 1));
}

/** Foliage colour for the placement's phenology: leaf colour lerped toward the autumn colour by (1 - leafOn). */
export function leafBaseColour(species: Species, placement: Placement, autumnFallback: RGB = [156, 112, 48]): RGB {
  const leaf = parseColour(species.leafColour, [70, 120, 50]);
  const autumn = species.autumnColour ? parseColour(species.autumnColour, autumnFallback) : mixColour(leaf, autumnFallback, 0.7);
  return mixColour(leaf, autumn, 1 - clamp(placement.leafOn, 0, 1));
}

/** True when a species lists tropical biomes with meaningful weight (drives broad-leaf card choice). */
export function isTropical(species: Species): boolean {
  const b = species.biomes;
  return (b.tropical_rainforest ?? 0) + (b.tropical_seasonal_forest ?? 0) + (b.mangrove ?? 0) > 0.3;
}

/** Atlas cell used for a broadleaf species' leaf clusters. */
export function leafCellFor(species: Species): AtlasCell {
  const id = species.id.toLowerCase();
  if (/maple|sycamore|plane|acer|liquidambar/.test(id)) return 'maple';
  if (isTropical(species) || /banana|fig|mango|teak|breadfruit/.test(id)) return 'tropical';
  return 'broadleaf';
}
