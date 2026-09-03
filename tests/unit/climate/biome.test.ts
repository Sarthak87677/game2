import { describe, expect, it } from 'vitest';
import { classifyBiome, BIOME_INFO } from '@/world/climate/biome';
import { estimateClimate } from '@/world/climate/model';
import { BIOME_LIST } from '@/world/biomes';

const biomeAt = (lat: number, lon: number, elevationM: number, coast = 300) => {
  const c = estimateClimate({ lat, lon, elevationM, distanceToCoastKm: coast });
  return classifyBiome({ koppen: c.koppen, elevationM, annualPrecipMm: c.annualPrecipMm, annualMeanTempC: c.annualMeanTempC, lat });
};

describe('biome classification', () => {
  it('maps world regions plausibly', () => {
    expect(biomeAt(25, 10, 400, 900)).toBe('hot_desert'); // Sahara
    expect(biomeAt(-3.1, -60, 40, 1500)).toBe('tropical_rainforest'); // Amazon
    expect(biomeAt(62, 100, 200, 1500)).toBe('boreal_forest'); // Siberia
    expect(biomeAt(-85, 0, 2800, 1000)).toBe('ice_sheet'); // Antarctica interior
    expect(biomeAt(46.0, 7.7, 3200, 400)).toBe('alpine'); // Alps high
    expect(biomeAt(51.5, -0.12, 25, 60)).toBe('temperate_deciduous_forest'); // London
    expect(['steppe', 'cold_desert', 'temperate_grassland']).toContain(biomeAt(46, 105, 1300, 1500)); // Mongolia
    expect(['savanna', 'tropical_seasonal_forest']).toContain(biomeAt(-2.3, 34.8, 1500, 700)); // Serengeti
    expect(['hot_desert', 'steppe', 'savanna']).toContain(biomeAt(25.2, 55.27, 5, 3)); // Dubai
  });
  it('water and glacier hints override climate', () => {
    expect(classifyBiome({ koppen: 'Af', elevationM: 0, annualPrecipMm: 2000, annualMeanTempC: 27, lat: 0, isWater: true })).toBe('ocean');
    expect(classifyBiome({ koppen: 'Af', elevationM: 0, annualPrecipMm: 2000, annualMeanTempC: 27, lat: 0, isWater: true, landCoverHint: 'lake' })).toBe('lake');
    expect(classifyBiome({ koppen: 'Cfb', elevationM: 0, annualPrecipMm: 800, annualMeanTempC: 10, lat: 50, isGlaciated: true })).toBe('ice_sheet');
  });
  it('every biome has info and a stable index', () => {
    for (const b of BIOME_LIST) expect(BIOME_INFO[b].label.length).toBeGreaterThan(0);
    expect(BIOME_LIST[0]).toBe('ocean');
    expect(BIOME_LIST.length).toBe(Object.keys(BIOME_INFO).length);
  });
});
