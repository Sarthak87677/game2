import { describe, expect, it } from 'vitest';
import { generateTile, NEAR_FIELD_CAPS } from '@/world/procedural/generator';
import { NEAR_FIELD_ZOOM, type GenerationContext, type HeightField, type NearFieldTile } from '@/world/procedural/types';
import { speciesById } from '@/world/procedural/species';
import { distanceToPolyline, localFromLonLat, pointInPolygon, tileFrame, type Point2 } from '@/world/procedural/placement';
import { lonLatToTile, tileBounds, offsetToLonLat } from '@/util/geo';
import type { Biome } from '@/world/climate/biome';
import type { FeatureTile } from '@/data/adapters/features/types';

// ---- Synthetic context helpers ------------------------------------------------------------------------------------

const Z = NEAR_FIELD_ZOOM;
const flat = (v: number) => new Array(12).fill(v);
const LONDON_T = [5, 5, 7, 9, 13, 16, 18, 18, 15, 12, 8, 5];
const LONDON_P = [55, 40, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55];
const MANAUS_T = flat(27);
const MANAUS_P = [260, 288, 314, 300, 256, 114, 88, 58, 83, 126, 183, 217];
const BENGAL_T = [20, 23, 28, 30, 30, 30, 29, 29, 29, 28, 24, 20];
const BENGAL_P = [10, 25, 35, 55, 130, 290, 330, 340, 250, 130, 20, 5];
const SAHARA_T = [12, 15, 19, 24, 29, 32, 34, 34, 31, 26, 19, 13];
const TUNDRA_T = [-24, -24, -20, -12, -3, 5, 9, 7, 2, -6, -16, -22];
const ANTARCTIC_T = flat(-30);

interface CtxOptions {
  lat: number; lon: number; biome: Biome; date?: string; tempC?: number[]; precipMm?: number[];
  distCoastKm?: number; surface?: GenerationContext['surface']; osm?: FeatureTile | null; urbanDensity?: number;
  density?: number; terrain?: 'flat' | 'hilly' | 'none'; baseHeightM?: number;
}

function heightField(x: number, y: number, kind: 'flat' | 'hilly', base: number): HeightField {
  const b = tileBounds(x, y, Z);
  const w = 33;
  const h = 33;
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) heights[j * w + i] = kind === 'flat' ? base : base + 25 * Math.sin(i / 4) * Math.cos(j / 5) + 8 * Math.sin((i + j) / 2.5);
  return { width: w, height: h, heights, ...b };
}

function makeCtx(o: CtxOptions): GenerationContext & { frame: ReturnType<typeof tileFrame> } {
  const { x, y } = lonLatToTile(o.lon, o.lat, Z);
  const terrain = o.terrain ?? 'flat';
  return {
    z: Z, x, y, dateIso: o.date ?? '2024-09-15T12:00:00Z', biome: o.biome, koppen: 'Cfb',
    monthlyTempC: o.tempC ?? LONDON_T, monthlyPrecipMm: o.precipMm ?? LONDON_P, distCoastKm: o.distCoastKm ?? 200,
    surface: o.surface ?? 'land', heightField: terrain === 'none' ? null : heightField(x, y, terrain, o.baseHeightM ?? 120),
    osm: o.osm ?? null, urbanDensity: o.urbanDensity ?? 0, settlementName: null, density: o.density ?? 1,
    frame: tileFrame(x, y, Z),
  };
}

/** Empty OSM tile shell for the generation tile of `ctx`. */
function emptyOsm(ctx: GenerationContext): FeatureTile {
  return { key: `${ctx.z}/${ctx.x}/${ctx.y}`, z: ctx.z, x: ctx.x, y: ctx.y, bbox: tileBounds(ctx.x, ctx.y, ctx.z), buildings: [], roads: [], water: [], landuse: [], pois: [], fetchedAt: 0, source: 'cache', truncated: false };
}

/** Lon/lat for a local-metre point of a context's tile. */
function lonLatAt(ctx: GenerationContext, x: number, y: number): [number, number] {
  const f = tileFrame(ctx.x, ctx.y, ctx.z);
  const p = offsetToLonLat(f.anchorLat, f.anchorLon, x, y);
  return [p.lon, p.lat];
}

const trees = (t: NearFieldTile) => t.placements.filter((p) => ['tree', 'palm', 'cactus'].includes(speciesById(p.species)!.kind));
const withoutTiming = (t: NearFieldTile) => ({ ...t, generatedMs: 0 });
const tileHalf = (ctx: GenerationContext) => {
  const f = tileFrame(ctx.x, ctx.y, ctx.z);
  return { hw: f.widthM / 2, hh: f.heightM / 2 };
};

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const cross = (p: Point2, q: Point2, r: Point2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Independent overlap test for simple polygons: any edge crossing or containment. */
function polygonsOverlap(a: Point2[], b: Point2[]): boolean {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return pointInPolygon(b, a[0][0], a[0][1]) || pointInPolygon(a, b[0][0], b[0][1]);
}

// ---- Tests -----------------------------------------------------------------------------------------------------------

describe('generateTile', () => {
  const london = { lat: 51.5, lon: -0.12, biome: 'temperate_deciduous_forest' as Biome };

  it('is deterministic and isolates tiles', () => {
    const ctx = makeCtx({ ...london, terrain: 'hilly', urbanDensity: 0.2 });
    const a = generateTile(ctx);
    const b = generateTile(ctx);
    expect(withoutTiming(a)).toEqual(withoutTiming(b));
    expect(a.placements.length).toBeGreaterThan(100);
    const other = generateTile({ ...ctx, x: ctx.x + 1 });
    expect(other.seed).not.toBe(a.seed);
    const key = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    const setA = new Set(a.placements.map(key));
    const shared = other.placements.filter((p) => setA.has(key(p))).length;
    expect(shared).toBeLessThan(a.placements.length * 0.02);
    expect(a.key).toBe(`${Z}/${ctx.x}/${ctx.y}`);
    expect(a.anchorLat).toBeCloseTo(ctx.frame.anchorLat, 9);
  });

  it('keeps every placement, field and building inside the tile bounds', () => {
    for (const ctx of [makeCtx({ ...london, terrain: 'hilly', urbanDensity: 0.2 }), makeCtx({ ...london, urbanDensity: 0.9 }), makeCtx({ lat: -3.1, lon: -60, biome: 'tropical_rainforest', tempC: MANAUS_T, precipMm: MANAUS_P })]) {
      const t = generateTile(ctx);
      const { hw, hh } = tileHalf(ctx);
      for (const p of t.placements) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(hw + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(hh + 1e-6);
        expect(Number.isFinite(p.z)).toBe(true);
      }
      for (const b of t.buildings) for (const [x, y] of b.footprint) {
        expect(Math.abs(x)).toBeLessThanOrEqual(hw + 1e-6);
        expect(Math.abs(y)).toBeLessThanOrEqual(hh + 1e-6);
      }
      for (const f of t.fields) for (const [x, y] of f.polygon) {
        expect(Math.abs(x)).toBeLessThanOrEqual(hw + 1e-6);
        expect(Math.abs(y)).toBeLessThanOrEqual(hh + 1e-6);
      }
      const total = Object.values(t.counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(t.placements.length);
    }
  });

  it('samples terrain height into z', () => {
    const ctx = makeCtx({ ...london, terrain: 'flat', baseHeightM: 321 });
    const t = generateTile(ctx);
    expect(t.anchorHeightM).toBeCloseTo(321, 3);
    for (const p of t.placements) expect(p.z).toBeCloseTo(321, 3);
    const none = generateTile(makeCtx({ ...london, terrain: 'none' }));
    expect(none.placements.length).toBeGreaterThan(50);
    for (const p of none.placements) expect(p.z).toBe(0);
  });

  it('follows apple phenology: fruit in September, blossom (no fruit) in April', () => {
    let apples = 0;
    for (let dx = 0; dx < 8 && apples === 0; dx++) {
      const base = makeCtx({ ...london, date: '2024-09-15T12:00:00Z' });
      const sept = generateTile({ ...base, x: base.x + dx });
      const septApples = sept.placements.filter((p) => p.species === 'apple');
      apples = septApples.length;
      if (!apples) continue;
      for (const p of septApples) {
        expect(p.fruiting).toBe(1);
        expect(p.flowering).toBe(0);
        expect(p.leafOn).toBeGreaterThan(0.6);
      }
      const april = generateTile({ ...base, x: base.x + dx, dateIso: '2024-04-20T12:00:00Z' });
      const aprilApples = april.placements.filter((p) => p.species === 'apple');
      expect(aprilApples.length).toBe(apples);
      for (const p of aprilApples) {
        expect(p.fruiting).toBe(0);
        expect(p.flowering).toBe(1);
      }
      const jan = generateTile({ ...base, x: base.x + dx, dateIso: '2024-01-10T12:00:00Z' });
      for (const p of jan.placements.filter((p) => p.species === 'oak')) expect(p.leafOn).toBeLessThan(0.2);
    }
    expect(apples).toBeGreaterThan(0);
  });

  it('mirrors fruit windows in the southern hemisphere', () => {
    const base = { lat: -41.3, lon: 174.8, biome: 'temperate_deciduous_forest' as Biome, tempC: [18, 18, 16, 14, 11, 9, 8, 9, 11, 12, 14, 16] };
    let seen = 0;
    for (let dx = 0; dx < 8; dx++) {
      const ctx = makeCtx({ ...base, date: '2024-03-10T00:00:00Z' });
      const march = generateTile({ ...ctx, x: ctx.x + dx });
      const apples = march.placements.filter((p) => p.species === 'apple');
      if (!apples.length) continue;
      seen += apples.length;
      for (const p of apples) expect(p.fruiting).toBe(1);
      const sept = generateTile({ ...ctx, x: ctx.x + dx, dateIso: '2024-09-15T00:00:00Z' });
      for (const p of sept.placements.filter((p) => p.species === 'apple')) expect(p.fruiting).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('keeps bananas fruiting all year in a Manaus-like rainforest tile', () => {
    for (const month of [1, 4, 7, 10]) {
      const ctx = makeCtx({ lat: -3.1, lon: -60, biome: 'tropical_rainforest', tempC: MANAUS_T, precipMm: MANAUS_P, date: `2024-${String(month).padStart(2, '0')}-15T12:00:00Z` });
      const t = generateTile(ctx);
      const bananas = t.placements.filter((p) => p.species === 'banana');
      expect(bananas.length).toBeGreaterThan(0);
      for (const p of bananas) {
        expect(p.fruiting).toBe(1);
        expect(p.leafOn).toBe(1);
      }
      expect(trees(t).length).toBeGreaterThan(400);
      expect(t.placements.some((p) => p.species === 'apple' || p.species === 'spruce' || p.species === 'saguaro_cactus')).toBe(false);
    }
  });

  it('produces no trees and no fruit in Antarctic and tundra tiles', () => {
    const antarctic = generateTile(makeCtx({ lat: -75, lon: 0, biome: 'ice_sheet', tempC: ANTARCTIC_T, precipMm: flat(2), surface: 'glacier', date: '2024-01-15T00:00:00Z' }));
    expect(trees(antarctic)).toHaveLength(0);
    expect(antarctic.placements.every((p) => speciesById(p.species)!.kind === 'rock')).toBe(true);
    expect(antarctic.placements.length).toBeGreaterThan(0);
    const tundra = generateTile(makeCtx({ lat: 70, lon: 25, biome: 'tundra', tempC: TUNDRA_T, precipMm: flat(30), date: '2024-07-15T00:00:00Z', urbanDensity: 0.2 }));
    expect(trees(tundra)).toHaveLength(0);
    expect(tundra.placements.length).toBeGreaterThan(20);
    for (const p of tundra.placements) expect(p.fruiting).toBe(0);
    expect(tundra.fields).toHaveLength(0);
    expect(tundra.buildings).toHaveLength(0);
  });

  it('keeps a Sahara tile almost treeless with no crops', () => {
    const t = generateTile(makeCtx({ lat: 25, lon: 10, biome: 'hot_desert', tempC: SAHARA_T, precipMm: flat(2), urbanDensity: 0.2, date: '2024-07-01T00:00:00Z' }));
    expect(trees(t).length).toBeLessThan(15);
    expect(t.counts.crop).toBe(0);
    expect(t.fields).toHaveLength(0);
    // Date palms need an oasis (water); none exists without OSM water features.
    expect(t.placements.some((p) => p.species === 'date_palm')).toBe(false);
    expect(t.placements.some((p) => p.species === 'banana' || p.species === 'kapok')).toBe(false);
    expect(t.counts.rock + t.counts.shrub).toBeGreaterThan(20);
  });

  it('places rice only in monsoon/tropical farmland contexts', () => {
    const farmlandOsm = (ctx: GenerationContext): FeatureTile => {
      const osm = emptyOsm(ctx);
      const ring: [number, number][] = [lonLatAt(ctx, -200, -200), lonLatAt(ctx, 200, -200), lonLatAt(ctx, 200, 200), lonLatAt(ctx, -200, 200)];
      osm.landuse.push({ id: 'f1', kind: 'farmland', polygon: ring, name: null });
      return osm;
    };
    let riceTiles = 0;
    for (let dx = 0; dx < 6; dx++) {
      const base = makeCtx({ lat: 22.6, lon: 88.4, biome: 'tropical_seasonal_forest', tempC: BENGAL_T, precipMm: BENGAL_P, date: '2024-08-15T00:00:00Z' });
      const ctx = { ...base, x: base.x + dx };
      const t = generateTile({ ...ctx, osm: farmlandOsm(ctx) });
      expect(t.fields.length).toBe(1);
      expect(t.counts.crop).toBeGreaterThan(50);
      if (t.fields[0].crop === 'crop_rice') {
        riceTiles++;
        for (const p of t.placements.filter((p) => p.species === 'crop_rice')) expect(p.leafOn).toBeGreaterThan(0.9);
      }
    }
    expect(riceTiles).toBeGreaterThan(0);
    for (let dx = 0; dx < 6; dx++) {
      const base = makeCtx({ ...london, urbanDensity: 0.2 });
      const ctx = { ...base, x: base.x + dx };
      const withOsm = generateTile({ ...ctx, osm: farmlandOsm(ctx) });
      const procedural = generateTile(ctx);
      for (const t of [withOsm, procedural]) {
        expect(t.placements.some((p) => p.species === 'crop_rice')).toBe(false);
        expect(t.fields.some((f) => f.crop === 'crop_rice')).toBe(false);
      }
    }
  });

  it('keeps placements at least 4 m away from OSM roads', () => {
    const ctx = makeCtx({ ...london, terrain: 'hilly' });
    const osm = emptyOsm(ctx);
    const road: [number, number][] = [lonLatAt(ctx, -300, -120), lonLatAt(ctx, -40, 30), lonLatAt(ctx, 300, 90)];
    osm.roads.push({ id: 'r1', kind: 'tertiary', coords: road, name: null, widthM: 6, bridge: false, tunnel: false, lanes: null, oneway: false });
    const t = generateTile({ ...ctx, osm });
    const f = tileFrame(ctx.x, ctx.y, ctx.z);
    const local = road.map((c) => localFromLonLat(f, c[0], c[1]));
    expect(t.placements.length).toBeGreaterThan(100);
    for (const p of t.placements) expect(distanceToPolyline(local, p.x, p.y)).toBeGreaterThanOrEqual(4);
    // Something must lie near (but not within) the corridor, proving the exclusion is a band and not a wipe-out.
    expect(t.placements.some((p) => distanceToPolyline(local, p.x, p.y) < 30)).toBe(true);
  });

  it('excludes OSM buildings and water and suppresses procedural settlements when OSM has buildings', () => {
    const ctx = makeCtx({ ...london, urbanDensity: 0.9 });
    const osm = emptyOsm(ctx);
    const bRing: [number, number][] = [lonLatAt(ctx, -60, -60), lonLatAt(ctx, 60, -60), lonLatAt(ctx, 60, 60), lonLatAt(ctx, -60, 60)];
    osm.buildings.push({ id: 'b1', outer: bRing, holes: [], heightM: 10, levels: 3, heightSource: 'tag', type: 'yes', name: null, centroid: lonLatAt(ctx, 0, 0) });
    const wRing: [number, number][] = [lonLatAt(ctx, 120, 120), lonLatAt(ctx, 260, 120), lonLatAt(ctx, 260, 260), lonLatAt(ctx, 120, 260)];
    osm.water.push({ id: 'w1', kind: 'lake', polygon: wRing, line: null, name: null, widthM: 0 });
    const t = generateTile({ ...ctx, osm });
    const f = tileFrame(ctx.x, ctx.y, ctx.z);
    const b = bRing.map((c) => localFromLonLat(f, c[0], c[1]));
    const w = wRing.map((c) => localFromLonLat(f, c[0], c[1]));
    for (const p of t.placements) {
      expect(pointInPolygon(b, p.x, p.y)).toBe(false);
      expect(pointInPolygon(w, p.x, p.y)).toBe(false);
    }
    expect(t.buildings).toHaveLength(0);
    expect(t.placements.length).toBeGreaterThan(100);
  });

  it('scales instance counts with the density multiplier', () => {
    const full = generateTile(makeCtx({ ...london, terrain: 'hilly' }));
    const low = generateTile(makeCtx({ ...london, terrain: 'hilly', density: 0.3 }));
    const ratio = low.placements.length / full.placements.length;
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.42);
    expect(trees(full).length).toBeLessThanOrEqual(NEAR_FIELD_CAPS.tree);
    expect(full.counts.shrub).toBeLessThanOrEqual(NEAR_FIELD_CAPS.shrub);
    expect(full.counts.rock).toBeLessThanOrEqual(NEAR_FIELD_CAPS.rock);
    expect(full.counts.flower).toBeLessThanOrEqual(NEAR_FIELD_CAPS.flower);
    expect(generateTile(makeCtx({ ...london, density: 0 })).placements).toHaveLength(0);
  });

  it('generates a village with fields when OSM is absent and urban density is 0.2', () => {
    const t = generateTile(makeCtx({ ...london, urbanDensity: 0.2 }));
    expect(t.buildings.length).toBeGreaterThanOrEqual(6);
    for (const b of t.buildings) {
      expect(b.source).toBe('procedural');
      expect(b.footprint.length).toBeGreaterThanOrEqual(4);
      expect(b.heightM).toBeGreaterThanOrEqual(3.5);
      expect(b.heightM).toBeLessThanOrEqual(9);
      expect(['gable', 'hip', 'flat']).toContain(b.roof);
      expect(b.baseZ).toBeCloseTo(120, 3);
    }
    for (let i = 0; i < t.buildings.length; i++) for (let j = i + 1; j < t.buildings.length; j++) expect(polygonsOverlap(t.buildings[i].footprint, t.buildings[j].footprint), `${t.buildings[i].id} overlaps ${t.buildings[j].id}`).toBe(false);
    expect(t.fields.length).toBeGreaterThanOrEqual(2);
    expect(t.fields.length).toBeLessThanOrEqual(6);
    for (const f of t.fields) {
      expect(speciesById(f.crop)!.cultivated).toBe(true);
      expect(f.polygon.length).toBe(4);
      expect(f.colour).toMatch(/^#[0-9a-f]{6}$/i);
      for (const b of t.buildings) expect(polygonsOverlap(f.polygon, b.footprint)).toBe(false);
    }
    expect(t.counts.crop).toBeGreaterThan(0);
    // Crops sit inside their fields; wild vegetation stays outside footprints.
    for (const p of t.placements) {
      const s = speciesById(p.species)!;
      if (s.kind === 'crop') expect(t.fields.some((f) => pointInPolygon(f.polygon, p.x, p.y))).toBe(true);
      for (const b of t.buildings) expect(pointInPolygon(b.footprint, p.x, p.y)).toBe(false);
    }
    // Low urban density: fields but no village.
    const sparse = generateTile(makeCtx({ ...london, urbanDensity: 0.05 }));
    expect(sparse.buildings).toHaveLength(0);
    expect(sparse.fields.length).toBeGreaterThanOrEqual(2);
  });

  it('generates urban blocks above 0.5 urban density with no overlaps and towers when dense', () => {
    const t = generateTile(makeCtx({ ...london, urbanDensity: 0.95 }));
    expect(t.buildings.length).toBeGreaterThan(40);
    expect(t.buildings.some((b) => b.style === 'tower' && b.heightM >= 60)).toBe(true);
    for (const b of t.buildings) {
      expect(b.roof).toBe('flat');
      expect(b.source).toBe('procedural');
      expect(b.heightM).toBeLessThanOrEqual(150);
    }
    for (let i = 0; i < t.buildings.length; i++) for (let j = i + 1; j < t.buildings.length; j++) expect(polygonsOverlap(t.buildings[i].footprint, t.buildings[j].footprint)).toBe(false);
    // Sparse ornamentals only.
    expect(trees(t).length).toBeLessThan(200);
    expect(t.fields).toHaveLength(0);
    const suburban = generateTile(makeCtx({ ...london, urbanDensity: 0.55 }));
    expect(suburban.buildings.some((b) => b.style === 'tower')).toBe(false);
    const mean = suburban.buildings.reduce((a, b) => a + b.heightM, 0) / suburban.buildings.length;
    expect(mean).toBeLessThan(15);
  });

  it('returns an empty tile for ocean/lake surfaces', () => {
    const t = generateTile(makeCtx({ lat: 0, lon: -30, biome: 'ocean', surface: 'ocean' }));
    expect(t.placements).toHaveLength(0);
    expect(t.buildings).toHaveLength(0);
    expect(t.fields).toHaveLength(0);
    const lake = generateTile(makeCtx({ ...london, surface: 'lake', urbanDensity: 0.9 }));
    expect(lake.placements).toHaveLength(0);
    expect(lake.buildings).toHaveLength(0);
  });

  it('rejects an invalid date instead of guessing a season', () => {
    expect(() => generateTile(makeCtx({ ...london, date: 'not-a-date' }))).toThrow(/dateIso/);
  });

  it('generates a full-density tile quickly', () => {
    const ctx = makeCtx({ ...london, terrain: 'hilly', urbanDensity: 0.2 });
    generateTile(ctx); // warm-up (JIT)
    const t0 = performance.now();
    const t = generateTile({ ...ctx, x: ctx.x + 3 });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(400);
    expect(t.generatedMs).toBeLessThan(400);
    const urban = generateTile(makeCtx({ ...london, urbanDensity: 0.95, terrain: 'hilly' }));
    expect(urban.generatedMs).toBeLessThan(400);
  });
});
