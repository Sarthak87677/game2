import { describe, expect, it } from 'vitest';
import { classifyKoppen, KOPPEN_CLASSES } from '@/world/climate/koppen';
import { CLIMATE_ANCHORS } from '@/world/climate/anchors';

describe('Köppen classification', () => {
  it('classifies canonical profiles', () => {
    const flat = (t: number) => new Array(12).fill(t);
    expect(classifyKoppen(flat(27), flat(220), 0)).toBe('Af');
    expect(classifyKoppen(flat(25), flat(5), 25)).toBe('BWh');
    expect(classifyKoppen([-10, -8, -2, 6, 13, 18, 20, 18, 12, 5, -2, -8], flat(45), 55)).toBe('Dfb');
    expect(classifyKoppen(flat(-30), flat(2), -80)).toBe('EF');
    expect(classifyKoppen([-2, -2, 0, 3, 7, 9, 9, 8, 6, 3, 0, -1], flat(30), 70)).toBe('ET');
    expect(classifyKoppen([10, 11, 13, 15, 19, 23, 26, 26, 23, 19, 14, 11], [80, 60, 50, 40, 25, 8, 2, 4, 20, 60, 90, 90], 38)).toBe('Csa');
  });
  it('agrees with the published class for most anchor stations', () => {
    let agree = 0;
    let groupAgree = 0;
    for (const a of CLIMATE_ANCHORS) {
      const k = classifyKoppen(a.tempC as number[], a.precipMm as number[], a.lat);
      if (k === a.koppen) agree++;
      if (k[0] === a.koppen[0]) groupAgree++;
    }
    expect(agree / CLIMATE_ANCHORS.length).toBeGreaterThan(0.6);
    expect(groupAgree / CLIMATE_ANCHORS.length).toBeGreaterThan(0.85);
  });
  it('only ever returns known classes', () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      const t = new Array(12).fill(0).map((_, m) => 25 - Math.abs(lat) * 0.5 + Math.cos(((m - 6) / 12) * Math.PI * 2) * Math.abs(lat) * 0.3 * (lat < 0 ? -1 : 1));
      expect(KOPPEN_CLASSES).toContain(classifyKoppen(t, new Array(12).fill(50), lat));
    }
  });
});
