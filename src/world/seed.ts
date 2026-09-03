import { fnv1a, mixSeed, Rng } from '@/util/hash';

/** Bump when any procedural rule changes so cached/derived content is regenerated consistently. */
export const WORLD_GEN_VERSION = 1;

/** Deterministic seed for a tile (slippy x/y/z) and a named layer, folded with the world-generation version. */
export function tileSeed(x: number, y: number, z: number, layer = 'base'): number {
  return mixSeed(WORLD_GEN_VERSION, z, x, y, fnv1a(layer));
}

export function tileRng(x: number, y: number, z: number, layer = 'base'): Rng {
  return new Rng(tileSeed(x, y, z, layer));
}

/** Seed for an arbitrary lat/lon cell at a resolution in degrees (used for non-tile-aligned features). */
export function cellSeed(lat: number, lon: number, cellDeg: number, layer = 'cell'): number {
  const cx = Math.floor((lon + 180) / cellDeg);
  const cy = Math.floor((lat + 90) / cellDeg);
  return mixSeed(WORLD_GEN_VERSION, Math.round(cellDeg * 1e6), cx, cy, fnv1a(layer));
}
