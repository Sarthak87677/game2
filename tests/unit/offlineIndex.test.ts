import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { OfflineGazetteer } from '@/data/geocoding/offlineIndex';
import { boundedEditDistance, normalizeSearchText, titleCaseIfUpper } from '@/data/geocoding/textMatch';
import { haversineKm, pointInGeometry, ringsBBox, type AreaGeometry } from '@/data/geocoding/geometry';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/** Maps `/data/ne/x.json` to the real file under public/ (the same files the app serves). */
async function fetchJson(url: string): Promise<unknown> {
  const rel = url.replace(/^\/+/, '');
  return JSON.parse(await readFile(path.join(PUBLIC_DIR, rel), 'utf8')) as unknown;
}

let gaz: OfflineGazetteer;

beforeAll(async () => {
  gaz = await OfflineGazetteer.load(fetchJson);
});

describe('OfflineGazetteer.load', () => {
  it('loads every Natural Earth table plus the bookmarks without warnings', () => {
    expect(gaz.warnings).toEqual([]);
    expect(gaz.stats.places).toBeGreaterThan(1000);
    expect(gaz.stats.physicalPoints).toBeGreaterThan(100);
    expect(gaz.stats.countries).toBeGreaterThan(150);
    expect(gaz.stats.regions).toBeGreaterThan(40);
    expect(gaz.stats.marineAreas).toBeGreaterThan(20);
    expect(gaz.stats.bookmarks).toBeGreaterThanOrEqual(160);
    expect(gaz.size).toBe(gaz.stats.total);
    expect(gaz.size).toBeGreaterThan(1500);
  });

  it('tolerates a missing file and reports it as a warning', async () => {
    const flaky = async (url: string) => {
      if (url.endsWith('marine_110m.json')) throw new Error('offline');
      return fetchJson(url);
    };
    const g = await OfflineGazetteer.load(flaky, '/data/ne/');
    expect(g.warnings).toHaveLength(1);
    expect(g.warnings[0]).toMatch(/marine_110m\.json: offline/);
    expect(g.search('tokyo')[0]?.name).toBe('Tokyo');
  });

  it('works with only the bookmarks when every file fails', async () => {
    const g = await OfflineGazetteer.load(async () => {
      throw new Error('no network');
    });
    expect(g.warnings).toHaveLength(5);
    expect(g.search('everest')[0]?.name).toMatch(/Everest/);
    expect(g.nearest(48.86, 2.35)).toEqual([]);
    expect(g.describeLocation(48.86, 2.35)).toMatch(/Paris/);
  });
});

describe('OfflineGazetteer.search', () => {
  it('"Paris" → Paris, France first', () => {
    const results = gaz.search('Paris');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Paris');
    expect(results[0].displayName).toBe('Paris, France');
    expect(['city', 'capital']).toContain(results[0].kind);
    expect(results[0].source).toBe('natural-earth');
    expect(results[0].lat).toBeCloseTo(48.86, 1);
    expect(results[0].lon).toBeCloseTo(2.35, 1);
    expect(results[0].heightM).toBeGreaterThan(1000);
    expect(results[0].bookmarkId).toBeDefined();
  });

  it('"paris texas" still returns Paris', () => {
    const results = gaz.search('paris texas');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Paris');
  });

  it('"Paris, France" ranks Paris first', () => {
    expect(gaz.search('Paris, France')[0].displayName).toBe('Paris, France');
  });

  it('"tokyo" → Tokyo, Japan', () => {
    const top = gaz.search('tokyo')[0];
    expect(top.displayName).toBe('Tokyo, Japan');
    expect(top.kind).toBe('capital');
  });

  it('"everest" → the Everest bookmark / landmark', () => {
    const top = gaz.search('everest')[0];
    expect(top.name).toMatch(/Everest/);
    expect(['landmark', 'bookmark']).toContain(top.kind);
    expect(top.source).toBe('terra-bookmarks');
    expect(top.lat).toBeCloseTo(27.9881, 3);
  });

  it('"sahara" → the Sahara region', () => {
    const top = gaz.search('sahara')[0];
    expect(top.kind).toBe('region');
    expect(top.name).toBe('Sahara');
    expect(top.displayName).toMatch(/desert/i);
    expect(top.lat).toBeGreaterThan(15);
    expect(top.lat).toBeLessThan(35);
  });

  it('"Kilimanjaro" → landmark', () => {
    const top = gaz.search('Kilimanjaro')[0];
    expect(top.kind).toBe('landmark');
    expect(top.name).toMatch(/Kilimanjaro/);
    expect(top.lat).toBeCloseTo(-3.0674, 3);
  });

  it('"chennai" → Chennai, India', () => {
    const top = gaz.search('chennai')[0];
    expect(top.displayName).toBe('Chennai, India');
    expect(top.source).toBe('natural-earth');
  });

  it('matches countries and seas', () => {
    expect(gaz.search('japan')[0].kind).toBe('country');
    expect(gaz.search('France')[0].displayName).toMatch(/^France \(country/);
    expect(gaz.search('pacific')[0].name).toMatch(/Pacific Ocean/);
  });

  it('is diacritic- and case-insensitive', () => {
    expect(gaz.search('SAO PAULO')[0].name).toBe('São Paulo');
    expect(gaz.search('são paulo')[0].name).toBe('São Paulo');
    expect(gaz.search('reykjavik')[0].name).toMatch(/^Reykjav/);
  });

  it('supports prefix, word-prefix, alias and fuzzy matches', () => {
    expect(gaz.search('tok')[0].name).toBe('Tokyo');
    expect(gaz.search('petersburg')[0].name).toMatch(/Petersburg/);
    // "Saint Petersburg" (bookmark) and "St. Petersburg" (Natural Earth) are merged into one Russian result.
    expect(gaz.search('saint petersburg').filter((r) => /Petersburg/.test(r.name) && /Russia/.test(r.displayName))).toHaveLength(1);
    expect(gaz.search('saint petersburg')[0].bookmarkId).toBe('saint-petersburg');
    expect(gaz.search('bombay')[0].name).toBe('Mumbai');
    expect(gaz.search('tokio')[0].name).toBe('Tokyo');
    expect(gaz.search('kilimanjro')[0].name).toMatch(/Kilimanjaro/);
    expect(gaz.search('evrest')[0].name).toMatch(/Everest/);
    expect(gaz.search('mt everest')[0].name).toBe('Mount Everest');
  });

  it('returns nothing for empty or nonsense queries and honours the limit', () => {
    expect(gaz.search('')).toEqual([]);
    expect(gaz.search('   ')).toEqual([]);
    expect(gaz.search('qzxjvkw')).toEqual([]);
    expect(gaz.search('san', 5)).toHaveLength(5);
    expect(gaz.search('san', 0).length).toBeGreaterThan(0);
  });

  it('is deterministic and returns descending scores', () => {
    const a = gaz.search('san');
    const b = gaz.search('san');
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
  });

  it('does not return duplicate Paris / Tokyo entries', () => {
    expect(gaz.search('paris').filter((r) => r.displayName === 'Paris, France')).toHaveLength(1);
    expect(gaz.search('tokyo').filter((r) => r.displayName === 'Tokyo, Japan')).toHaveLength(1);
  });
});

describe('OfflineGazetteer.nearest', () => {
  it('finds Paris within 15 km of central Paris', () => {
    const near = gaz.nearest(48.86, 2.35);
    expect(near.length).toBe(3);
    expect(near[0].name).toBe('Paris');
    expect(near[0].distanceKm).toBeLessThan(15);
    expect(near[0].displayName).toBe('Paris, France');
    for (let i = 1; i < near.length; i++) expect(near[i - 1].distanceKm).toBeLessThanOrEqual(near[i].distanceKm);
  });

  it('only returns populated places and honours the limit', () => {
    const near = gaz.nearest(-33.87, 151.21, 5);
    expect(near).toHaveLength(5);
    expect(near[0].name).toBe('Sydney');
    for (const n of near) expect(['city', 'capital']).toContain(n.kind);
    expect(gaz.nearest(0, 0, 1)).toHaveLength(1);
  });

  it('works across the antimeridian', () => {
    const near = gaz.nearest(-18.14, 178.44, 1);
    expect(near[0].name).toBe('Suva');
    expect(near[0].distanceKm).toBeLessThan(10);
  });
});

describe('OfflineGazetteer.describeLocation', () => {
  it('describes central Paris and its suburbs', () => {
    expect(gaz.describeLocation(48.86, 2.35)).toBe('Paris, France');
    expect(gaz.describeLocation(48.95, 2.45)).toMatch(/^Near Paris, France \(\d+(\.\d)? km\)$/);
  });

  it('describes mid-ocean points by ocean name', () => {
    expect(gaz.describeLocation(0, -150)).toMatch(/Pacific/);
    expect(gaz.describeLocation(30, -40)).toMatch(/Atlantic/);
    expect(gaz.describeLocation(-45, -100)).toMatch(/South Pacific Ocean/);
  });

  it('describes the South Pole area with Antarctica or the South Pole bookmark', () => {
    expect(gaz.describeLocation(-89.9, 0)).toMatch(/Antarctica|South Pole/);
    expect(gaz.describeLocation(-80, 0)).toMatch(/Antarctica/);
  });

  it('mentions the sea when offshore but within reach of a place', () => {
    const text = gaz.describeLocation(-34.5, 152.5);
    expect(text).toMatch(/near .*Australia \(\d+ km\)/);
    expect(text).toMatch(/Tasman Sea|Coral Sea|Pacific/);
  });

  it('is defensive about invalid input', () => {
    expect(gaz.describeLocation(Number.NaN, 0)).toBe('Unknown location');
  });

  it('is exposed through the adapter interface', async () => {
    const adapter = gaz.toAdapter();
    expect(adapter.requiresNetwork).toBe(false);
    expect((await adapter.search('tokyo', 1))[0].displayName).toBe('Tokyo, Japan');
    expect(await adapter.reverse?.(0, -150)).toMatch(/Pacific/);
  });
});

describe('helpers', () => {
  it('normalizeSearchText strips diacritics, case and punctuation', () => {
    expect(normalizeSearchText('São Paulo')).toBe('sao paulo');
    expect(normalizeSearchText("Ra’s al Had")).toBe('ras al had');
    expect(normalizeSearchText('  CAUCASUS  MTS.  ')).toBe('caucasus mts');
    expect(normalizeSearchText('Hawai‘i')).toBe('hawaii');
    expect(normalizeSearchText('Ålesund / Tromsø')).toBe('alesund tromso');
  });

  it('titleCaseIfUpper only changes all-caps names', () => {
    expect(titleCaseIfUpper('SAHARA')).toBe('Sahara');
    expect(titleCaseIfUpper('CAPE OF GOOD HOPE')).toBe('Cape of Good Hope');
    expect(titleCaseIfUpper('PENÍNSULA IBÉRICA')).toBe('Península Ibérica');
    expect(titleCaseIfUpper('Ross Sea')).toBe('Ross Sea');
    expect(titleCaseIfUpper('K2')).toBe('K2');
  });

  it('boundedEditDistance counts edits and transpositions with a bound', () => {
    expect(boundedEditDistance('tokyo', 'tokyo', 2)).toBe(0);
    expect(boundedEditDistance('tokio', 'tokyo', 2)).toBe(1);
    expect(boundedEditDistance('tokyo', 'tokoy', 2)).toBe(1);
    expect(boundedEditDistance('kilimanjro', 'kilimanjaro', 2)).toBe(1);
    expect(boundedEditDistance('paris', 'london', 2)).toBe(3);
    expect(boundedEditDistance('abcdef', 'abc', 2)).toBe(3);
  });

  it('haversineKm and point-in-polygon behave', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
    expect(haversineKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeCloseTo(343.5, -1);
    const square: AreaGeometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
    expect(pointInGeometry(1, 1, square)).toBe(true);
    expect(pointInGeometry(5, 5, square)).toBe(false);
    expect(pointInGeometry(11, 5, square)).toBe(false);
    const dateline = ringsBBox([[[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]]);
    expect(dateline).toEqual({ minLon: 170, minLat: -10, maxLon: 190, maxLat: 10 });
  });
});
