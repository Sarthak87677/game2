import { describe, expect, it } from 'vitest';
import { estimateClimate } from '@/world/climate/model';
import { CLIMATE_ANCHORS } from '@/world/climate/anchors';

const k = (lat: number, lon: number, elevationM: number, distanceToCoastKm?: number) => estimateClimate({ lat, lon, elevationM, distanceToCoastKm });

describe('climate anchors', () => {
  it('has broad coverage and valid rows', () => {
    expect(CLIMATE_ANCHORS.length).toBeGreaterThanOrEqual(200);
    const ids = new Set<string>();
    for (const a of CLIMATE_ANCHORS) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.tempC).toHaveLength(12);
      expect(a.precipMm).toHaveLength(12);
      expect(Math.abs(a.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(a.lon)).toBeLessThanOrEqual(180);
      for (const t of a.tempC) expect(t).toBeGreaterThan(-75);
      for (const p of a.precipMm) expect(p).toBeGreaterThanOrEqual(0);
    }
    const southern = CLIMATE_ANCHORS.filter((a) => a.lat < -10);
    expect(southern.length).toBeGreaterThan(30);
    const antarctic = CLIMATE_ANCHORS.filter((a) => a.lat < -60);
    expect(antarctic.length).toBeGreaterThanOrEqual(4);
  });
  it('southern hemisphere stations are warm in January', () => {
    const sydney = CLIMATE_ANCHORS.find((a) => /sydney/i.test(a.name))!;
    expect(sydney.tempC[0]).toBeGreaterThan(sydney.tempC[6]);
  });
});

describe('estimateClimate', () => {
  it('reproduces well-known Köppen classes', () => {
    expect(['Af', 'Am']).toContain(k(-3.1, -60.0, 40, 1500).koppen); // Manaus
    expect(k(30.05, 31.24, 20, 150).koppen).toBe('BWh'); // Cairo
    expect(k(51.5, -0.12, 25, 60).koppen).toBe('Cfb'); // London
    expect(k(55.75, 37.62, 150, 600).koppen).toBe('Dfb'); // Moscow
    expect(k(-78.5, 106.8, 3490, 1300).koppen).toBe('EF'); // Vostok
    expect(k(-90, 0, 2835, 1300).koppen).toBe('EF'); // South Pole
    expect(['Aw', 'Am']).toContain(k(19.07, 72.88, 10, 2).koppen); // Mumbai
    expect(['BSh', 'Cwa']).toContain(k(28.6, 77.2, 220, 900).koppen); // Delhi
    expect(k(35.68, 139.69, 10, 5).koppen).toBe('Cfa'); // Tokyo
    expect(k(-33.87, 151.21, 20, 3).koppen).toBe('Cfa'); // Sydney
    expect(['Csb', 'Csa']).toContain(k(-33.93, 18.42, 20, 3).koppen); // Cape Town
    expect(k(25.2, 55.27, 5, 3).koppen).toBe('BWh'); // Dubai
    expect(k(1.35, 103.82, 10, 3).koppen).toBe('Af'); // Singapore
    expect(k(25, 10, 400, 900).koppen).toBe('BWh'); // central Sahara
    expect(['ET', 'EF']).toContain(k(28.0, 86.85, 5000, 700).koppen); // Everest base
    expect(['Cfa', 'Dfa']).toContain(k(40.71, -74.0, 10, 5).koppen); // New York
    expect(k(48.86, 2.35, 35, 200).koppen).toBe('Cfb'); // Paris
    expect(['BSk', 'Csa', 'Dsb', 'Cfa', 'Dfb', 'Csb']).toContain(k(36.06, -112.1, 2100, 500).koppen); // Grand Canyon rim
    expect(['Cfa', 'Cfb', 'Cwa', 'Cwb']).toContain(k(-23.55, -46.63, 760, 60).koppen); // São Paulo
    expect(['Cwa', 'Cwb']).toContain(k(27.7, 85.3, 1400, 700).koppen); // Kathmandu
  });
  it('applies the lapse rate locally', () => {
    const leh = k(34.2, 77.6, 3500, 1200);
    const delhi = k(28.6, 77.2, 220, 900);
    expect(leh.annualMeanTempC).toBeLessThan(8);
    expect(delhi.annualMeanTempC - leh.annualMeanTempC).toBeGreaterThan(12);
  });
  it('confidence decreases away from anchors', () => {
    expect(k(48.86, 2.35, 35, 200).confidence).toBeGreaterThan(k(-30, -120, 0, 3000).confidence);
  });
  it('is deterministic', () => {
    expect(k(10, 10, 100, 50)).toEqual(k(10, 10, 100, 50));
  });
});
