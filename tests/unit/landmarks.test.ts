import { describe, expect, it } from 'vitest';
import { LANDMARK_MODELS } from '@/data/bookmarks/landmarkModels';
import { buildLandmark, LANDMARK_BUILDERS, type LandmarkArchetype } from '@/world/landmarks/landmarkShapes';

describe('landmark models', () => {
  it('have unique names, sane coordinates and real heights', () => {
    const names = new Set<string>();
    for (const m of LANDMARK_MODELS) {
      expect(names.has(m.name)).toBe(false);
      names.add(m.name);
      expect(Math.abs(m.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(m.lon)).toBeLessThanOrEqual(180);
      expect(m.heightM).toBeGreaterThan(0);
      expect(m.footprintM).toBeGreaterThan(0);
      expect(m.note).toMatch(/procedural/i);
      expect(LANDMARK_BUILDERS[m.archetype]).toBeTypeOf('function');
    }
    expect(LANDMARK_MODELS.length).toBeGreaterThanOrEqual(30);
  });
  it('spot-checks well-known positions and heights', () => {
    const by = (n: string) => LANDMARK_MODELS.find((m) => m.name.startsWith(n))!;
    expect(by('Eiffel').lat).toBeCloseTo(48.8584, 3);
    expect(by('Eiffel').heightM).toBe(330);
    expect(by('Burj').heightM).toBe(828);
    expect(by('Great Pyramid').lon).toBeCloseTo(31.1342, 3);
    expect(by('Sydney Opera').lat).toBeCloseTo(-33.8568, 3);
    expect(by('Washington').heightM).toBe(169);
  });
});

describe('landmark shape builders', () => {
  it('produce valid geometry at the requested height for every archetype', () => {
    for (const archetype of Object.keys(LANDMARK_BUILDERS) as LandmarkArchetype[]) {
      const m = buildLandmark(archetype, 100, 40, '#c0c0c0', 7);
      const n = m.positions.length / 3;
      expect(n).toBeGreaterThan(8);
      expect(n).toBeLessThan(20_000);
      let maxZ = -Infinity;
      for (let i = 0; i < m.positions.length; i++) {
        expect(Number.isFinite(m.positions[i])).toBe(true);
        if (i % 3 === 2) maxZ = Math.max(maxZ, m.positions[i]);
      }
      for (let i = 0; i < m.indices.length; i++) expect(m.indices[i]).toBeLessThan(n);
      expect(m.indices.length % 3).toBe(0);
      expect(maxZ).toBeGreaterThan(60);
      expect(maxZ).toBeLessThanOrEqual(150);
    }
  });
  it('is deterministic per seed', () => {
    const a = buildLandmark('stoneCircle', 4, 33, '#999', 3);
    const b = buildLandmark('stoneCircle', 4, 33, '#999', 3);
    expect(Array.from(a.positions.slice(0, 60))).toEqual(Array.from(b.positions.slice(0, 60)));
  });
});
