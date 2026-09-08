import { describe, expect, it } from 'vitest';
import { MAHARASHTRA_INDEX, MaharashtraIndex, mergeSearchResults } from '@/data/maharashtra/search';
import { MAHARASHTRA_HIGHLIGHTS } from '@/data/bookmarks/maharashtraHighlights';
import { WORLD_HIGHLIGHTS } from '@/data/bookmarks/highlights';
import { OfflineGazetteer } from '@/data/geocoding/offlineIndex';
import type { GeocodeResult } from '@/data/geocoding/types';

const near = (r: GeocodeResult | undefined, lat: number, lon: number, tol = 0.02) => !!r && Math.abs(r.lat - lat) < tol && Math.abs(r.lon - lon) < tol;

describe('MaharashtraIndex', () => {
  it('resolves the plan’s example queries to the right places, offline and synchronously', () => {
    expect(near(MAHARASHTRA_INDEX.search('Kolhapur')[0], 16.705, 74.2433)).toBe(true);
    expect(MAHARASHTRA_INDEX.search('Kolhapur')[0].id).toBe('mh-kolhapur');
    expect(MAHARASHTRA_INDEX.search('CSMT')[0].id).toBe('mh-csmt');
    expect(MAHARASHTRA_INDEX.search('csmt')[0].kind).toBe('landmark');
    expect(near(MAHARASHTRA_INDEX.search('Ganpatipule')[0], 17.1461, 73.2653)).toBe(true);
    expect(MAHARASHTRA_INDEX.search('SGIS')[0].id).toBe('mh-sgis-campus');
    expect(MAHARASHTRA_INDEX.search('Victoria Terminus')[0].id).toBe('mh-csmt');
    expect(MAHARASHTRA_INDEX.search('Aurangabad')[0].id).toBe('mh-chhatrapati-sambhajinagar');
    expect(MAHARASHTRA_INDEX.search('taj mahal')[0].id).toBe('mh-taj-mahal-hero');
    expect(MAHARASHTRA_INDEX.search('gateway of india')[0].id).toBe('mh-gateway-of-india');
    expect(MAHARASHTRA_INDEX.search('shaniwar')[0].id).toBe('mh-shaniwar-wada');
    expect(MAHARASHTRA_INDEX.search('deekshabhoomi')[0].id).toBe('mh-deekshabhoomi');
  });

  it('ranks exact names above prefixes, tags and fuzzy matches and tolerates typos', () => {
    const pune = MAHARASHTRA_INDEX.search('Pune');
    expect(pune[0].id).toBe('mh-pune');
    expect(pune.some((r) => r.id === 'mh-pune-junction')).toBe(true);
    expect(MAHARASHTRA_INDEX.search('Kolhapoor')[0].id).toBe('mh-kolhapur');
    expect(MAHARASHTRA_INDEX.search('ellora kailasa')[0].id).toBe('mh-ellora-caves');
    expect(MAHARASHTRA_INDEX.search('fort raigad')[0].id).toBe('mh-raigad-fort');
    expect(MAHARASHTRA_INDEX.search('')).toEqual([]);
    expect(MAHARASHTRA_INDEX.search('zzzzqqq')).toEqual([]);
  });

  it('returns well-formed geocode results with scores and bookmark ids', () => {
    for (const r of MAHARASHTRA_INDEX.search('nagpur', 20)) {
      expect(r.id).toMatch(/^mh-/);
      expect(r.bookmarkId).toBe(r.id);
      expect(['bookmark', 'landmark']).toContain(r.kind);
      expect(r.source).toBe('terra-bookmarks');
      expect(r.heightM).toBeGreaterThan(0);
      expect(r.score).toBeGreaterThan(0);
      expect(r.displayName).toContain('·');
    }
    expect(new MaharashtraIndex().size).toBeGreaterThanOrEqual(120);
    expect(MAHARASHTRA_INDEX.byId('csmt')?.name).toMatch(/Terminus/);
    expect(MAHARASHTRA_INDEX.byId('mh-csmt')?.id).toBe('csmt');
    expect(MAHARASHTRA_INDEX.nearest(18.922, 72.8347, 1)[0].dest.id).toBe('gateway-of-india');
  });

  it('merges with the offline gazetteer without duplicates and keeps score order', () => {
    const gazetteer = OfflineGazetteer.fromData({ bookmarks: WORLD_HIGHLIGHTS });
    const q = 'Kolhapur';
    const merged = mergeSearchResults(gazetteer.search(q, 10), MAHARASHTRA_INDEX.search(q, 10), 10);
    expect(merged.length).toBeGreaterThan(0);
    expect(new Set(merged.map((r) => r.id)).size).toBe(merged.length);
    expect(near(merged[0], 16.705, 74.2433)).toBe(true);
    for (let i = 1; i < merged.length; i++) expect(merged[i - 1].score).toBeGreaterThanOrEqual(merged[i].score);
    const a: GeocodeResult = { id: 'x', name: 'X', displayName: 'X', kind: 'city', lat: 1, lon: 1, heightM: 1, source: 'natural-earth', score: 5, bookmarkId: 'mh-y' };
    const b: GeocodeResult = { id: 'mh-y', name: 'Y', displayName: 'Y', kind: 'bookmark', lat: 1.0001, lon: 1.0001, heightM: 1, source: 'terra-bookmarks', score: 9 };
    expect(mergeSearchResults([a], [b], 5).map((r) => r.id)).toEqual(['mh-y']);
  });
});

describe('MAHARASHTRA_HIGHLIGHTS', () => {
  it('appends every gazetteer place to WORLD_HIGHLIGHTS with mh- ids and Maharashtra tags', () => {
    expect(MAHARASHTRA_HIGHLIGHTS.length).toBeGreaterThanOrEqual(120);
    const ids = new Set(WORLD_HIGHLIGHTS.map((b) => b.id));
    for (const b of MAHARASHTRA_HIGHLIGHTS) {
      expect(b.id).toMatch(/^mh-/);
      expect(ids.has(b.id)).toBe(true);
      expect(b.country).toBe('India');
    }
    expect(WORLD_HIGHLIGHTS.filter((b) => b.tags?.includes('maharashtra')).length).toBeGreaterThanOrEqual(120);
  });
});
