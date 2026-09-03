import { describe, expect, it } from 'vitest';
import { phenology, seasonFor } from '@/world/climate/season';

describe('seasons and phenology', () => {
  it('flips seasons between hemispheres', () => {
    const jan = new Date('2026-01-15T00:00:00Z');
    expect(seasonFor(jan, 50).season).toBe('winter');
    expect(seasonFor(jan, -35).season).toBe('summer');
    const jul = new Date('2026-07-15T00:00:00Z');
    expect(seasonFor(jul, 50).season).toBe('summer');
    expect(seasonFor(jul, -35).season).toBe('winter');
  });
  it('reports wet/dry seasons in the tropics when precipitation is known', () => {
    const monsoon = [5, 5, 5, 10, 30, 500, 800, 600, 300, 60, 10, 5];
    expect(seasonFor(new Date('2026-07-15T00:00:00Z'), 19, monsoon).season).toBe('wet');
    expect(seasonFor(new Date('2026-01-15T00:00:00Z'), 19, monsoon).season).toBe('dry');
  });
  it('deciduous leaf-on peaks in summer and vanishes in winter', () => {
    expect(seasonFor(new Date('2026-07-15T00:00:00Z'), 50).leafOnFraction).toBe(1);
    expect(seasonFor(new Date('2026-01-15T00:00:00Z'), 50).leafOnFraction).toBeLessThan(0.1);
  });
  it('fruit appears in late summer/autumn, not in spring; cold suppresses flowering', () => {
    const cold = new Array(12).fill(-5);
    expect(phenology({ date: new Date('2026-09-15T00:00:00Z'), lat: 48 }).fruiting).toBeGreaterThan(0.7);
    expect(phenology({ date: new Date('2026-04-15T00:00:00Z'), lat: 48 }).fruiting).toBe(0);
    expect(phenology({ date: new Date('2026-04-15T00:00:00Z'), lat: 48 }).flowering).toBeGreaterThan(0.7);
    expect(phenology({ date: new Date('2026-04-15T00:00:00Z'), lat: 48, tempC: cold }).flowering).toBe(0);
    expect(phenology({ date: new Date('2026-01-15T00:00:00Z'), lat: 60, tempC: cold }).snowLikely).toBe(true);
    // Southern hemisphere: fruit in March, not September.
    expect(phenology({ date: new Date('2026-03-15T00:00:00Z'), lat: -34 }).fruiting).toBeGreaterThan(0.7);
  });
});
