import { describe, expect, it } from 'vitest';
import { Rng } from '@/util/hash';
import { clipPolygonToRect, convexPolygonsOverlap, jitteredGrid, metresPerTile, poissonDisk, pointInPolygon, sampleHeight, slope, tileFrame } from '@/world/procedural/placement';
import { generateUrbanLayout, generateVillageLayout } from '@/world/procedural/settlements';
import type { HeightField } from '@/world/procedural/types';

describe('placement helpers', () => {
  it('jitteredGrid stays inside the square and is deterministic', () => {
    const a = jitteredGrid(new Rng(1), 600, 30, 1);
    const b = jitteredGrid(new Rng(1), 600, 30, 1);
    expect(a).toEqual(b);
    expect(a.length).toBe(400);
    for (const [x, y] of a) {
      expect(Math.abs(x)).toBeLessThanOrEqual(300);
      expect(Math.abs(y)).toBeLessThanOrEqual(300);
    }
    const regular = jitteredGrid(new Rng(1), 100, 50, 0);
    expect(regular).toEqual([[-25, -25], [25, -25], [-25, 25], [25, 25]]);
  });

  it('poissonDisk respects the minimum distance, bounds and cap', () => {
    const pts = poissonDisk(new Rng(9), 400, 300, 15, 500);
    expect(pts.length).toBeGreaterThan(300);
    expect(pts.length).toBeLessThanOrEqual(500);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(pts[i][0])).toBeLessThanOrEqual(200);
      expect(Math.abs(pts[i][1])).toBeLessThanOrEqual(150);
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThanOrEqual(15 - 1e-9);
    }
    expect(poissonDisk(new Rng(9), 400, 300, 15, 500)).toEqual(pts);
    expect(poissonDisk(new Rng(9), 400, 300, 15, 20).length).toBe(20);
  });

  it('samples heights bilinearly and derives slopes', () => {
    const frame = tileFrame(32768, 21845, 16);
    const w = 3;
    const h = 3;
    // Plane rising 100 m from west to east across the tile.
    const heights = new Float32Array([0, 50, 100, 0, 50, 100, 0, 50, 100]);
    const hf: HeightField = { width: w, height: h, heights, west: frame.west, south: frame.south, east: frame.east, north: frame.north };
    expect(sampleHeight(hf, 0, 0, frame)).toBeCloseTo(50, 3);
    expect(sampleHeight(hf, -frame.widthM / 2, 0, frame)).toBeCloseTo(0, 3);
    expect(sampleHeight(hf, frame.widthM / 4, 0, frame)).toBeCloseTo(75, 3);
    const expected = Math.atan(100 / frame.widthM) / (Math.PI / 2);
    expect(slope(hf, 0, 0, frame)).toBeCloseTo(expected, 4);
    const flat: HeightField = { ...hf, heights: new Float32Array(9).fill(7) };
    expect(slope(flat, 10, 10, frame)).toBe(0);
    expect(metresPerTile(0, 16)).toBeCloseTo(611.5, 0);
  });

  it('polygon helpers behave', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(sq, 5, 5)).toBe(true);
    expect(pointInPolygon(sq, 15, 5)).toBe(false);
    expect(convexPolygonsOverlap(sq, [[5, 5], [15, 5], [15, 15], [5, 15]])).toBe(true);
    expect(convexPolygonsOverlap(sq, [[11, 0], [20, 0], [20, 10], [11, 10]])).toBe(false);
    expect(convexPolygonsOverlap(sq, [[11, 0], [20, 0], [20, 10], [11, 10]], 2)).toBe(true);
    const clipped = clipPolygonToRect([[-5, -5], [15, -5], [15, 15], [-5, 15]], 0, 0, 10, 10);
    expect(clipped.length).toBe(4);
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    expect(clipPolygonToRect([[20, 20], [30, 20], [30, 30]], 0, 0, 10, 10)).toEqual([]);
  });
});

describe('settlements', () => {
  it('village layouts have ≥ 6 non-overlapping houses along lanes', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { buildings, lanes } = generateVillageLayout(new Rng(seed), [0, 0], 140, 'rural', () => 5);
      expect(buildings.length).toBeGreaterThanOrEqual(6);
      expect(lanes.length).toBeGreaterThanOrEqual(1);
      for (const b of buildings) {
        expect(b.baseZ).toBe(5);
        expect(b.source).toBe('procedural');
        for (const [x, y] of b.footprint) expect(Math.hypot(x, y)).toBeLessThan(140 / 2 + 30);
      }
      const houses = buildings.filter((b) => b.style === 'rural');
      for (const h of houses) {
        expect(h.heightM).toBeGreaterThanOrEqual(3.5);
        expect(h.heightM).toBeLessThanOrEqual(7);
        expect(h.roof).toBe('gable');
      }
    }
    expect(generateVillageLayout(new Rng(3), [0, 0], 140, 'rural', () => 0)).toEqual(generateVillageLayout(new Rng(3), [0, 0], 140, 'rural', () => 0));
  });

  it('urban layouts scale height with density and never exceed the tile', () => {
    const sub = generateUrbanLayout(new Rng(5), 600, 0.55, () => 0);
    const dense = generateUrbanLayout(new Rng(5), 600, 0.95, () => 0);
    const mean = (b: { heightM: number }[]) => b.reduce((a, x) => a + x.heightM, 0) / b.length;
    expect(mean(dense.buildings)).toBeGreaterThan(mean(sub.buildings));
    expect(dense.buildings.some((b) => b.style === 'tower')).toBe(true);
    expect(sub.buildings.some((b) => b.style === 'tower')).toBe(false);
    expect(dense.streets.length).toBeGreaterThan(4);
    for (const b of dense.buildings) for (const [x, y] of b.footprint) {
      expect(Math.abs(x)).toBeLessThanOrEqual(300);
      expect(Math.abs(y)).toBeLessThanOrEqual(300);
    }
    for (let i = 0; i < dense.buildings.length; i++) for (let j = i + 1; j < dense.buildings.length; j++) expect(convexPolygonsOverlap(dense.buildings[i].footprint, dense.buildings[j].footprint)).toBe(false);
  });
});
