import { describe, expect, it } from 'vitest';
import { urbanDensityFromPlaces } from '@/world/nearField/contextBuilder';
import { WorldMap, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH, CLIMATE_GRID_HEIGHT, CLIMATE_GRID_WIDTH, type WorldMapData } from '@/world/worldMap';

describe('urban density inference', () => {
  const places = [{ lat: 40.71, lon: -74.0, pop: 19_000_000 }, { lat: 30.9, lon: 75.85, pop: 1_600_000 }, { lat: 31.1, lon: 75.6, pop: 4000 }];
  it('is high in a megacity core and decays with distance', () => {
    const core = urbanDensityFromPlaces(places, 40.75, -73.98);
    const suburb = urbanDensityFromPlaces(places, 41.05, -73.7);
    const far = urbanDensityFromPlaces(places, 43.0, -76.0);
    expect(core).toBeGreaterThan(0.6);
    expect(suburb).toBeLessThan(core);
    expect(far).toBe(0);
  });
  it('gives rural farmland a low but non-zero density near a village', () => {
    expect(urbanDensityFromPlaces(places, 31.11, 75.61)).toBeGreaterThan(0.05);
    expect(urbanDensityFromPlaces(places, 31.11, 75.61)).toBeLessThan(0.4);
  });
});

describe('WorldMap sampling', () => {
  const w = WORLD_MAP_WIDTH, h = WORLD_MAP_HEIGHT;
  const data: WorldMapData = {
    width: w, height: h, surface: new Uint8Array(w * h), elevation: new Int16Array(w * h), biome: new Uint8Array(w * h), koppen: new Uint8Array(w * h),
    annualTemp: new Int8Array(w * h), annualPrecip: new Uint16Array(w * h), distCoast: new Uint16Array(w * h),
    monthlyTemp: new Float32Array(CLIMATE_GRID_WIDTH * CLIMATE_GRID_HEIGHT * 12).fill(20), monthlyPrecip: new Float32Array(CLIMATE_GRID_WIDTH * CLIMATE_GRID_HEIGHT * 12).fill(50), hasElevation: true, buildMs: 0,
  };
  const map = new WorldMap(data);
  const i = map.index(10, 10);
  data.surface[i] = 1; data.biome[i] = 9; data.elevation[i] = 1000;
  it('falls back to the nearest land cell when asked', () => {
    // one cell east of the land cell is ocean
    const lonEast = 10 + 360 / w;
    expect(map.sample(10, lonEast).surface).toBe('ocean');
    expect(map.sample(10, lonEast, true).surface).toBe('land');
    expect(map.sample(10, lonEast, true).biome).toBe('temperate_deciduous_forest');
  });
  it('applies the lapse rate to monthly temperatures', () => {
    expect(map.sample(10, 10).monthlyTempC[0]).toBeCloseTo(20 - 6.5, 1);
  });
});
