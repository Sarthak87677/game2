/**
 * Biome classification from Köppen class, elevation, precipitation and surface hints. Biomes drive vegetation
 * libraries, ground materials and the offline base map. All output is INFERRED — the app labels it as such.
 */
import type { KoppenClass } from './koppen';

export type Biome =
  | 'tropical_rainforest' | 'tropical_seasonal_forest' | 'savanna' | 'hot_desert' | 'cold_desert' | 'steppe' | 'mediterranean'
  | 'temperate_deciduous_forest' | 'temperate_rainforest' | 'temperate_grassland' | 'boreal_forest' | 'tundra' | 'alpine'
  | 'ice_sheet' | 'mangrove' | 'wetland' | 'ocean' | 'lake';

export interface BiomeInput {
  koppen: KoppenClass;
  elevationM: number;
  annualPrecipMm: number;
  annualMeanTempC: number;
  lat: number;
  isWater?: boolean;
  isGlaciated?: boolean;
  /** Free-form hint such as 'lake', 'mangrove', 'wetland', 'farmland'. */
  landCoverHint?: string;
}

export interface BiomeInfo {
  label: string;
  description: string;
  groundPalette: { base: string; secondary: string };
  treeDensity: number;
  grassDensity: number;
}

/** Approximate climatic treeline height (m) as a function of latitude: ~3500–4000 m in the tropics, sea level near 70°. */
export function treelineM(lat: number): number {
  const a = Math.abs(lat);
  if (a >= 70) return 0;
  return Math.max(0, 3900 - Math.max(0, a - 10) * 65);
}

export function classifyBiome(i: BiomeInput): Biome {
  if (i.isGlaciated) return 'ice_sheet';
  if (i.isWater) return i.landCoverHint === 'lake' ? 'lake' : 'ocean';
  const k = i.koppen;
  const hint = i.landCoverHint ?? '';
  if (hint === 'mangrove') return 'mangrove';
  if (hint === 'wetland') return 'wetland';
  if (k === 'EF') return 'ice_sheet';
  if (k === 'ET') return i.elevationM > 1200 && Math.abs(i.lat) < 66 ? 'alpine' : 'tundra';
  // High mountains above the local treeline are alpine regardless of the lowland class.
  if (i.elevationM > treelineM(i.lat) && Math.abs(i.lat) < 70) return 'alpine';
  const g = k[0];
  if (g === 'A') {
    if (k === 'Af') return 'tropical_rainforest';
    if (k === 'Am') return i.annualPrecipMm > 2000 ? 'tropical_rainforest' : 'tropical_seasonal_forest';
    return i.annualPrecipMm > 1300 ? 'tropical_seasonal_forest' : 'savanna';
  }
  if (g === 'B') {
    if (k === 'BWh') return 'hot_desert';
    if (k === 'BWk') return 'cold_desert';
    if (k === 'BSh') return i.annualMeanTempC > 20 ? 'savanna' : 'steppe';
    return 'steppe';
  }
  if (g === 'C') {
    // Hot winter-dry subtropics (Indo-Gangetic plain, Sahel margins, southern China lowlands) carry tropical dry
    // deciduous forest or savanna, not temperate broadleaf forest, whatever the latitude.
    if (k[1] === 'w' && i.annualMeanTempC > 18) return i.annualPrecipMm > 1000 ? 'tropical_seasonal_forest' : 'savanna';
    // Tropical highlands (East African plateau, Deccan, Andean valleys) classify as C* but carry tropical vegetation.
    if (Math.abs(i.lat) < 23.5 && i.annualMeanTempC > 12) {
      if (k[1] === 's') return 'mediterranean';
      if (i.annualPrecipMm > 1600) return 'tropical_rainforest';
      return i.annualPrecipMm > 1000 ? 'tropical_seasonal_forest' : 'savanna';
    }
    if (k === 'Csa' || k === 'Csb' || k === 'Csc') return 'mediterranean';
    if (k === 'Cwa') return i.annualPrecipMm > 1400 ? 'tropical_seasonal_forest' : i.annualPrecipMm > 800 ? 'temperate_deciduous_forest' : 'savanna';
    if (k === 'Cwb' || k === 'Cwc') return i.annualPrecipMm > 900 ? 'temperate_deciduous_forest' : 'temperate_grassland';
    if (k === 'Cfa') return i.annualPrecipMm > 1800 ? 'temperate_rainforest' : i.annualPrecipMm > 700 ? 'temperate_deciduous_forest' : 'temperate_grassland';
    if (k === 'Cfb' || k === 'Cfc') return i.annualPrecipMm > 1600 ? 'temperate_rainforest' : i.annualPrecipMm > 550 ? 'temperate_deciduous_forest' : 'temperate_grassland';
  }
  if (g === 'D') {
    const sub = k[2];
    if (sub === 'c' || sub === 'd') return 'boreal_forest';
    if (i.annualPrecipMm < 450) return 'temperate_grassland';
    return i.annualMeanTempC < 3 ? 'boreal_forest' : 'temperate_deciduous_forest';
  }
  return 'temperate_grassland';
}

export const BIOME_INFO: Record<Biome, BiomeInfo> = {
  ocean: { label: 'Ocean', description: 'Open sea; depth-shaded water surface.', groundPalette: { base: '#12345c', secondary: '#1b4a76' }, treeDensity: 0, grassDensity: 0 },
  lake: { label: 'Lake', description: 'Inland freshwater body.', groundPalette: { base: '#2a5b86', secondary: '#35719f' }, treeDensity: 0, grassDensity: 0 },
  tropical_rainforest: { label: 'Tropical rainforest', description: 'Hot and wet year-round; dense evergreen broadleaf canopy, lianas, epiphytes.', groundPalette: { base: '#1f5a24', secondary: '#2f7a2c' }, treeDensity: 1, grassDensity: 0.3 },
  tropical_seasonal_forest: { label: 'Tropical seasonal (monsoon) forest', description: 'Hot with a marked dry season; semi-deciduous forest, teak, sal, bamboo.', groundPalette: { base: '#3e7a2f', secondary: '#6b8d3a' }, treeDensity: 0.8, grassDensity: 0.5 },
  savanna: { label: 'Savanna', description: 'Tropical grassland with scattered acacias, baobabs and palms.', groundPalette: { base: '#a89a4c', secondary: '#c2b168' }, treeDensity: 0.15, grassDensity: 0.9 },
  hot_desert: { label: 'Hot desert', description: 'Arid, sparse succulents and shrubs; sand, gravel and bare rock.', groundPalette: { base: '#d8b978', secondary: '#c9a25f' }, treeDensity: 0.01, grassDensity: 0.05 },
  cold_desert: { label: 'Cold desert', description: 'Arid with cold winters; saltbush, sagebrush, gravel plains.', groundPalette: { base: '#b8a98a', secondary: '#9f9075' }, treeDensity: 0.02, grassDensity: 0.15 },
  steppe: { label: 'Steppe / semi-arid', description: 'Short grasses and drought-tolerant shrubs; seasonal streams.', groundPalette: { base: '#b3a565', secondary: '#9c9a58' }, treeDensity: 0.05, grassDensity: 0.7 },
  mediterranean: { label: 'Mediterranean', description: 'Dry summers, mild wet winters; olives, cypress, pines, maquis scrub.', groundPalette: { base: '#8f9a55', secondary: '#b3a672' }, treeDensity: 0.35, grassDensity: 0.55 },
  temperate_deciduous_forest: { label: 'Temperate deciduous forest', description: 'Four seasons; oak, beech, maple, birch with autumn colour and spring blossom.', groundPalette: { base: '#4d7d38', secondary: '#7a9648' }, treeDensity: 0.85, grassDensity: 0.6 },
  temperate_rainforest: { label: 'Temperate rainforest', description: 'Cool and very wet; giant conifers, ferns, moss.', groundPalette: { base: '#2f6a3d', secondary: '#4b7d4a' }, treeDensity: 1, grassDensity: 0.4 },
  temperate_grassland: { label: 'Temperate grassland / prairie', description: 'Tall grasses, wildflowers, occasional trees along rivers.', groundPalette: { base: '#8fa653', secondary: '#b5b26a' }, treeDensity: 0.08, grassDensity: 1 },
  boreal_forest: { label: 'Boreal forest (taiga)', description: 'Long cold winters; spruce, fir, larch, birch over moss and lichen.', groundPalette: { base: '#3b6236', secondary: '#5d7b4b' }, treeDensity: 0.75, grassDensity: 0.35 },
  tundra: { label: 'Tundra', description: 'Treeless; mosses, lichens, dwarf willow and sedges over permafrost.', groundPalette: { base: '#8f9a7a', secondary: '#a9a58c' }, treeDensity: 0, grassDensity: 0.4 },
  alpine: { label: 'Alpine', description: 'Above the treeline: meadows, scree, snowfields and glaciers.', groundPalette: { base: '#8c8f80', secondary: '#b1ae9b' }, treeDensity: 0, grassDensity: 0.3 },
  ice_sheet: { label: 'Ice sheet / polar desert', description: 'Permanent ice and snow; no vegetation.', groundPalette: { base: '#e9eef5', secondary: '#d6dfea' }, treeDensity: 0, grassDensity: 0 },
  mangrove: { label: 'Mangrove', description: 'Tidal saltwater forest on tropical coasts.', groundPalette: { base: '#4f6f3e', secondary: '#6c7d55' }, treeDensity: 0.9, grassDensity: 0.1 },
  wetland: { label: 'Wetland', description: 'Marsh, swamp or floodplain; reeds, sedges, water-tolerant trees.', groundPalette: { base: '#5f8a5a', secondary: '#7f9a6d' }, treeDensity: 0.3, grassDensity: 0.9 },
};
