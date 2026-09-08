import { describe, expect, it } from 'vitest';
import { MAHARASHTRA_SPAWNS, spawnById } from '@/data/maharashtra/spawns';
import { distanceM } from '@/gameplay/GameplayHost';

describe('Maharashtra spawn points', () => {
  it('have unique ids, notes and plausible coordinates', () => {
    const ids = new Set(MAHARASHTRA_SPAWNS.map((s) => s.id));
    expect(ids.size).toBe(MAHARASHTRA_SPAWNS.length);
    for (const s of MAHARASHTRA_SPAWNS) {
      expect(s.dataNote.length).toBeGreaterThan(10);
      expect(s.approximate).toBe(true);
      // India bounding box (Maharashtra spawns plus the external Taj Mahal hero destination).
      expect(s.lat).toBeGreaterThan(6); expect(s.lat).toBeLessThan(36);
      expect(s.lon).toBeGreaterThan(68); expect(s.lon).toBeLessThan(98);
      expect(s.headingDeg).toBeGreaterThanOrEqual(0); expect(s.headingDeg).toBeLessThan(360);
    }
    expect(spawnById('sgis-campus')?.region).toBe('Kolhapur');
    expect(spawnById('nope')).toBeUndefined();
  });
  it('Maharashtra spawns lie inside the state bounding box; the Taj Mahal is flagged external in its note', () => {
    for (const s of MAHARASHTRA_SPAWNS) {
      if (s.id === 'taj-mahal') { expect(s.name).toMatch(/external/i); continue; }
      expect(s.lat).toBeGreaterThan(15.5); expect(s.lat).toBeLessThan(22.2);
      expect(s.lon).toBeGreaterThan(72.6); expect(s.lon).toBeLessThan(80.9);
    }
  });
});

describe('distanceM', () => {
  it('matches known distances', () => {
    expect(distanceM(0, 0, 0, 1)).toBeCloseTo(111_195, -2);
    // Gateway of India → CSMT ≈ 2 km.
    const d = distanceM(18.9218, 72.834, 18.94, 72.8353);
    expect(d).toBeGreaterThan(1800); expect(d).toBeLessThan(2300);
    expect(distanceM(19, 73, 19, 73)).toBe(0);
  });
});
