import { describe, expect, it } from 'vitest';
import { estimatedPopulation, localSolarHour, targetPedestrians, timeOfDayFactor, weatherCrowdFactor } from '@/world/crowds/density';
import { outfitFor, pickOutfitKind, VARIANTS_PER_PALETTE } from '@/world/crowds/palettes';
import { WalkNetwork } from '@/world/crowds/paths';
import { mixFor } from '@/world/crowds/ambience';
import { advanceFlock, createFlock, memberPosition } from '@/world/wildlife/flocks';
import { clearSightings, nearbySightings, reportSighting } from '@/world/wildlife/sightings';
import { Rng } from '@/util/hash';
import type { FeatureTile } from '@/data/adapters/features/types';

describe('crowd density', () => {
  it('is quiet at night and busy in the evening at a station', () => {
    expect(timeOfDayFactor(3)).toBeLessThan(0.1);
    expect(timeOfDayFactor(18)).toBe(1);
    expect(timeOfDayFactor(3, 'station')).toBeGreaterThanOrEqual(0.3);
    expect(timeOfDayFactor(19, 'promenade')).toBeGreaterThan(1);
    expect(timeOfDayFactor(12, 'campus')).toBe(1);
    expect(timeOfDayFactor(22, 'campus')).toBeLessThan(0.1);
  });

  it('targets more pedestrians at a station than in the countryside and caps at the pool size', () => {
    const station = targetPedestrians('station', 17, 300, 120);
    const rural = targetPedestrians('rural', 17, 300, 120);
    expect(station).toBe(120);
    expect(rural).toBeGreaterThan(0);
    expect(rural).toBeLessThan(10);
    expect(targetPedestrians('none', 12, 300, 120)).toBe(0);
    expect(targetPedestrians('station', 17, 300, 120, weatherCrowdFactor('storm'))).toBeLessThan(40);
    expect(estimatedPopulation('urban', 12, 1000)).toBeGreaterThan(targetPedestrians('urban', 12, 300, 120));
  });

  it('converts UTC to local solar hour by longitude', () => {
    expect(localSolarHour(new Date('2026-07-15T12:30:00Z'), 72.8)).toBeCloseTo(17.35, 1);
    expect(localSolarHour(new Date('2026-07-15T22:00:00Z'), 75)).toBeCloseTo(3, 1);
  });
});

describe('clothing palettes', () => {
  it('draws region-appropriate outfit kinds deterministically', () => {
    const rng = new Rng(42);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) kinds.add(pickOutfitKind('campus', rng));
    expect(kinds.has('uniform')).toBe(true);
    expect(kinds.has('saree')).toBe(false);
    const village = new Set<string>();
    for (let i = 0; i < 200; i++) village.add(pickOutfitKind('village', rng));
    expect(village.has('saree')).toBe(true);
    expect(village.has('uniform')).toBe(false);
    const a = outfitFor('market', new Rng(7)), b = outfitFor('market', new Rng(7));
    expect(a).toEqual(b);
    expect(a.top).toMatch(/^#/);
    expect(VARIANTS_PER_PALETTE).toBeGreaterThan(4);
  });
});

function tile(key: string, roads: FeatureTile['roads']): FeatureTile {
  return { key, z: 15, x: 0, y: 0, bbox: { west: 0, south: 0, east: 1, north: 1 }, buildings: [], roads, water: [], landuse: [], pois: [], fetchedAt: 0, source: 'network', truncated: false };
}

describe('walk network', () => {
  it('builds pavements from walkable roads only and connects segment ends', () => {
    const net = new WalkNetwork();
    const road = (id: string, kind: FeatureTile['roads'][number]['kind'], coords: [number, number][], widthM = 8): FeatureTile['roads'][number] => ({ id, kind, coords, name: null, widthM, bridge: false, tunnel: false, lanes: null, oneway: false });
    net.sync([tile('a', [
      road('r1', 'residential', [[72.80, 18.90], [72.801, 18.90]]),
      road('r2', 'residential', [[72.801, 18.90], [72.801, 18.901]]),
      road('m', 'motorway', [[72.80, 18.90], [72.802, 18.90]]),
      road('tiny', 'path', [[72.80, 18.90], [72.80001, 18.90]]),
    ])]);
    expect(net.segments.map((s) => s.id).sort()).toEqual(['r1', 'r2']);
    const r1 = net.segments.find((s) => s.id === 'r1')!;
    expect(r1.length).toBeGreaterThan(100);
    const centre = net.positionAt(r1, r1.length / 2, 0, { lat: 0, lon: 0 });
    const left = net.positionAt(r1, r1.length / 2, 1, { lat: 0, lon: 0 });
    const right = net.positionAt(r1, r1.length / 2, -1, { lat: 0, lon: 0 });
    expect(Math.abs(left.lat - centre.lat) * 111_132).toBeCloseTo(r1.pavementM, 0);
    expect(Math.sign(left.lat - centre.lat)).toBe(-Math.sign(right.lat - centre.lat));
    expect(net.neighbours(r1, true).map((s) => s.id)).toEqual(['r2']);
    expect(net.neighbours(r1, false)).toEqual([]);
    expect(net.nearby(18.9005, 72.8005, 100).length).toBe(2);
    expect(net.nearby(18.95, 72.9, 100).length).toBe(0);
    net.sync([]);
    expect(net.segments.length).toBe(0);
  });
});

describe('ambience mix', () => {
  it('mixes by scene kind, crowd, night and altitude', () => {
    const base = { kind: 'station' as const, crowd: 1, storm: false, rain: false, night: false, templeNear: false, altitudeAglM: 0 };
    expect(mixFor(base).station).toBeGreaterThan(0);
    expect(mixFor(base).murmur).toBe(0.35);
    expect(mixFor({ ...base, night: true }).murmur).toBeLessThan(0.35);
    expect(mixFor({ ...base, altitudeAglM: 2000 }).murmur).toBe(0);
    expect(mixFor({ ...base, kind: 'hills', crowd: 0 }).hillWind).toBeGreaterThan(0);
    expect(mixFor({ ...base, kind: 'forest', crowd: 0 }).forestBirds).toBeGreaterThan(0);
    expect(mixFor({ ...base, kind: 'forest', crowd: 0, night: true }).forestBirds).toBe(0);
  });
});

describe('flocks and sightings', () => {
  it('keeps a flock near its orbit and spreads members', () => {
    const rng = new Rng(3);
    const f = createFlock(rng, 12, 8, 20, 70, 8);
    let maxR = 0;
    for (let i = 0; i < 2000; i++) { advanceFlock(f, 0.05, rng.next()); maxR = Math.max(maxR, Math.hypot(f.x, f.y)); }
    expect(maxR).toBeLessThan(250);
    const a = memberPosition(f, 0, { x: 0, y: 0, z: 0 }), b = memberPosition(f, 1, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.1);
    expect(Math.abs(a.z - 20)).toBeLessThan(15);
  });

  it('registers and expires sightings by distance and age', () => {
    clearSightings();
    reportSighting('crow', 'House crow', 18.94, 72.83, 12, 1000);
    reportSighting('cattle', 'Cattle', 18.99, 72.83, 3, 1000);
    expect(nearbySightings(18.94, 72.83, 200, 2000).map((s) => s.species)).toEqual(['crow']);
    expect(nearbySightings(18.94, 72.83, 200, 60_000)).toEqual([]);
    clearSightings();
  });
});
