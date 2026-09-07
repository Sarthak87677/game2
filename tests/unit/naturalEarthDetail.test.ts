import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NaturalEarth, type NaturalEarthFiles } from '@/data/naturalEarth';

const read = (name: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), 'public/data/ne', name), 'utf8'));

function load(withFine: boolean): NaturalEarth {
  const files: NaturalEarthFiles = {
    land: read('land_50m.json'), landCoarse: read('land_110m.json'), landFine: withFine ? read('land_10m_detail.json') : null,
    lakes: read('lakes_50m.json'), glaciers: read('glaciated_50m.json'), rivers: read('rivers_50m.json'),
    countries: read('countries_110m.json'), regions: read('regions_110m.json'), marine: read('marine_110m.json'),
  };
  return new NaturalEarth(files);
}

describe('fine (1:10m) coastline detail regions', () => {
  const coarse = load(false);
  const fine = load(true);
  // Southern Mumbai is generalised away at 1:50m; the 1:10m clip restores it.
  const southMumbai: [string, number, number][] = [['Colaba', 18.915, 72.825], ['Fort', 18.933, 72.828], ['Marine Drive', 18.9432, 72.8236], ['Nariman Point', 18.925, 72.823]];
  it('the 1:50m set alone classifies southern Mumbai as ocean (the bug being fixed)', () => {
    for (const [, lat, lon] of southMumbai) expect(coarse.isLand(lat, lon)).toBe(false);
  });
  it('the fine set classifies southern Mumbai as land', () => {
    for (const [name, lat, lon] of southMumbai) expect(fine.isLand(lat, lon), name).toBe(true);
    expect(fine.surfaceAt(18.915, 72.825).kind).toBe('land');
    expect(fine.surfaceAt(18.915, 72.825).country?.name).toBe('India');
  });
  it('keeps the sea as sea', () => {
    expect(fine.isLand(18.9, 72.7)).toBe(false); // Back Bay / Arabian Sea west of Colaba
    expect(fine.isLand(15.0, 70.0)).toBe(false); // open Arabian Sea
    expect(fine.surfaceAt(18.9, 72.7).kind).toBe('ocean');
  });
  it('carries its region list and reports fine-coastline coverage', () => {
    expect(fine.fineRegions.map((r) => r.id)).toContain('india');
    expect(fine.hasFineCoastline(19, 72.8)).toBe(true);
    expect(fine.hasFineCoastline(48.85, 2.35)).toBe(false);
    expect(fine.toWorkerBundle().landFine.length).toBeGreaterThan(0);
  });
  it('is unchanged outside the detail regions', () => {
    expect(fine.isLand(48.8584, 2.2945)).toBe(true); // Paris
    expect(fine.isLand(40.7128, -74.006)).toBe(true); // Manhattan (110m union)
    expect(fine.isLand(0, -30)).toBe(false); // Atlantic
  });
});

describe('spawn points against the coastline', () => {
  it('every Maharashtra spawn point is on land or inside a fine-coastline region where the terrain refines it', async () => {
    const { MAHARASHTRA_SPAWNS } = await import('@/data/maharashtra/spawns');
    const fine = load(true);
    for (const sp of MAHARASHTRA_SPAWNS) {
      expect(fine.isLand(sp.lat, sp.lon) || fine.hasFineCoastline(sp.lat, sp.lon), sp.id).toBe(true);
    }
  });
});
