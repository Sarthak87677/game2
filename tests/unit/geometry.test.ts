import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bboxOfRings, pointInPolygon, pointInRing } from '@/data/naturalEarth/geometry';
import { NaturalEarth, type NaturalEarthFiles } from '@/data/naturalEarth';

const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('geometry', () => {
  it('point in ring', () => {
    expect(pointInRing(square, 5, 5)).toBe(true);
    expect(pointInRing(square, 15, 5)).toBe(false);
  });
  it('holes are excluded', () => {
    const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(pointInPolygon([square, hole], 5, 5)).toBe(false);
    expect(pointInPolygon([square, hole], 2, 2)).toBe(true);
  });
  it('bbox', () => {
    expect(bboxOfRings([square])).toEqual({ west: 0, south: 0, east: 10, north: 10 });
  });
});

describe('Natural Earth index (real processed data)', () => {
  const load = (name: string) => JSON.parse(readFileSync(`public/data/ne/${name}`, 'utf8'));
  const files: NaturalEarthFiles = {
    land: load('land_50m.json'), landCoarse: load('land_110m.json'), lakes: load('lakes_50m.json'), glaciers: load('glaciated_50m.json'),
    rivers: load('rivers_50m.json'), countries: load('countries_110m.json'), regions: load('regions_110m.json'), marine: load('marine_110m.json'),
  };
  const ne = new NaturalEarth(files);
  it('classifies land, ocean, lake and glacier', () => {
    expect(ne.surfaceAt(48.8566, 2.3522).kind).toBe('land');
    expect(ne.surfaceAt(0, -150).kind).toBe('ocean');
    expect(ne.surfaceAt(47.5, -87.5).kind).toBe('lake'); // Lake Superior
    expect(ne.surfaceAt(72, -40).kind).toBe('glacier'); // Greenland ice sheet
    expect(ne.surfaceAt(40.7484, -73.9857).kind).toBe('land'); // Manhattan: absent from 1:50m land, present in 1:110m
    expect(ne.surfaceAt(40.7484, -73.9857).country?.name).toMatch(/United States/);
  });
  it('resolves countries, regions and oceans', () => {
    expect(ne.surfaceAt(48.8566, 2.3522).country?.name).toBe('France');
    expect(ne.surfaceAt(28.6, 77.2).country?.name).toBe('India');
    expect(ne.surfaceAt(25, 10).region?.name).toMatch(/SAHARA/i);
    expect(ne.surfaceAt(0, -150).marine?.name).toMatch(/pacific/i);
  });
  it('loads through the async loader with a custom fetcher', async () => {
    const loaded = await NaturalEarth.load(async (url) => load(url.split('/').pop()!), '/data/ne');
    expect(loaded.land.items.length).toBeGreaterThan(100);
    expect(loaded.rivers.items.length).toBeGreaterThan(100);
  });
});
