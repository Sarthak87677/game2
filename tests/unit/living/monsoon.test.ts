import { describe, expect, it } from 'vitest';
import { inMonsoonRegion, monsoonPhase, pickSeasonWeather, seasonPreset } from '@/world/climate/monsoon';

describe('Maharashtra monsoon preset', () => {
  it('maps months to phases', () => {
    expect(monsoonPhase(0)).toBe('winter');
    expect(monsoonPhase(1)).toBe('dry');
    expect(monsoonPhase(3)).toBe('dry');
    expect(monsoonPhase(4, 10)).toBe('dry');
    expect(monsoonPhase(4, 28)).toBe('pre-monsoon');
    expect(monsoonPhase(5, 3)).toBe('pre-monsoon');
    expect(monsoonPhase(5, 20)).toBe('monsoon');
    expect(monsoonPhase(6)).toBe('monsoon');
    expect(monsoonPhase(8)).toBe('monsoon');
    expect(monsoonPhase(9)).toBe('retreat');
    expect(monsoonPhase(10)).toBe('winter');
    expect(monsoonPhase(11)).toBe('winter');
  });

  it('applies only inside the Maharashtra box', () => {
    expect(inMonsoonRegion(18.94, 72.83)).toBe(true); // Mumbai
    expect(inMonsoonRegion(21.13, 79.07)).toBe(true); // Nagpur
    expect(inMonsoonRegion(27.17, 78.04)).toBe(false); // Agra
    expect(seasonPreset(new Date('2026-07-15T06:00:00Z'), 27.17, 78.04)).toBeNull();
    expect(seasonPreset(new Date('2026-07-15T06:00:00Z'), 17.92, 73.66)?.phase).toBe('monsoon');
  });

  it('monsoon is wet and green, the dry season browns', () => {
    const mon = seasonPreset(new Date('2026-08-01T06:00:00Z'), 18.5, 73.85)!;
    const dry = seasonPreset(new Date('2026-04-01T06:00:00Z'), 18.5, 73.85)!;
    expect(mon.greenness).toBeGreaterThan(dry.greenness);
    expect(mon.browning).toBe(0);
    expect(dry.browning).toBeGreaterThan(0.5);
    expect(mon.rainChance + mon.stormChance).toBeGreaterThan(0.8);
    expect(dry.rainChance).toBeLessThan(0.1);
  });

  it('picks mostly rain in the monsoon, deterministically per 6-hour block, with hill fog', () => {
    const preset = seasonPreset(new Date('2026-07-10T00:00:00Z'), 17.92, 73.66)!;
    const wet = new Set<string>();
    let rainy = 0, foggy = 0;
    for (let b = 0; b < 120; b++) {
      const date = new Date(Date.UTC(2026, 6, 1 + Math.floor(b / 4), (b % 4) * 6));
      const pick = pickSeasonWeather(preset, date, 17.92, 73.66, 1300);
      const again = pickSeasonWeather(preset, date, 17.92, 73.66, 1300);
      expect(again.condition).toBe(pick.condition);
      expect(again.blockKey).toBe(pick.blockKey);
      wet.add(pick.condition);
      if (pick.condition === 'rain' || pick.condition === 'storm') rainy++;
      if (pick.condition === 'fog' || pick.condition === 'mist') foggy++;
    }
    expect(rainy / 120).toBeGreaterThan(0.6);
    expect(foggy).toBeGreaterThan(0);
    expect(wet.has('snow')).toBe(false);
    expect(wet.has('dust')).toBe(false);
  });

  it('dry season never picks rain-heavy blocks more than occasionally and can pick dust', () => {
    const preset = seasonPreset(new Date('2026-04-10T00:00:00Z'), 21.13, 79.07)!;
    let rainy = 0, dusty = 0;
    for (let b = 0; b < 120; b++) {
      const date = new Date(Date.UTC(2026, 3, 1 + Math.floor(b / 4), (b % 4) * 6));
      const c = pickSeasonWeather(preset, date, 21.13, 79.07, 300).condition;
      if (c === 'rain' || c === 'storm') rainy++;
      if (c === 'dust') dusty++;
    }
    expect(rainy / 120).toBeLessThan(0.15);
    expect(dusty).toBeGreaterThan(0);
  });
});
