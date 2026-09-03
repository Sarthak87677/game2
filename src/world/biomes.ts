import type { Biome } from '@/world/climate/biome';

/**
 * Fixed, ordered biome list. Indices are stored in WorldMap rasters and GPU textures, so the ORDER IS PART OF THE
 * WORLD-GENERATION VERSION: never reorder; only append. Bump WORLD_GEN_VERSION in world/seed.ts if it changes.
 */
export const BIOME_LIST: readonly Biome[] = [
  'ocean', 'lake', 'tropical_rainforest', 'tropical_seasonal_forest', 'savanna', 'hot_desert', 'cold_desert', 'steppe',
  'mediterranean', 'temperate_deciduous_forest', 'temperate_rainforest', 'temperate_grassland', 'boreal_forest', 'tundra',
  'alpine', 'ice_sheet', 'mangrove', 'wetland',
];

export function biomeIndex(b: Biome): number {
  const i = BIOME_LIST.indexOf(b);
  return i < 0 ? 0 : i;
}
