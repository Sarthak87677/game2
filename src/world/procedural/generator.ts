/**
 * Deterministic near-field GENERATOR: turns a GenerationContext (biome, climate, height field, optional OSM features,
 * urban density) into a NearFieldTile of vegetation/rock placements, crop fields and procedural buildings in a
 * tile-local ENU frame. Pure TypeScript — runs in a Web Worker. Every random decision comes from tileRng(x, y, z,
 * layer) so a tile regenerates identically; content is plausible for the biome/season but is never a depiction of a
 * real place.
 */
import type { Biome } from '@/world/climate/biome';
import { BIOME_INFO } from '@/world/climate/biome';
import { hemisphereMonth, phenology, type Phenology } from '@/world/climate/season';
import { tileRng, tileSeed } from '@/world/seed';
import { fbm2, type Rng } from '@/util/hash';
import type { LandUseKind } from '@/data/adapters/features/types';
import type { BuildingSpec, GenerationContext, NearFieldTile, Species, SpeciesKind } from './types';
import { cropsForBiome, pickWeighted, speciesThermallyOk, weightedSpeciesForBiome, type WeightedSpecies } from './species';
import { boundsIntersect, clipPolygonToRect, convexPolygonsOverlap, createHeightSampler, distanceToPolygonEdge, distanceToPolyline, jitteredGrid, localFromLonLat, pointInPolygon, poissonDisk, polygonArea, polygonBounds, polygonCentroid, rotatedRect, tileFrame, type Bounds2, type HeightSampler, type Point2, type TileFrame } from './placement';
import { generateUrbanLayout, generateVillageLayout } from './settlements';

/** Per-tile instance caps at density 1. */
export const NEAR_FIELD_CAPS = { tree: 900, shrub: 400, rock: 300, grass: 250, flower: 120, crop: 600 } as const;

/** Biomes where farmland and villages are generated procedurally (when OSM data is absent). */
const FARMABLE: ReadonlySet<Biome> = new Set<Biome>(['tropical_rainforest', 'tropical_seasonal_forest', 'savanna', 'steppe', 'mediterranean', 'temperate_deciduous_forest', 'temperate_rainforest', 'temperate_grassland', 'boreal_forest', 'wetland']);

/** Shrub / flower / rock cover per biome (fraction of the cap), complementing BIOME_INFO tree/grass densities. */
const SHRUB_DENSITY: Record<Biome, number> = { ocean: 0, lake: 0, tropical_rainforest: 0.6, tropical_seasonal_forest: 0.5, savanna: 0.35, hot_desert: 0.2, cold_desert: 0.3, steppe: 0.3, mediterranean: 0.7, temperate_deciduous_forest: 0.45, temperate_rainforest: 0.6, temperate_grassland: 0.15, boreal_forest: 0.4, tundra: 0.35, alpine: 0.2, ice_sheet: 0, mangrove: 0.2, wetland: 0.4 };
const FLOWER_DENSITY: Record<Biome, number> = { ocean: 0, lake: 0, tropical_rainforest: 0.2, tropical_seasonal_forest: 0.25, savanna: 0.2, hot_desert: 0.1, cold_desert: 0.05, steppe: 0.4, mediterranean: 0.6, temperate_deciduous_forest: 0.5, temperate_rainforest: 0.3, temperate_grassland: 1, boreal_forest: 0.3, tundra: 0.4, alpine: 0.5, ice_sheet: 0, mangrove: 0, wetland: 0.4 };
const ROCK_DENSITY: Record<Biome, number> = { ocean: 0, lake: 0, tropical_rainforest: 0.1, tropical_seasonal_forest: 0.12, savanna: 0.15, hot_desert: 0.6, cold_desert: 0.6, steppe: 0.3, mediterranean: 0.3, temperate_deciduous_forest: 0.12, temperate_rainforest: 0.2, temperate_grassland: 0.08, boreal_forest: 0.25, tundra: 0.7, alpine: 0.9, ice_sheet: 0.4, mangrove: 0.02, wetland: 0.05 };

type Layer = 'tree' | 'shrub' | 'grass' | 'flower' | 'rock';
type Zone = LandUseKind | 'field' | 'settlement';

/** Acceptance probability of each vegetation layer inside a land-use zone (1 = biome density, 0 = excluded). */
const ZONE_ACCEPT: Record<Zone, Record<Layer, number>> = {
  forest: { tree: 1, shrub: 0.8, grass: 0.6, flower: 0.3, rock: 0.5 },
  park: { tree: 0.6, shrub: 0.5, grass: 1, flower: 1, rock: 0.1 },
  farmland: { tree: 0, shrub: 0, grass: 0.15, flower: 0.1, rock: 0 },
  orchard: { tree: 0, shrub: 0, grass: 0.3, flower: 0.1, rock: 0 },
  vineyard: { tree: 0, shrub: 0, grass: 0.3, flower: 0.1, rock: 0 },
  field: { tree: 0, shrub: 0, grass: 0.15, flower: 0.1, rock: 0 },
  residential: { tree: 0.15, shrub: 0.2, grass: 0.3, flower: 0.3, rock: 0 },
  settlement: { tree: 0.15, shrub: 0.2, grass: 0.3, flower: 0.3, rock: 0 },
  industrial: { tree: 0.05, shrub: 0.1, grass: 0.15, flower: 0.05, rock: 0 },
  commercial: { tree: 0.05, shrub: 0.1, grass: 0.15, flower: 0.05, rock: 0 },
  grass: { tree: 0.05, shrub: 0.1, grass: 1, flower: 1, rock: 0.05 },
  wetland: { tree: 0.2, shrub: 0.3, grass: 1, flower: 0.2, rock: 0 },
  scrub: { tree: 0.3, shrub: 1, grass: 0.6, flower: 0.4, rock: 0.6 },
  beach: { tree: 0, shrub: 0.05, grass: 0.05, flower: 0, rock: 0.3 },
  other: { tree: 1, shrub: 1, grass: 1, flower: 1, rock: 1 },
};

interface LocalPolygon { poly: Point2[]; bounds: Bounds2; zone: Zone }
interface LocalLine { pts: Point2[]; bounds: Bounds2; exclusion: number }

/** Everything a point must be tested against: OSM + procedural features in local metres. */
interface Scene {
  roads: LocalLine[];
  waterLines: LocalLine[];
  waterPolys: LocalPolygon[];
  buildings: LocalPolygon[];
  zones: LocalPolygon[];
  /** Zone applied where no polygon matches (urban tiles). */
  defaultZone: Zone | null;
  /** Wetland/mangrove biomes count as near water everywhere. */
  wetEverywhere: boolean;
}

interface PointInfo { blocked: boolean; zone: Zone | null; nearWater: boolean }

const WATER_NEAR_M = 40;

function classifyPoint(scene: Scene, x: number, y: number): PointInfo {
  let nearWater = scene.wetEverywhere;
  for (const r of scene.roads) {
    if (x < r.bounds.minX - r.exclusion || x > r.bounds.maxX + r.exclusion || y < r.bounds.minY - r.exclusion || y > r.bounds.maxY + r.exclusion) continue;
    if (distanceToPolyline(r.pts, x, y) < r.exclusion) return { blocked: true, zone: null, nearWater };
  }
  for (const b of scene.buildings) {
    if (x < b.bounds.minX - 2 || x > b.bounds.maxX + 2 || y < b.bounds.minY - 2 || y > b.bounds.maxY + 2) continue;
    if (pointInPolygon(b.poly, x, y) || distanceToPolygonEdge(b.poly, x, y) < 2) return { blocked: true, zone: null, nearWater };
  }
  for (const w of scene.waterPolys) {
    if (x < w.bounds.minX - WATER_NEAR_M || x > w.bounds.maxX + WATER_NEAR_M || y < w.bounds.minY - WATER_NEAR_M || y > w.bounds.maxY + WATER_NEAR_M) continue;
    if (pointInPolygon(w.poly, x, y)) return { blocked: true, zone: null, nearWater: true };
    if (!nearWater && distanceToPolygonEdge(w.poly, x, y) < WATER_NEAR_M) nearWater = true;
  }
  for (const w of scene.waterLines) {
    if (x < w.bounds.minX - WATER_NEAR_M || x > w.bounds.maxX + WATER_NEAR_M || y < w.bounds.minY - WATER_NEAR_M || y > w.bounds.maxY + WATER_NEAR_M) continue;
    const d = distanceToPolyline(w.pts, x, y);
    if (d < w.exclusion) return { blocked: true, zone: null, nearWater: true };
    if (d < WATER_NEAR_M) nearWater = true;
  }
  let zone: Zone | null = null;
  for (const z of scene.zones) {
    if (x < z.bounds.minX || x > z.bounds.maxX || y < z.bounds.minY || y > z.bounds.maxY) continue;
    if (pointInPolygon(z.poly, x, y)) {
      zone = z.zone;
      break;
    }
  }
  return { blocked: false, zone: zone ?? scene.defaultZone, nearWater };
}

/** Converts OSM features that touch the tile (plus a margin) into the local frame. */
function buildScene(ctx: GenerationContext, frame: TileFrame): Scene {
  const scene: Scene = { roads: [], waterLines: [], waterPolys: [], buildings: [], zones: [], defaultZone: null, wetEverywhere: ctx.biome === 'wetland' || ctx.biome === 'mangrove' };
  const osm = ctx.osm;
  if (!osm) return scene;
  const tile: Bounds2 = { minX: -frame.widthM / 2, minY: -frame.heightM / 2, maxX: frame.widthM / 2, maxY: frame.heightM / 2 };
  const toLocal = (coords: readonly [number, number][]): Point2[] => coords.map((c) => localFromLonLat(frame, c[0], c[1]));
  for (const r of osm.roads) {
    if (r.tunnel || r.coords.length < 2) continue;
    const pts = toLocal(r.coords);
    const bounds = polygonBounds(pts);
    const exclusion = Math.max(4, (r.widthM || 0) / 2 + 2);
    if (boundsIntersect(tile, bounds, exclusion)) scene.roads.push({ pts, bounds, exclusion });
  }
  for (const b of osm.buildings) {
    if (b.outer.length < 3) continue;
    const poly = toLocal(b.outer);
    const bounds = polygonBounds(poly);
    if (boundsIntersect(tile, bounds, 2)) scene.buildings.push({ poly, bounds, zone: 'other' });
  }
  for (const w of osm.water) {
    if (w.polygon && w.polygon.length >= 3) {
      const poly = toLocal(w.polygon);
      const bounds = polygonBounds(poly);
      if (boundsIntersect(tile, bounds, WATER_NEAR_M)) scene.waterPolys.push({ poly, bounds, zone: 'other' });
    } else if (w.line && w.line.length >= 2) {
      const pts = toLocal(w.line);
      const bounds = polygonBounds(pts);
      if (boundsIntersect(tile, bounds, WATER_NEAR_M)) scene.waterLines.push({ pts, bounds, exclusion: Math.max(1.5, (w.widthM || 0) / 2 + 1) });
    }
  }
  for (const l of osm.landuse) {
    if (l.polygon.length < 3) continue;
    const poly = toLocal(l.polygon);
    const bounds = polygonBounds(poly);
    if (boundsIntersect(tile, bounds)) scene.zones.push({ poly, bounds, zone: l.kind });
  }
  return scene;
}

/** Species-level phenology for the tile date, cached per species id. */
class PhenologyResolver {
  private cache = new Map<string, { leafOn: number; flowering: number; fruiting: number }>();
  private readonly hm: number;
  private readonly warm: boolean;
  private readonly wetLeafOn: number;
  constructor(private readonly ph: Phenology, date: Date, lat: number, tempC: readonly number[], precipMm: readonly number[]) {
    this.hm = hemisphereMonth(date, lat) + 1;
    const m = date.getUTCMonth();
    const temp = tempC[m];
    this.warm = temp === undefined || temp >= 5;
    if (ph.season === 'wet') this.wetLeafOn = 1;
    else if (ph.season === 'dry') this.wetLeafOn = 0.25;
    else if (precipMm.length === 12) {
      const mean = precipMm.reduce((a, b) => a + b, 0) / 12;
      this.wetLeafOn = Math.max(0.25, Math.min(1, 0.25 + 0.75 * Math.min(1, (precipMm[m] ?? mean) / Math.max(1, mean))));
    } else this.wetLeafOn = ph.leafOn;
  }
  get season(): Phenology['season'] {
    return this.ph.season;
  }
  get snowLikely(): boolean {
    return this.ph.snowLikely;
  }
  get(s: Species): { leafOn: number; flowering: number; fruiting: number } {
    let v = this.cache.get(s.id);
    if (v) return v;
    const inWindow = (months: readonly number[]) => months.includes(this.hm);
    // Species windows (hemisphere-mirrored) are authoritative; the generic phenology curve gates them, relaxed in warm
    // months so winter-fruiting evergreens (citrus, olive) and pre-monsoon fruiters (mango) keep their real windows.
    const flowering = s.flowers && inWindow(s.flowers.months) && (this.ph.flowering > 0 || this.warm) ? 1 : 0;
    const fruiting = s.fruit && inWindow(s.fruit.months) && (this.ph.fruiting > 0.3 || this.warm) ? 1 : 0;
    const leafOn = s.habit === 'evergreen' ? 1 : s.habit === 'seasonal-dry' ? this.wetLeafOn : this.ph.leafOn;
    v = { leafOn, flowering, fruiting };
    this.cache.set(s.id, v);
    return v;
  }
}

function emptyCounts(): Record<SpeciesKind, number> {
  return { tree: 0, shrub: 0, grass: 0, flower: 0, crop: 0, rock: 0, cactus: 0, palm: 0, reed: 0 };
}

const TREE_KINDS: readonly SpeciesKind[] = ['tree', 'palm', 'cactus'];
const SHRUB_KINDS: readonly SpeciesKind[] = ['shrub'];
const GRASS_KINDS: readonly SpeciesKind[] = ['grass', 'reed'];
const FLOWER_KINDS: readonly SpeciesKind[] = ['flower'];
const ROCK_KINDS: readonly SpeciesKind[] = ['rock'];

/** Per-point candidate filtering: slope, elevation and water affinity reshape the biome weights. */
function pickSpeciesAt(rng: Rng, candidates: readonly WeightedSpecies[], z: number, slope: number, nearWater: boolean, scratch: WeightedSpecies[]): Species | null {
  scratch.length = 0;
  for (const c of candidates) {
    const s = c.species;
    if (s.maxSlope !== undefined && slope > s.maxSlope) continue;
    if (s.elevationM && (z < s.elevationM[0] || z > s.elevationM[1])) continue;
    const w = s.waterAffinity ?? 0;
    let weight = c.weight;
    if (nearWater) weight *= 1 + 3 * w;
    else if (w >= 0.9) continue;
    else weight *= 1 - 0.6 * w;
    if (weight > 0) scratch.push({ species: s, weight });
  }
  return pickWeighted(rng, scratch);
}

/** Rows of a crop inside a polygon: points along lines of orientation `rowAngle`, thinned to a per-field budget. */
function cropRows(rng: Rng, poly: Point2[], rowAngle: number, spacingM: number, budget: number): Point2[] {
  const out: Point2[] = [];
  if (budget <= 0 || poly.length < 3) return out;
  const c = Math.cos(rowAngle);
  const s = Math.sin(rowAngle);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [x, y] of poly) {
    const u = x * c + y * s;
    const v = -x * s + y * c;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const rowSpacing = spacingM * 1.15;
  const along = spacingM;
  const phase = rng.next() * along;
  for (let v = vMin + rowSpacing / 2; v <= vMax; v += rowSpacing) {
    for (let u = uMin + phase; u <= uMax; u += along) {
      const x = u * c - v * s;
      const y = u * s + v * c;
      if (pointInPolygon(poly, x, y)) {
        out.push([x, y]);
        if (out.length >= budget) return out;
      }
    }
  }
  return out;
}

/** Mean/max slope over a coarse grid of the tile (flatness test for farmland and settlements). */
function tileSlopeStats(sampler: HeightSampler, halfW: number, halfH: number): { mean: number; max: number } {
  let sum = 0;
  let max = 0;
  let n = 0;
  for (let iy = -1; iy <= 1; iy++) {
    for (let ix = -1; ix <= 1; ix++) {
      const s = sampler.slopeAt(ix * halfW * 0.6, iy * halfH * 0.6);
      sum += s;
      if (s > max) max = s;
      n++;
    }
  }
  return { mean: sum / n, max };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Generates the near-field content of one tile. Throws on an unparseable `dateIso`; everything else degrades to an
 * empty (but valid) tile.
 */
export function generateTile(ctx: GenerationContext): NearFieldTile {
  const t0 = now();
  const frame = tileFrame(ctx.x, ctx.y, ctx.z);
  const halfW = frame.widthM / 2;
  const halfH = frame.heightM / 2;
  const sampler = createHeightSampler(ctx.heightField, frame);
  const seed = tileSeed(ctx.x, ctx.y, ctx.z, 'veg');
  const date = new Date(ctx.dateIso);
  if (Number.isNaN(date.getTime())) throw new Error(`generateTile: invalid dateIso "${ctx.dateIso}"`);
  const density = Math.max(0, Math.min(2, Number.isFinite(ctx.density) ? ctx.density : 1));
  const isWater = ctx.surface === 'ocean' || ctx.surface === 'lake' || ctx.biome === 'ocean' || ctx.biome === 'lake';
  const biome: Biome = ctx.surface === 'glacier' ? 'ice_sheet' : ctx.biome;
  const info = BIOME_INFO[biome];
  const tile: NearFieldTile = {
    key: `${ctx.z}/${ctx.x}/${ctx.y}`, z: ctx.z, x: ctx.x, y: ctx.y,
    anchorLat: frame.anchorLat, anchorLon: frame.anchorLon, anchorHeightM: sampler.heightAt(0, 0),
    biome, canopyColour: info.groundPalette.secondary, groundColour: info.groundPalette.base,
    placements: [], buildings: [], fields: [], seed, generatedMs: 0, counts: emptyCounts(),
  };
  if (isWater || density <= 0) {
    tile.generatedMs = now() - t0;
    return tile;
  }

  const vegRng = tileRng(ctx.x, ctx.y, ctx.z, 'veg');
  const rockRng = tileRng(ctx.x, ctx.y, ctx.z, 'rock');
  const cropRng = tileRng(ctx.x, ctx.y, ctx.z, 'crop');
  const settleRng = tileRng(ctx.x, ctx.y, ctx.z, 'settle');
  const pheno = new PhenologyResolver(phenology({ date, lat: frame.anchorLat, tempC: ctx.monthlyTempC, precipMm: ctx.monthlyPrecipMm }), date, frame.anchorLat, ctx.monthlyTempC ?? [], ctx.monthlyPrecipMm ?? []);
  const scene = buildScene(ctx, frame);
  const hasHeights = !!ctx.heightField;
  const slopeStats = tileSlopeStats(sampler, halfW, halfH);
  // Farmland tolerates rolling terrain (mean ≲ 16°); villages a little more, with the flattest centre chosen below.
  const flat = slopeStats.mean < 0.18 && slopeStats.max < 0.45;
  const villageOk = slopeStats.mean < 0.25;
  // Wetland is climate-agnostic: gate its library by the temperature profile so tropical swamps get palms, not willows.
  const library = (kinds: readonly SpeciesKind[]) => (biome === 'wetland' ? weightedSpeciesForBiome(biome, kinds).filter((c) => speciesThermallyOk(c.species, ctx.monthlyTempC ?? [])) : weightedSpeciesForBiome(biome, kinds));
  const speciesCounts = new Map<string, number>();
  const scratch: WeightedSpecies[] = [];
  const inTile = (p: Point2) => p[0] >= -halfW && p[0] <= halfW && p[1] >= -halfH && p[1] <= halfH;
  const footprintInTile = (poly: readonly Point2[]) => poly.every(inTile);

  const addPlacement = (s: Species, x: number, y: number, z: number, rng: Rng, rotation?: number) => {
    const p = pheno.get(s);
    tile.placements.push({ species: s.id, x, y, z, scale: Math.max(0.6, Math.min(1.5, 1 + rng.gaussian() * 0.15)), rotation: rotation ?? rng.next() * Math.PI * 2, variant: rng.next(), leafOn: p.leafOn, flowering: p.flowering, fruiting: p.fruiting });
    tile.counts[s.kind]++;
    speciesCounts.set(s.id, (speciesCounts.get(s.id) ?? 0) + 1);
  };

  // ---- Settlements (only where OSM has no buildings) ----------------------------------------------------------------
  const osmHasBuildings = !!ctx.osm && ctx.osm.buildings.length > 0;
  const urban = Math.max(0, Math.min(1, ctx.urbanDensity || 0));
  const farmable = FARMABLE.has(biome);
  const buildingOk = (b: BuildingSpec): boolean => {
    if (!footprintInTile(b.footprint)) return false;
    const c = polygonCentroid(b.footprint);
    if (sampler.slopeAt(c[0], c[1]) > 0.35) return false;
    if (hasHeights && ctx.distCoastKm < 5 && sampler.heightAt(c[0], c[1]) < 0.3) return false;
    if (ctx.osm) {
      const info = classifyPoint(scene, c[0], c[1]);
      if (info.blocked) return false;
      if (info.zone === 'forest' || info.zone === 'farmland' || info.zone === 'wetland' || info.zone === 'beach' || info.zone === 'orchard' || info.zone === 'vineyard') return false;
    }
    return true;
  };
  const addBuildings = (list: BuildingSpec[]) => {
    for (const b of list) {
      if (!buildingOk(b)) continue;
      tile.buildings.push(b);
      scene.buildings.push({ poly: b.footprint, bounds: polygonBounds(b.footprint), zone: 'other' });
    }
  };
  let villageCentre: Point2 | null = null;
  let villageRadius = 0;
  if (!osmHasBuildings && biome !== 'ice_sheet' && urban > 0.5 && slopeStats.mean < 0.25) {
    const layout = generateUrbanLayout(settleRng, Math.min(frame.widthM, frame.heightM), urban, sampler.heightAt);
    addBuildings(layout.buildings);
    for (const st of layout.streets) scene.roads.push({ pts: st, bounds: polygonBounds(st), exclusion: 6 });
    scene.defaultZone = 'settlement';
  } else if (!ctx.osm && farmable && urban > 0.08 && urban <= 0.5 && villageOk) {
    const sizeM = Math.min(Math.min(halfW, halfH) - 40, 120 + urban * 400);
    // Pick the flattest of a few seeded candidate centres.
    let best: Point2 = [0, 0];
    let bestSlope = Infinity;
    for (let i = 0; i < 4; i++) {
      const c: Point2 = [settleRng.range(-halfW + sizeM / 2 + 30, halfW - sizeM / 2 - 30), settleRng.range(-halfH + sizeM / 2 + 30, halfH - sizeM / 2 - 30)];
      const s = sampler.slopeAt(c[0], c[1]);
      if (s < bestSlope) {
        bestSlope = s;
        best = c;
      }
    }
    const layout = generateVillageLayout(settleRng, best, sizeM, 'rural', sampler.heightAt);
    addBuildings(layout.buildings);
    for (const lane of layout.lanes) scene.roads.push({ pts: lane, bounds: polygonBounds(lane), exclusion: 4 });
    villageCentre = best;
    villageRadius = sizeM / 2 + 25;
    const ring: Point2[] = [];
    for (let i = 0; i < 8; i++) ring.push([best[0] + Math.cos((i / 8) * Math.PI * 2) * villageRadius, best[1] + Math.sin((i / 8) * Math.PI * 2) * villageRadius]);
    scene.zones.push({ poly: ring, bounds: polygonBounds(ring), zone: 'settlement' });
  }

  // ---- Fields ----------------------------------------------------------------------------------------------------
  const fieldPolys: { poly: Point2[]; crop: Species; rowAngle: number }[] = [];
  const crops = cropsForBiome(biome);
  const orchardCrops = crops.filter((c) => c.id.startsWith('crop_orchard') || c.id === 'crop_date_palm' || c.id === 'crop_oil_palm');
  const vineCrops = crops.filter((c) => c.id === 'crop_vineyard');
  const rowCrops = crops.filter((c) => !orchardCrops.includes(c) && !vineCrops.includes(c));
  const pickCrop = (pool: Species[]): Species | null => (pool.length ? pickWeighted(cropRng, pool.map((s) => ({ species: s, weight: s.biomes[biome] ?? 0 }))) : null);
  const longestEdgeAngle = (poly: Point2[]): number => {
    let best = 0;
    let bestLen = -1;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const len = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
      if (len > bestLen) {
        bestLen = len;
        best = Math.atan2(poly[i][1] - poly[j][1], poly[i][0] - poly[j][0]);
      }
    }
    return best;
  };
  if (ctx.osm) {
    for (const l of ctx.osm.landuse) {
      if (l.kind !== 'farmland' && l.kind !== 'orchard' && l.kind !== 'vineyard') continue;
      const local = clipPolygonToRect(l.polygon.map((c) => localFromLonLat(frame, c[0], c[1])), -halfW, -halfH, halfW, halfH);
      if (local.length < 3 || polygonArea(local) < 400) continue;
      const crop = l.kind === 'orchard' ? pickCrop(orchardCrops) ?? pickCrop(rowCrops) : l.kind === 'vineyard' ? pickCrop(vineCrops) ?? pickCrop(rowCrops) : pickCrop(rowCrops);
      if (!crop) continue;
      fieldPolys.push({ poly: local, crop, rowAngle: longestEdgeAngle(local) + cropRng.range(-0.05, 0.05) });
    }
  } else if (farmable && urban >= 0.03 && urban <= 0.5 && flat && rowCrops.length > 0) {
    // Procedural patchwork: 2–6 quadrilateral fields of 60–200 m sharing a seeded orientation, non-overlapping.
    const n = 2 + cropRng.int(5);
    const baseAngle = cropRng.range(0, Math.PI);
    const quads: Point2[][] = [];
    for (let i = 0; i < 48 && quads.length < n; i++) {
      // Later attempts try smaller fields so crowded tiles (village + steep patches) still get their patchwork.
      const maxSize = i < 12 ? 200 : i < 30 ? 140 : 100;
      const w = cropRng.range(60, maxSize);
      const h = cropRng.range(60, maxSize);
      const cx = cropRng.range(-halfW + w / 2 + 5, halfW - w / 2 - 5);
      const cy = cropRng.range(-halfH + h / 2 + 5, halfH - h / 2 - 5);
      const ang = baseAngle + cropRng.range(-0.12, 0.12);
      const rect = rotatedRect(cx, cy, w / 2, h / 2, ang);
      // Slight quadrilateral skew on one corner.
      const skew = cropRng.range(-0.12, 0.12);
      const k = cropRng.int(4);
      rect[k] = [rect[k][0] + (rect[(k + 1) % 4][0] - rect[k][0]) * skew, rect[k][1] + (rect[(k + 1) % 4][1] - rect[k][1]) * skew];
      if (!footprintInTile(rect)) continue;
      if (quads.some((q) => convexPolygonsOverlap(q, rect, 6))) continue;
      if (villageCentre && (pointInPolygon(rect, villageCentre[0], villageCentre[1]) || distanceToPolygonEdge(rect, villageCentre[0], villageCentre[1]) < villageRadius)) continue;
      const c = polygonCentroid(rect);
      if (sampler.slopeAt(c[0], c[1]) > 0.25) continue;
      if (hasHeights && ctx.distCoastKm < 5 && sampler.heightAt(c[0], c[1]) < 0.3) continue;
      quads.push(rect);
      const pool = cropRng.next() < 0.15 && (orchardCrops.length || vineCrops.length) ? (cropRng.next() < 0.5 && orchardCrops.length ? orchardCrops : vineCrops.length ? vineCrops : orchardCrops) : rowCrops;
      const crop = pickCrop(pool) ?? pickCrop(rowCrops);
      if (crop) fieldPolys.push({ poly: rect, crop, rowAngle: ang + (cropRng.next() < 0.5 ? 0 : Math.PI / 2) });
    }
  }
  let totalFieldArea = 0;
  for (const f of fieldPolys) totalFieldArea += polygonArea(f.poly);
  const cropBudget = Math.round(NEAR_FIELD_CAPS.crop * density);
  for (const f of fieldPolys) {
    const ph = pheno.get(f.crop);
    const colour = ph.leafOn < 0.3 ? '#8a7250' : ph.fruiting && f.crop.fruit ? f.crop.fruit.colour : f.crop.leafColour;
    tile.fields.push({ id: `field-${tile.fields.length}`, polygon: f.poly, crop: f.crop.id, rowAngle: f.rowAngle, colour });
    scene.zones.unshift({ poly: f.poly, bounds: polygonBounds(f.poly), zone: 'field' });
    const area = polygonArea(f.poly);
    const budget = Math.max(0, Math.round((cropBudget * area) / Math.max(1, totalFieldArea)));
    const natural = Math.max(1.5, Math.min(8, (f.crop.heightM[0] + f.crop.heightM[1]) * 0.6));
    const spacing = Math.max(natural, Math.sqrt(area / Math.max(1, budget)));
    for (const [x, y] of cropRows(cropRng, f.poly, f.rowAngle, spacing, budget)) {
      const z = sampler.heightAt(x, y);
      if (hasHeights && ctx.distCoastKm < 5 && z < 0.3) continue;
      if (scene.roads.length || scene.buildings.length || scene.waterPolys.length || scene.waterLines.length) {
        const info = classifyPoint(scene, x, y);
        if (info.blocked) continue;
      }
      addPlacement(f.crop, x, y, z, cropRng, f.rowAngle);
    }
  }

  // ---- Vegetation and rocks ----------------------------------------------------------------------------------------
  const area = frame.widthM * frame.heightM;
  const square = Math.min(frame.widthM, frame.heightM);
  const iceOnly = biome === 'ice_sheet';
  const layer = (rng: Rng, kinds: readonly SpeciesKind[], cap: number, cover: number, layerName: Layer, poisson: boolean) => {
    const target = Math.round(cap * density * Math.max(0, Math.min(1, cover)));
    const candidates = library(kinds);
    if (target <= 0 || candidates.length === 0) return;
    let points: Point2[];
    if (poisson) {
      const n = Math.ceil(target * 1.25);
      points = poissonDisk(rng, frame.widthM, frame.heightM, Math.sqrt((0.8 * area) / n), Math.ceil(n * 1.15));
    } else points = jitteredGrid(rng, square, Math.sqrt(area / (target * 1.25)), 1);
    const noiseSeed = (seed + layerName.length * 7919) >>> 0;
    let placed = 0;
    for (const [x, y] of points) {
      if (placed >= target) break;
      if (!inTile([x, y])) continue;
      // Mild clumping: reject where low-frequency noise is low (≈ 20 % of points).
      if (layerName !== 'rock' && fbm2(x / 90 + ctx.x * 0.37, y / 90 + ctx.y * 0.61, 3, noiseSeed) < 0.4) continue;
      const z = sampler.heightAt(x, y);
      if (hasHeights && ctx.distCoastKm < 5 && z < 0.3 && layerName !== 'rock') continue;
      const info = classifyPoint(scene, x, y);
      if (info.blocked) continue;
      const accept = info.zone ? ZONE_ACCEPT[info.zone][layerName] : 1;
      if (accept <= 0) continue;
      if (accept < 1 && rng.next() > accept) continue;
      const sl = sampler.slopeAt(x, y);
      const s = pickSpeciesAt(rng, candidates, z, sl, info.nearWater, scratch);
      if (!s) continue;
      addPlacement(s, x, y, z, rng);
      placed++;
    }
  };
  const treeCover = info.treeDensity;
  const grassCover = info.grassDensity;
  if (!iceOnly) {
    layer(vegRng, TREE_KINDS, NEAR_FIELD_CAPS.tree, treeCover, 'tree', true);
    // OSM forest/park polygons get a dense fill when the biome itself is not already forested.
    if (ctx.osm && treeCover < 0.8) {
      const forestZones = scene.zones.filter((z) => z.zone === 'forest' || z.zone === 'park');
      if (forestZones.length) {
        const candidates = library(TREE_KINDS);
        const remaining = Math.round(NEAR_FIELD_CAPS.tree * density) - tile.counts.tree - tile.counts.palm - tile.counts.cactus;
        if (candidates.length && remaining > 0) {
          const pts = poissonDisk(vegRng, frame.widthM, frame.heightM, Math.sqrt((0.8 * area) / (NEAR_FIELD_CAPS.tree * density)), Math.ceil(NEAR_FIELD_CAPS.tree * density * 1.15));
          let placed = 0;
          for (const [x, y] of pts) {
            if (placed >= remaining) break;
            const fz = forestZones.find((z) => x >= z.bounds.minX && x <= z.bounds.maxX && y >= z.bounds.minY && y <= z.bounds.maxY && pointInPolygon(z.poly, x, y));
            if (!fz) continue;
            if (fz.zone === 'park' && vegRng.next() > 0.5) continue;
            const infoP = classifyPoint(scene, x, y);
            if (infoP.blocked) continue;
            const z = sampler.heightAt(x, y);
            if (hasHeights && ctx.distCoastKm < 5 && z < 0.3) continue;
            const s = pickSpeciesAt(vegRng, candidates, z, sampler.slopeAt(x, y), infoP.nearWater, scratch);
            if (!s) continue;
            addPlacement(s, x, y, z, vegRng);
            placed++;
          }
        }
      }
    }
    layer(vegRng, SHRUB_KINDS, NEAR_FIELD_CAPS.shrub, SHRUB_DENSITY[biome], 'shrub', true);
    layer(vegRng, GRASS_KINDS, NEAR_FIELD_CAPS.grass, grassCover, 'grass', false);
    layer(vegRng, FLOWER_KINDS, NEAR_FIELD_CAPS.flower, FLOWER_DENSITY[biome], 'flower', false);
  }
  layer(rockRng, ROCK_KINDS, NEAR_FIELD_CAPS.rock, ROCK_DENSITY[biome], 'rock', false);

  // ---- Colours ---------------------------------------------------------------------------------------------------
  let dominant: Species | null = null;
  let dominantCount = 0;
  for (const p of tile.placements) {
    if (p.species !== (dominant?.id ?? '') && (speciesCounts.get(p.species) ?? 0) > dominantCount) {
      const s = candidatesById(biome, p.species);
      if (s && TREE_KINDS.includes(s.kind)) {
        dominant = s;
        dominantCount = speciesCounts.get(p.species) ?? 0;
      }
    }
  }
  if (dominant) {
    const p = pheno.get(dominant);
    tile.canopyColour = dominant.autumnColour && dominant.habit !== 'evergreen' && pheno.season === 'autumn' && p.leafOn < 0.9 ? dominant.autumnColour : dominant.leafColour;
  }
  if (pheno.snowLikely && biome !== 'ice_sheet') tile.groundColour = '#e4e9ef';
  tile.generatedMs = now() - t0;
  return tile;
}

/** Species lookup restricted to the biome's library (cheap enough; only used for the dominant-colour pass). */
function candidatesById(biome: Biome, id: string): Species | null {
  for (const c of weightedSpeciesForBiome(biome, TREE_KINDS)) if (c.species.id === id) return c.species;
  return null;
}
