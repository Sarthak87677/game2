import { describe, expect, it } from 'vitest';
import { ALL_MAHARASHTRA_PLACES, MAHARASHTRA_DESTINATIONS } from '@/data/maharashtra/destinations';
import { MAHARASHTRA_CITIES, URBAN_REGION_IDS } from '@/data/maharashtra/cities';
import { MAHARASHTRA_BBOX, insideMaharashtra } from '@/data/maharashtra/defineDestination';
import { MAHARASHTRA_SPAWNS } from '@/data/maharashtra/spawns';
import type { DestinationKind } from '@/data/maharashtra/types';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS: DestinationKind[] = ['city', 'town', 'hill-station', 'coast', 'fort', 'monument', 'temple', 'museum', 'stadium', 'station', 'airport', 'port', 'campus', 'showroom', 'park', 'dam', 'waterfall', 'nature', 'village'];

describe('Maharashtra gazetteer', () => {
  it('has at least 120 entries with unique kebab-case ids', () => {
    expect(ALL_MAHARASHTRA_PLACES.length).toBeGreaterThanOrEqual(120);
    const ids = new Set<string>();
    for (const d of ALL_MAHARASHTRA_PLACES) {
      expect(d.id, d.name).toMatch(KEBAB);
      expect(ids.has(d.id), `duplicate id ${d.id}`).toBe(false);
      ids.add(d.id);
    }
  });

  it('keeps every non-external entry inside the Maharashtra bounding box', () => {
    for (const d of ALL_MAHARASHTRA_PLACES) {
      if (d.external) {
        expect(insideMaharashtra(d.lat, d.lon), d.id).toBe(false);
        continue;
      }
      expect(d.lat, `${d.id} lat`).toBeGreaterThanOrEqual(MAHARASHTRA_BBOX.south);
      expect(d.lat, `${d.id} lat`).toBeLessThanOrEqual(MAHARASHTRA_BBOX.north);
      expect(d.lon, `${d.id} lon`).toBeGreaterThanOrEqual(MAHARASHTRA_BBOX.west);
      expect(d.lon, `${d.id} lon`).toBeLessThanOrEqual(MAHARASHTRA_BBOX.east);
    }
  });

  it('gives every entry a kind, district, description, overview height, tags and an honest data note', () => {
    for (const d of ALL_MAHARASHTRA_PLACES) {
      expect(KINDS, d.id).toContain(d.kind);
      expect(d.district.trim().length, d.id).toBeGreaterThan(0);
      expect(d.description.trim().length, d.id).toBeGreaterThan(15);
      expect(d.overviewHeightM, d.id).toBeGreaterThan(100);
      expect(d.overviewHeightM, d.id).toBeLessThanOrEqual(6000);
      expect(d.dataNote, d.id).toMatch(/approximate|procedural|fictional|reconstruction/i);
      expect(d.tags?.length ?? 0, d.id).toBeGreaterThan(0);
      for (const t of d.tags ?? []) expect(t, d.id).toBe(t.toLowerCase().trim());
      expect(d.tags, d.id).toContain(d.kind);
      if (d.spawn) { expect(Math.abs(d.spawn.lat - d.lat), d.id).toBeLessThan(0.01); expect(Math.abs(d.spawn.lon - d.lon), d.id).toBeLessThan(0.01); }
    }
  });

  it('contains the 16 urban regions, the hill stations and the Konkan places from the plan', () => {
    const ids = new Set(MAHARASHTRA_CITIES.map((c) => c.id));
    expect(URBAN_REGION_IDS.length).toBe(16);
    for (const id of URBAN_REGION_IDS) expect(ids.has(id), id).toBe(true);
    for (const id of ['mahabaleshwar', 'lonavala', 'khandala', 'matheran', 'panchgani', 'chikhaldara']) expect(ids.has(id), id).toBe(true);
    for (const id of ['alibaug', 'murud-janjira', 'dapoli', 'ganpatipule', 'ratnagiri', 'malvan-tarkarli', 'vengurla']) expect(ids.has(id), id).toBe(true);
  });

  it('contains the required destinations from the plan', () => {
    const ids = new Set(MAHARASHTRA_DESTINATIONS.map((d) => d.id));
    const required = ['gateway-of-india', 'csmt', 'marine-drive', 'bandra-worli-sea-link', 'haji-ali-dargah', 'elephanta-caves', 'shaniwar-wada', 'aga-khan-palace',
      'sinhagad', 'raigad-fort', 'pratapgad', 'lohagad', 'ajanta-caves', 'ellora-caves', 'bibi-ka-maqbara', 'daulatabad-fort', 'deekshabhoomi', 'mahalaxmi-temple-kolhapur',
      'panhala-fort', 'shirdi', 'trimbakeshwar', 'bhimashankar', 'tadoba', 'lonar-crater', 'koyna-dam', 'bhandardara', 'kaas-plateau', 'wankhede-stadium', 'dy-patil-stadium',
      'sindhudurg-fort', 'sgis-campus', 'taj-mahal-hero'];
    for (const id of required) expect(ids.has(id), `missing ${id}`).toBe(true);
    const kinds = (k: DestinationKind) => MAHARASHTRA_DESTINATIONS.filter((d) => d.kind === k).length;
    expect(kinds('station')).toBeGreaterThanOrEqual(15);
    expect(kinds('airport')).toBeGreaterThanOrEqual(7);
    expect(kinds('campus')).toBeGreaterThanOrEqual(10);
    expect(kinds('museum')).toBeGreaterThanOrEqual(6);
    expect(kinds('park')).toBeGreaterThanOrEqual(10);
  });

  it('spot-checks well-known positions within ~0.01°', () => {
    const by = (id: string) => ALL_MAHARASHTRA_PLACES.find((d) => d.id === id)!;
    expect(by('gateway-of-india').lat).toBeCloseTo(18.922, 2);
    expect(by('gateway-of-india').lon).toBeCloseTo(72.8347, 2);
    expect(by('csmt').lat).toBeCloseTo(18.94, 2);
    expect(by('deekshabhoomi').lon).toBeCloseTo(79.0656, 2);
    expect(by('kolhapur').lat).toBeCloseTo(16.705, 2);
    expect(by('ajanta-caves').lat).toBeCloseTo(20.552, 2);
    expect(by('taj-mahal-hero').lat).toBeCloseTo(27.1751, 3);
    expect(by('taj-mahal-hero').external).toBe(true);
  });

  it('keeps the spawn points consistent with the gazetteer', () => {
    for (const s of MAHARASHTRA_SPAWNS) {
      const near = ALL_MAHARASHTRA_PLACES.some((d) => Math.abs(d.lat - s.lat) < 0.02 && Math.abs(d.lon - s.lon) < 0.02);
      expect(near, `spawn ${s.id} has no gazetteer entry nearby`).toBe(true);
    }
  });
});
