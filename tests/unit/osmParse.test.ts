import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleRings, buildingHeight, parseHeight, parseOverpass, roadKind } from '@/data/adapters/features/osmParse';
import { OverpassAdapter, overpassQuery } from '@/data/adapters/features/overpass';
import { TileCache } from '@/data/cache/tileCache';
import { tileBounds } from '@/util/geo';

const sample = JSON.parse(readFileSync('tests/fixtures/overpass-sample.json', 'utf8'));

describe('OSM parsing', () => {
  it('parses heights in metres and feet', () => {
    expect(parseHeight('12')).toBe(12);
    expect(parseHeight('12.5 m')).toBe(12.5);
    expect(parseHeight('40 ft')).toBeCloseTo(12.19, 2);
    expect(parseHeight('tall')).toBeNull();
    expect(parseHeight('-3')).toBeNull();
  });
  it('derives building heights with provenance', () => {
    expect(buildingHeight({ height: '25 m' })).toEqual({ heightM: 25, levels: null, source: 'tag' });
    expect(buildingHeight({ 'building:levels': '6' }).source).toBe('levels');
    expect(buildingHeight({ 'building:levels': '6' }).heightM).toBeCloseTo(20.2, 1);
    expect(buildingHeight({ building: 'house' }).source).toBe('inferred');
    expect(buildingHeight({ building: 'cathedral' }).heightM).toBeGreaterThan(buildingHeight({ building: 'house' }).heightM);
  });
  it('classifies roads', () => {
    expect(roadKind({ highway: 'motorway_link' })).toBe('motorway');
    expect(roadKind({ highway: 'footway' })).toBe('path');
    expect(roadKind({ railway: 'rail' })).toBe('rail');
    expect(roadKind({ railway: 'abandoned' })).toBeNull();
    expect(roadKind({ building: 'yes' })).toBeNull();
  });
  it('assembles relation rings from unordered member ways', () => {
    const rings = assembleRings([
      [[0, 0], [1, 0]],
      [[1, 1], [0, 1], [0, 0]],
      [[1, 0], [1, 1]],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
    expect(rings[0]).toHaveLength(5);
  });
  it('parses a full Overpass response into typed features', () => {
    const tile = parseOverpass(sample, { z: 15, x: 16596, y: 11272, bbox: tileBounds(16596, 11272, 15) }, 123);
    expect(tile.buildings).toHaveLength(4);
    const church = tile.buildings.find((b) => b.type === 'church')!;
    expect(church.holes).toHaveLength(1);
    expect(church.heightM).toBe(40);
    expect(church.outer[0]).toEqual(church.outer[church.outer.length - 1]);
    expect(tile.roads.map((r) => r.kind).sort()).toEqual(['path', 'primary', 'rail']);
    expect(tile.roads.find((r) => r.kind === 'primary')!.widthM).toBeCloseTo(9.9, 1);
    expect(tile.water.map((w) => w.kind).sort()).toEqual(['lake', 'river']);
    expect(tile.water.find((w) => w.kind === 'river')!.widthM).toBe(120);
    expect(tile.landuse[0].kind).toBe('park');
    expect(tile.pois.map((p) => p.name).sort()).toEqual(['Louvre', 'Paris']);
    expect(tile.pois.find((p) => p.name === 'Paris')!.population).toBe(2165423);
    expect(tile.truncated).toBe(false);
  });
});

describe('OverpassAdapter', () => {
  it('builds a bounded query', () => {
    const q = overpassQuery({ west: 2.3, south: 48.8, east: 2.4, north: 48.9 }, 25);
    expect(q).toContain('[bbox:48.800000,2.300000,48.900000,2.400000]');
    expect(q).toContain('out body geom');
  });
  it('fetches, caches and throttles', async () => {
    const calls: number[] = [];
    const fetchImpl = vi.fn(async () => { calls.push(Date.now()); return new Response(JSON.stringify(sample), { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    const cache = new TileCache({ name: `osm-${Math.random()}` });
    const adapter = new OverpassAdapter({ url: 'https://example.invalid/api', cache, minIntervalMs: 120, fetchImpl: fetchImpl as unknown as typeof fetch });
    const a = await adapter.fetchTile(15, 16596, 11272);
    const b = await adapter.fetchTile(15, 16597, 11272);
    expect(a.source).toBe('network');
    expect(b.buildings.length).toBe(4);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(100);
    const c = await adapter.fetchTile(15, 16596, 11272);
    expect(c.source).toBe('cache');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(adapter.cacheHits).toBe(1);
  });
  it('backs off after network failures and reports unavailability', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const adapter = new OverpassAdapter({ url: 'https://example.invalid/api', minIntervalMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.fetchTile(15, 1, 1)).rejects.toThrow();
    expect(adapter.isAvailable().available).toBe(false);
    expect(adapter.online).toBe(false);
    await expect(adapter.fetchTile(15, 1, 2)).rejects.toThrow(/temporarily disabled/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
