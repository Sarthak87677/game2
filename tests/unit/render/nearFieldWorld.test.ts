import { describe, expect, it } from 'vitest';
import { NearFieldWorld, buildingHeightAt, retryDelayMs, selectNearFieldTiles, tileKey, tileLocalPoint, unloadOrder } from '@/world/render/NearFieldWorld';
import { NEAR_FIELD_ZOOM, type BuildingSpec } from '@/world/procedural/types';
import { lonLatToTile } from '@/util/geo';

describe('near-field tile selection', () => {
  it('returns the camera tile first at full LOD, sorted by distance, impostors out to the outer radius', () => {
    const lat = 48.8566, lon = 2.3522;
    const tiles = selectNearFieldTiles(lat, lon, 500, 1500);
    const centre = lonLatToTile(lon, lat, NEAR_FIELD_ZOOM);
    expect(tiles[0].key).toBe(tileKey(NEAR_FIELD_ZOOM, centre.x, centre.y));
    expect(tiles[0].lod).toBe('full');
    for (let i = 1; i < tiles.length; i++) expect(tiles[i].distM).toBeGreaterThanOrEqual(tiles[i - 1].distM);
    expect(tiles.every((t) => t.distM <= 1500)).toBe(true);
    expect(tiles.some((t) => t.lod === 'impostor')).toBe(true);
    expect(tiles.filter((t) => t.lod === 'full').every((t) => t.distM <= 500)).toBe(true);
    // ~ pi * 1500^2 / (401 m * 401 m) tiles at this latitude
    expect(tiles.length).toBeGreaterThan(30);
    expect(tiles.length).toBeLessThan(70);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });
  it('always keeps the tile underfoot at full LOD even with a tiny radius', () => {
    const tiles = selectNearFieldTiles(10, 10, 20, 60);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles[0].lod).toBe('full');
  });
  it('wraps across the antimeridian', () => {
    const tiles = selectNearFieldTiles(0, 179.9995, 500, 1500);
    const n = 2 ** NEAR_FIELD_ZOOM;
    expect(tiles.some((t) => t.x === 0)).toBe(true);
    expect(tiles.some((t) => t.x === n - 1)).toBe(true);
    expect(tiles.every((t) => t.x >= 0 && t.x < n)).toBe(true);
  });
});

describe('unload ordering', () => {
  it('evicts tiles beyond the keep radius farthest first, then the LRU overflow', () => {
    const loaded = [
      { key: 'a', distM: 100, lastUsed: 10 },
      { key: 'b', distM: 2500, lastUsed: 5 },
      { key: 'c', distM: 900, lastUsed: 1 },
      { key: 'd', distM: 4100, lastUsed: 9 },
      { key: 'e', distM: 900, lastUsed: 7 },
    ];
    expect(unloadOrder(loaded, 2000, 64)).toEqual(['d', 'b']);
    expect(unloadOrder(loaded, 2000, 2)).toEqual(['d', 'b', 'c']);
    expect(unloadOrder(loaded, 2000, 1)).toEqual(['d', 'b', 'c', 'e']);
    expect(unloadOrder(loaded, 5000, 64)).toEqual([]);
  });
  it('backs off exponentially up to 30 s', () => {
    expect(retryDelayMs(1)).toBe(1500);
    expect(retryDelayMs(2)).toBe(3000);
    expect(retryDelayMs(3)).toBe(6000);
    expect(retryDelayMs(20)).toBe(30_000);
  });
});

describe('building collision heights', () => {
  const buildings: BuildingSpec[] = [
    { id: 'a', footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, baseZ: 100, style: 'rural', source: 'procedural', roof: 'gable', colour: '#ccc' },
    { id: 'b', footprint: [[5, 5], [15, 5], [15, 15], [5, 15]], heightM: 12, baseZ: 100, style: 'urban', source: 'procedural', roof: 'flat', colour: '#ccc' },
  ];
  it('returns the tallest building top inside, null outside', () => {
    expect(buildingHeightAt(buildings, 2, 2)).toBe(106);
    expect(buildingHeightAt(buildings, 7, 7)).toBe(112);
    expect(buildingHeightAt(buildings, 12, 12)).toBe(112);
    expect(buildingHeightAt(buildings, 20, 20)).toBeNull();
    expect(buildingHeightAt([], 2, 2)).toBeNull();
  });
  it('converts lat/lon to tile-local metres around an anchor', () => {
    const p = tileLocalPoint(48.85, 2.35, 48.85, 2.3514);
    expect(p.x).toBeCloseTo(102.5, 0);
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
    const q = tileLocalPoint(48.85, 2.35, 48.8509, 2.35);
    expect(q.y).toBeCloseTo(100, 0);
  });
  it('exports the renderer class without needing a viewer here', () => {
    expect(typeof NearFieldWorld).toBe('function');
  });
});
