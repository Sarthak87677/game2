import { describe, expect, it } from 'vitest';
import { WORLD_HIGHLIGHTS } from '@/data/bookmarks/highlights';
import { SHOWCASE_AREAS } from '@/data/bookmarks/showcase';
import { DEFAULT_CAMERA_BY_CATEGORY, defineBookmark } from '@/data/bookmarks/defaults';
import type { Bookmark, BookmarkCategory, BookmarkContinent } from '@/data/bookmarks/types';

const CATEGORIES: BookmarkCategory[] = ['city', 'landmark', 'nature', 'mountain', 'river', 'desert', 'polar', 'island', 'ocean', 'park', 'rural'];
const CONTINENTS: BookmarkContinent[] = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Ocean'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALL: Bookmark[] = [...WORLD_HIGHLIGHTS, ...SHOWCASE_AREAS];

function expectValidBookmark(b: Bookmark): void {
  expect(b.id).toMatch(KEBAB);
  expect(b.name.trim().length).toBeGreaterThan(0);
  expect(CATEGORIES).toContain(b.category);
  expect(CONTINENTS).toContain(b.continent);
  expect(Number.isFinite(b.lat)).toBe(true);
  expect(Number.isFinite(b.lon)).toBe(true);
  expect(b.lat).toBeGreaterThanOrEqual(-90);
  expect(b.lat).toBeLessThanOrEqual(90);
  expect(b.lon).toBeGreaterThanOrEqual(-180);
  expect(b.lon).toBeLessThanOrEqual(180);
  expect(b.camera.heightM).toBeGreaterThan(0);
  expect(b.camera.heightM).toBeLessThanOrEqual(20_000_000);
  expect(b.camera.headingDeg).toBeGreaterThanOrEqual(0);
  expect(b.camera.headingDeg).toBeLessThan(360);
  expect(b.camera.pitchDeg).toBeLessThan(0);
  expect(b.camera.pitchDeg).toBeGreaterThanOrEqual(-90);
  expect(b.description.trim().length).toBeGreaterThan(10);
  expect(b.dataNote).toMatch(/measured/i);
  expect(b.dataNote).toMatch(/inferred|procedural/i);
  if (b.country !== undefined) expect(b.country.trim().length).toBeGreaterThan(0);
  if (b.tags !== undefined) for (const t of b.tags) expect(t).toBe(t.toLowerCase().trim());
}

describe('WORLD_HIGHLIGHTS', () => {
  it('has at least 160 entries with unique kebab-case ids', () => {
    expect(WORLD_HIGHLIGHTS.length).toBeGreaterThanOrEqual(160);
    const ids = new Set(ALL.map((b) => b.id));
    expect(ids.size).toBe(ALL.length);
  });

  it('every entry is well formed (ranges, negative pitch, notes)', () => {
    for (const b of WORLD_HIGHLIGHTS) expectValidBookmark(b);
  });

  it('meets the per-continent minimum counts', () => {
    const count = (c: BookmarkContinent) => WORLD_HIGHLIGHTS.filter((b) => b.continent === c).length;
    expect(count('Antarctica')).toBeGreaterThanOrEqual(6);
    expect(count('Oceania')).toBeGreaterThanOrEqual(12);
    expect(count('Africa')).toBeGreaterThanOrEqual(20);
    expect(count('South America')).toBeGreaterThanOrEqual(15);
    expect(count('Asia')).toBeGreaterThanOrEqual(35);
    expect(count('Europe')).toBeGreaterThanOrEqual(25);
    expect(count('North America')).toBeGreaterThanOrEqual(25);
    const oceansAndIslands = WORLD_HIGHLIGHTS.filter((b) => b.continent === 'Ocean' || b.category === 'island' || b.category === 'ocean');
    expect(oceansAndIslands.length).toBeGreaterThanOrEqual(8);
    expect(count('Ocean')).toBeGreaterThanOrEqual(8);
  });

  it('contains the required landmarks, ecosystems, rivers, deserts, polar sites and islands', () => {
    const required = [
      'eiffel-tower', 'statue-of-liberty', 'taj-mahal', 'great-pyramid-of-giza', 'burj-khalifa', 'sydney-opera-house',
      'christ-the-redeemer', 'machu-picchu', 'petra', 'angkor-wat', 'great-wall-mutianyu', 'colosseum', 'acropolis',
      'neuschwanstein-castle', 'table-mountain', 'uluru', 'mount-fuji', 'kilimanjaro', 'matterhorn', 'mount-everest', 'k2',
      'denali', 'aconcagua', 'mont-blanc', 'aoraki-mount-cook', 'vinson-massif',
      'amazon-rainforest-manaus', 'congo-basin-mbandaka', 'danum-valley-borneo', 'daintree', 'serengeti', 'okavango-delta',
      'pantanal', 'sundarbans', 'great-barrier-reef', 'galapagos-puerto-ayora', 'old-faithful', 'lake-louise-banff', 'torres-del-paine',
      'nile-at-cairo', 'nile-at-aswan', 'meeting-of-waters', 'varanasi-ghats', 'mississippi-delta', 'three-gorges-dam',
      'danube-at-budapest', 'rhine-gorge-loreley', 'victoria-falls', 'iguazu-falls', 'niagara-falls',
      'erg-chebbi', 'sossusvlei', 'atacama-valle-de-la-luna', 'gobi-desert', 'wadi-rum', 'great-victoria-desert', 'death-valley-badwater',
      'south-pole', 'mcmurdo-station', 'antarctic-peninsula-palmer', 'ross-ice-shelf', 'svalbard-longyearbyen', 'ilulissat-icefjord',
      'utqiagvik', 'franz-josef-land',
      'bora-bora', 'maldives-male', 'reykjavik', 'vatnajokull', 'tristan-da-cunha', 'easter-island', 'socotra', 'faroe-islands',
    ];
    const ids = new Set(WORLD_HIGHLIGHTS.map((b) => b.id));
    for (const id of required) expect(ids.has(id), `missing bookmark ${id}`).toBe(true);
  });

  it('has well-known landmark coordinates within ~0.01°', () => {
    const byId = new Map(WORLD_HIGHLIGHTS.map((b) => [b.id, b] as const));
    const check = (id: string, lat: number, lon: number) => {
      const b = byId.get(id);
      expect(b, id).toBeDefined();
      expect(Math.abs((b as Bookmark).lat - lat)).toBeLessThan(0.011);
      expect(Math.abs((b as Bookmark).lon - lon)).toBeLessThan(0.011);
    };
    check('eiffel-tower', 48.8584, 2.2945);
    check('statue-of-liberty', 40.6892, -74.0445);
    check('taj-mahal', 27.1751, 78.0421);
    check('burj-khalifa', 25.1972, 55.2744);
    check('uluru', -25.3444, 131.0369);
    check('mount-everest', 27.9881, 86.925);
    check('kilimanjaro', -3.0674, 37.3556);
  });

  it('uses camera heights in the guideline bands per category', () => {
    for (const b of WORLD_HIGHLIGHTS) {
      const h = b.camera.heightM;
      switch (b.category) {
        case 'city':
          expect(h, b.id).toBeGreaterThanOrEqual(1500);
          expect(h, b.id).toBeLessThanOrEqual(4000);
          break;
        case 'landmark':
          expect(h, b.id).toBeGreaterThanOrEqual(400);
          expect(h, b.id).toBeLessThanOrEqual(3000);
          break;
        case 'mountain':
          expect(h, b.id).toBeGreaterThanOrEqual(6000);
          expect(h, b.id).toBeLessThanOrEqual(15000);
          break;
        case 'polar':
          expect(h, b.id).toBeGreaterThanOrEqual(20000);
          expect(h, b.id).toBeLessThanOrEqual(80000);
          break;
        default:
          expect(h, b.id).toBeGreaterThanOrEqual(1000);
          expect(h, b.id).toBeLessThanOrEqual(80000);
      }
    }
  });
});

describe('SHOWCASE_AREAS', () => {
  const EXPECTED_NAMES = [
    'New York — Manhattan & Central Park',
    'Mumbai',
    'Rural farmland near Ludhiana, Punjab',
    'Himalayas — Everest region',
    'Antarctica — South Pole & Ross Ice Shelf',
    'Amazon rainforest near Manaus',
    'Sahara — Erg Chebbi',
    'Alps — Zermatt & the Matterhorn',
    'Tokyo',
    'London',
    'Paris',
    'Dubai',
    'Cape Town',
    'Sydney',
    'Singapore',
    'São Paulo',
    'Grand Canyon',
    'Tristan da Cunha',
    'Great Ocean Road — Twelve Apostles',
  ];

  it('contains exactly the 19 expected areas', () => {
    expect(SHOWCASE_AREAS.length).toBe(19);
    expect(SHOWCASE_AREAS.map((a) => a.name)).toEqual(EXPECTED_NAMES);
    expect(new Set(SHOWCASE_AREAS.map((a) => a.id)).size).toBe(19);
  });

  it('every area is a valid bookmark with biome, ground spot and tour', () => {
    for (const a of SHOWCASE_AREAS) {
      expectValidBookmark(a);
      expect(a.expectedBiome).toMatch(KEBAB);
      expect(Math.abs(a.groundSpot.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(a.groundSpot.lon)).toBeLessThanOrEqual(180);
      // The walking start must be inside the showcase area (poles excepted, where longitude is degenerate).
      expect(Math.abs(a.groundSpot.lat - a.lat), a.id).toBeLessThan(1.5);
      if (Math.abs(a.lat) < 89) expect(Math.abs(a.groundSpot.lon - a.lon), a.id).toBeLessThan(1.5);
      expect(a.tourPath, a.id).toBeDefined();
      for (const w of a.tourPath ?? []) {
        expect(Math.abs(w.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(w.lon)).toBeLessThanOrEqual(180);
        expect(w.heightM).toBeGreaterThan(0);
        expect(w.headingDeg).toBeGreaterThanOrEqual(0);
        expect(w.headingDeg).toBeLessThan(360);
        expect(w.pitchDeg).toBeLessThan(0);
        expect(w.durationS).toBeGreaterThan(0);
      }
      expect((a.tourPath ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('labels the rural Indian village honestly and places it on the Punjab plain', () => {
    const rural = SHOWCASE_AREAS.find((a) => a.category === 'rural');
    expect(rural).toBeDefined();
    expect(rural?.name).toMatch(/^Rural farmland near /);
    expect(rural?.country).toBe('India');
    expect(rural?.lat).toBeGreaterThan(29);
    expect(rural?.lat).toBeLessThan(32.5);
    expect(rural?.lon).toBeGreaterThan(73.5);
    expect(rural?.lon).toBeLessThan(77);
  });
});

describe('defineBookmark', () => {
  it('fills camera and data note from the category defaults', () => {
    const b = defineBookmark({ id: 'x-y', name: 'X', category: 'polar', continent: 'Antarctica', lat: -80, lon: 10, description: 'Test entry.' });
    expect(b.camera).toEqual(DEFAULT_CAMERA_BY_CATEGORY.polar);
    expect(b.dataNote).toMatch(/measured/);
    expect(b.country).toBeUndefined();
    expect(b.tags).toBeUndefined();
  });

  it('merges partial camera overrides and copies tags', () => {
    const tags = ['a'];
    const b = defineBookmark({ id: 'x', name: 'X', category: 'city', continent: 'Asia', lat: 0, lon: 0, description: 'Test entry.', camera: { headingDeg: 90 }, tags });
    expect(b.camera).toEqual({ ...DEFAULT_CAMERA_BY_CATEGORY.city, headingDeg: 90 });
    expect(b.tags).toEqual(['a']);
    expect(b.tags).not.toBe(tags);
  });
});
