/**
 * Offline gazetteer built from the derived Natural Earth tables under
 * `public/data/ne` (see the README there) merged with the curated bookmarks.
 *
 * Pure TypeScript: data is injected through a `fetchJson` callback, so the
 * class works in the browser, in Node and in tests. Nothing here touches
 * Cesium or the network directly.
 */
import { WORLD_HIGHLIGHTS } from '../bookmarks/highlights';
import { SHOWCASE_AREAS } from '../bookmarks/showcase';
import type { Bookmark } from '../bookmarks/types';
import {
  bboxCentre,
  bboxContains,
  bboxDiagonalKm,
  bboxUnion,
  bboxWeightedArea,
  geometryBBox,
  haversineKm,
  isAreaGeometry,
  largestRingBBox,
  pointInGeometry,
  type AreaGeometry,
  type BBox,
} from './geometry';
import { boundedEditDistance, normalizeSearchText, slugify, titleCaseIfUpper, tokenizeSearchText } from './textMatch';
import type { GeocodeKind, GeocodeResult, GeocodingAdapter, NearestPlace } from './types';

/** Loader callback: fetches and parses a JSON document by URL. */
export type FetchJson = (url: string) => Promise<unknown>;

/** Raw source documents accepted by {@link OfflineGazetteer.fromData}. Any of them may be omitted. */
export interface GazetteerSourceData {
  /** `{columns:['name','country','iso2','lat','lon','pop','capital','rank'], rows}` */
  places?: unknown;
  /** `{columns:['name','kind','lat','lon'], rows}` */
  physicalPoints?: unknown;
  /** GeoJSON FeatureCollection with properties `{name, iso2, continent, pop}` */
  countries?: unknown;
  /** GeoJSON FeatureCollection with properties `{name, kind, region}` */
  regions?: unknown;
  /** GeoJSON FeatureCollection with properties `{name, kind}` */
  marine?: unknown;
  /** Curated bookmarks to merge (defaults to `WORLD_HIGHLIGHTS` + `SHOWCASE_AREAS`). */
  bookmarks?: readonly Bookmark[];
}

/** Per-source entry counts, for diagnostics and the attribution panel. */
export interface GazetteerStats {
  places: number;
  physicalPoints: number;
  countries: number;
  regions: number;
  marineAreas: number;
  bookmarks: number;
  /** Total searchable entries after de-duplication. */
  total: number;
}

type ResultBase = Omit<GeocodeResult, 'score'>;

interface IndexEntry {
  readonly result: ResultBase;
  /** Normalised name. */
  readonly norm: string;
  readonly words: readonly string[];
  /** Normalised aliases (bookmark tags, spelling variants). */
  readonly aliases: readonly string[];
  readonly aliasWords: readonly string[];
  /** Normalised spelling variants of the name only (st/saint, mt/mount); used with `norm` for de-duplication. */
  readonly variants: readonly string[];
  /** Normalised context words: country, continent, kind. */
  readonly context: readonly string[];
  /** Static relevance prior (population, capital, curated…). */
  readonly prior: number;
  readonly cosLat: number;
  readonly sinLat: number;
  readonly lonRad: number;
}

interface NamedArea {
  readonly name: string;
  readonly kind: string;
  readonly region?: string;
  readonly geometry: AreaGeometry;
  readonly bbox: BBox;
  readonly weightedArea: number;
}

interface ColumnTable {
  columns: string[];
  rows: unknown[][];
}

interface FeatureLike {
  properties: Record<string, unknown>;
  geometry: AreaGeometry;
}

const SOURCE_FILES = {
  places: 'places_50m.json',
  physicalPoints: 'physical_points_50m.json',
  countries: 'countries_110m.json',
  regions: 'regions_110m.json',
  marine: 'marine_110m.json',
} as const;

/** Duplicate point features within this distance and with the same normalised name are merged. */
const DEDUPE_KM = 50;
/** Beyond this distance from any named place the description falls back to the sea / region name. */
const FAR_KM = 300;
/** Within this distance a place is "near" even when the point lies inside a sea polygon. */
const COASTAL_KM = 50;
const DEG = Math.PI / 180;

const PHYSICAL_HEIGHT_M: Readonly<Record<string, number>> = {
  waterfall: 3000,
  cape: 8000,
  island: 15000,
  pole: 60000,
  plain: 60000,
};

const REGION_KIND_LABEL: Readonly<Record<string, string>> = {
  'Range/mtn': 'mountain range',
  'Pen/cape': 'peninsula',
  Geoarea: 'geographic area',
  'Island group': 'island group',
};

function cityHeightM(pop: number, capital: boolean): number {
  if (pop >= 5e6) return 20000;
  if (pop >= 1e6) return 12000;
  if (pop >= 2e5) return 7000;
  if (pop >= 5e4 || capital) return 4000;
  return 2500;
}

function areaHeightM(bbox: BBox, minM: number): number {
  return Math.round(Math.min(15_000_000, Math.max(minM, bboxDiagonalKm(bbox) * 1300)));
}

function bookmarkKind(b: Bookmark): GeocodeKind {
  if (b.category === 'city') return 'city';
  if (b.category === 'landmark' || b.category === 'mountain') return 'landmark';
  return 'bookmark';
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asColumnTable(raw: unknown, required: readonly string[]): ColumnTable | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;
  if (!t.columns.every((c) => typeof c === 'string')) return null;
  const columns = t.columns as string[];
  if (!required.every((c) => columns.includes(c))) return null;
  return { columns, rows: t.rows.filter((r): r is unknown[] => Array.isArray(r)) };
}

function asFeatures(raw: unknown): FeatureLike[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const fc = raw as { features?: unknown };
  if (!Array.isArray(fc.features)) return null;
  const out: FeatureLike[] = [];
  for (const f of fc.features) {
    if (typeof f !== 'object' || f === null) continue;
    const { properties, geometry } = f as { properties?: unknown; geometry?: unknown };
    if (typeof properties !== 'object' || properties === null || !isAreaGeometry(geometry)) continue;
    out.push({ properties: properties as Record<string, unknown>, geometry });
  }
  return out;
}

/** Spelling variants so that "st" ↔ "saint" and "mt" ↔ "mount" match. */
function spellingAliases(norm: string): string[] {
  const out: string[] = [];
  const pairs: Array<[string, string]> = [
    ['saint ', 'st '],
    ['st ', 'saint '],
    ['mount ', 'mt '],
    ['mt ', 'mount '],
    ['fort ', 'ft '],
  ];
  for (const [from, to] of pairs) {
    if (norm.startsWith(from)) out.push(to + norm.slice(from.length));
  }
  return out;
}

function makeEntry(result: ResultBase, opts: { aliases?: readonly string[]; context?: readonly string[]; prior: number }): IndexEntry {
  const norm = normalizeSearchText(result.name);
  const aliasSet = new Set<string>();
  for (const a of opts.aliases ?? []) {
    const n = normalizeSearchText(a);
    if (n && n !== norm) aliasSet.add(n);
  }
  const variants = spellingAliases(norm);
  for (const a of variants) aliasSet.add(a);
  const aliases = [...aliasSet];
  const contextSet = new Set<string>();
  for (const c of opts.context ?? []) {
    for (const w of tokenizeSearchText(normalizeSearchText(c))) contextSet.add(w);
  }
  return {
    result,
    norm,
    words: tokenizeSearchText(norm),
    aliases,
    aliasWords: aliases.flatMap(tokenizeSearchText),
    variants,
    context: [...contextSet],
    prior: opts.prior,
    cosLat: Math.cos(result.lat * DEG),
    sinLat: Math.sin(result.lat * DEG),
    lonRad: result.lon * DEG,
  };
}

class IdRegistry {
  private readonly used = new Set<string>();

  claim(base: string): string {
    let id = base;
    let n = 2;
    while (this.used.has(id)) id = `${base}-${n++}`;
    this.used.add(id);
    return id;
  }
}

function dedupePriority(e: IndexEntry): number {
  switch (e.result.kind) {
    case 'city':
    case 'capital':
      return 3;
    case 'physical':
      return 1;
    default:
      return e.result.source === 'terra-bookmarks' ? 2 : 0;
  }
}

function isPointLike(e: IndexEntry): boolean {
  const k = e.result.kind;
  return k === 'city' || k === 'capital' || k === 'landmark' || k === 'physical' || k === 'bookmark';
}

/** Merges duplicate point features (same normalised name or spelling variant within {@link DEDUPE_KM}). */
function dedupe(entries: IndexEntry[]): IndexEntry[] {
  const kept: IndexEntry[] = [];
  const byKey = new Map<string, number[]>();
  for (const e of entries) {
    if (!isPointLike(e)) {
      kept.push(e);
      continue;
    }
    const keys = [e.norm, ...e.variants];
    const candidates = [...new Set(keys.flatMap((k) => byKey.get(k) ?? []))].sort((a, b) => a - b);
    let merged = false;
    for (const idx of candidates) {
      const k = kept[idx];
      if (!isPointLike(k)) continue;
      if (haversineKm(k.result.lat, k.result.lon, e.result.lat, e.result.lon) > DEDUPE_KM) continue;
      const winner = dedupePriority(e) > dedupePriority(k) ? e : k;
      const loser = winner === e ? k : e;
      const bookmarkId = winner.result.bookmarkId ?? loser.result.bookmarkId;
      const aliases = [...new Set([...winner.aliases, ...loser.aliases])];
      const mergedEntry: IndexEntry = {
        ...winner,
        result: bookmarkId !== undefined ? { ...winner.result, bookmarkId } : winner.result,
        aliases,
        aliasWords: aliases.flatMap(tokenizeSearchText),
        prior: Math.max(winner.prior, loser.prior),
      };
      kept[idx] = mergedEntry;
      merged = true;
      break;
    }
    if (!merged) {
      for (const k of keys) {
        const list = byKey.get(k) ?? [];
        list.push(kept.length);
        byKey.set(k, list);
      }
      kept.push(e);
    }
  }
  return kept;
}

function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

/**
 * Offline place index: Natural Earth populated places, physical points,
 * countries, regions and seas merged with the curated bookmarks. Supports
 * ranked text search, nearest-place lookup and coarse reverse geocoding.
 */
export class OfflineGazetteer {
  /** Non-fatal problems encountered while loading (missing or malformed files). */
  readonly warnings: readonly string[];
  readonly stats: GazetteerStats;

  private readonly entries: readonly IndexEntry[];
  private readonly places: readonly IndexEntry[];
  private readonly named: readonly IndexEntry[];
  private readonly marine: readonly NamedArea[];
  private readonly regions: readonly NamedArea[];

  private constructor(
    entries: IndexEntry[],
    marine: NamedArea[],
    regions: NamedArea[],
    stats: GazetteerStats,
    warnings: string[],
  ) {
    this.entries = entries;
    this.places = entries.filter((e) => e.result.source === 'natural-earth' && (e.result.kind === 'city' || e.result.kind === 'capital'));
    this.named = entries.filter((e) => isPointLike(e));
    this.marine = marine;
    this.regions = regions;
    this.stats = stats;
    this.warnings = warnings;
  }

  /**
   * Loads the derived Natural Earth files from `baseUrl` (default `/data/ne`)
   * using the supplied JSON fetcher and merges the curated bookmarks. A file
   * that fails to load is skipped and reported in {@link warnings}; the
   * bookmarks are always available.
   */
  static async load(fetchJson: FetchJson, baseUrl = '/data/ne'): Promise<OfflineGazetteer> {
    const base = baseUrl.replace(/\/+$/, '');
    const keys = Object.keys(SOURCE_FILES) as Array<keyof typeof SOURCE_FILES>;
    const settled = await Promise.allSettled(keys.map((k) => fetchJson(`${base}/${SOURCE_FILES[k]}`)));
    const data: GazetteerSourceData = {};
    const warnings: string[] = [];
    keys.forEach((k, i) => {
      const r = settled[i];
      if (r.status === 'fulfilled') data[k] = r.value;
      else warnings.push(`${SOURCE_FILES[k]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    return OfflineGazetteer.fromData(data, warnings);
  }

  /** Builds a gazetteer synchronously from already-parsed documents. */
  static fromData(data: GazetteerSourceData, warnings: string[] = []): OfflineGazetteer {
    const ids = new IdRegistry();
    const entries: IndexEntry[] = [];
    const stats: GazetteerStats = { places: 0, physicalPoints: 0, countries: 0, regions: 0, marineAreas: 0, bookmarks: 0, total: 0 };

    // ── Populated places ──
    if (data.places !== undefined) {
      const table = asColumnTable(data.places, ['name', 'country', 'lat', 'lon']);
      if (!table) warnings.push('places: unexpected shape');
      else {
        const col = (name: string) => table.columns.indexOf(name);
        const ci = { name: col('name'), country: col('country'), iso2: col('iso2'), lat: col('lat'), lon: col('lon'), pop: col('pop'), capital: col('capital') };
        for (const row of table.rows) {
          const name = asString(row[ci.name]);
          const lat = asNumber(row[ci.lat]);
          const lon = asNumber(row[ci.lon]);
          if (name === null || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
          const country = asString(row[ci.country]) ?? '';
          const iso2 = (asString(row[ci.iso2]) ?? 'xx').toLowerCase();
          const pop = Math.max(0, asNumber(row[ci.pop]) ?? 0);
          const capital = row[ci.capital] === 1 || row[ci.capital] === true;
          entries.push(
            makeEntry(
              {
                id: ids.claim(`ne-place-${slugify(name)}-${iso2}`),
                name,
                displayName: country ? `${name}, ${country}` : name,
                kind: capital ? 'capital' : 'city',
                lat,
                lon,
                heightM: cityHeightM(pop, capital),
                source: 'natural-earth',
              },
              { context: [country, iso2, capital ? 'capital' : 'city'], prior: 15 * Math.log10(pop + 1) + (capital ? 25 : 0) },
            ),
          );
          stats.places++;
        }
      }
    }

    // ── Physical points ──
    if (data.physicalPoints !== undefined) {
      const table = asColumnTable(data.physicalPoints, ['name', 'kind', 'lat', 'lon']);
      if (!table) warnings.push('physical_points: unexpected shape');
      else {
        const col = (name: string) => table.columns.indexOf(name);
        const ci = { name: col('name'), kind: col('kind'), lat: col('lat'), lon: col('lon') };
        for (const row of table.rows) {
          const name = asString(row[ci.name]);
          const lat = asNumber(row[ci.lat]);
          const lon = asNumber(row[ci.lon]);
          if (name === null || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
          const kind = asString(row[ci.kind]) ?? 'feature';
          entries.push(
            makeEntry(
              {
                id: ids.claim(`ne-physical-${slugify(name)}`),
                name,
                displayName: `${name} (${kind})`,
                kind: 'physical',
                lat,
                lon,
                heightM: PHYSICAL_HEIGHT_M[kind] ?? 10000,
                source: 'natural-earth',
              },
              { context: [kind], prior: 30 },
            ),
          );
          stats.physicalPoints++;
        }
      }
    }

    // ── Countries ──
    if (data.countries !== undefined) {
      const features = asFeatures(data.countries);
      if (!features) warnings.push('countries: unexpected shape');
      else {
        for (const f of features) {
          const name = asString(f.properties.name);
          const bbox = largestRingBBox(f.geometry);
          if (name === null || !bbox) continue;
          const iso2 = (asString(f.properties.iso2) ?? '').toLowerCase();
          const continent = asString(f.properties.continent) ?? '';
          const pop = Math.max(0, asNumber(f.properties.pop) ?? 0);
          const centre = bboxCentre(bbox);
          entries.push(
            makeEntry(
              {
                id: ids.claim(`ne-country-${iso2 && iso2 !== '-99' ? iso2 : slugify(name)}`),
                name,
                displayName: continent ? `${name} (country, ${continent})` : `${name} (country)`,
                kind: 'country',
                lat: centre.lat,
                lon: centre.lon,
                heightM: areaHeightM(bbox, 150_000),
                source: 'natural-earth',
              },
              { context: [continent, iso2, 'country'], prior: 100 + 10 * Math.log10(pop + 1) },
            ),
          );
          stats.countries++;
        }
      }
    }

    // ── Regions (merged by name + kind) ──
    const regionAreas: NamedArea[] = [];
    if (data.regions !== undefined) {
      const features = asFeatures(data.regions);
      if (!features) warnings.push('regions: unexpected shape');
      else {
        const merged = new Map<string, { name: string; kind: string; region: string; bbox: BBox }>();
        for (const f of features) {
          const rawName = asString(f.properties.name);
          const bbox = geometryBBox(f.geometry);
          if (rawName === null || !bbox) continue;
          const kind = asString(f.properties.kind) ?? 'region';
          const region = asString(f.properties.region) ?? '';
          const name = titleCaseIfUpper(rawName);
          regionAreas.push({ name, kind, region, geometry: f.geometry, bbox, weightedArea: bboxWeightedArea(bbox) });
          const key = `${normalizeSearchText(name)}|${kind}`;
          const prev = merged.get(key);
          if (prev) prev.bbox = bboxUnion(prev.bbox, bbox);
          else merged.set(key, { name, kind, region, bbox });
        }
        for (const r of merged.values()) {
          const centre = bboxCentre(r.bbox);
          const kindLabel = REGION_KIND_LABEL[r.kind] ?? r.kind.toLowerCase();
          entries.push(
            makeEntry(
              {
                id: ids.claim(`ne-region-${slugify(r.name)}`),
                name: r.name,
                displayName: r.region && normalizeSearchText(r.region) !== normalizeSearchText(r.name) ? `${r.name} (${kindLabel}, ${r.region})` : `${r.name} (${kindLabel})`,
                kind: 'region',
                lat: centre.lat,
                lon: centre.lon,
                heightM: areaHeightM(r.bbox, 300_000),
                source: 'natural-earth',
              },
              { context: [r.region, kindLabel], prior: r.kind === 'Continent' ? 80 : 60 },
            ),
          );
          stats.regions++;
        }
      }
    }

    // ── Marine areas (searchable as regions, and used for reverse lookups) ──
    const marineAreas: NamedArea[] = [];
    if (data.marine !== undefined) {
      const features = asFeatures(data.marine);
      if (!features) warnings.push('marine: unexpected shape');
      else {
        for (const f of features) {
          const rawName = asString(f.properties.name);
          const bbox = geometryBBox(f.geometry);
          if (rawName === null || !bbox) continue;
          const kind = asString(f.properties.kind) ?? 'sea';
          const name = titleCaseIfUpper(rawName);
          marineAreas.push({ name, kind, geometry: f.geometry, bbox, weightedArea: bboxWeightedArea(bbox) });
          const centre = bboxCentre(bbox);
          entries.push(
            makeEntry(
              {
                id: ids.claim(`ne-marine-${slugify(name)}`),
                name,
                displayName: `${name} (${kind})`,
                kind: 'region',
                lat: centre.lat,
                lon: centre.lon,
                heightM: areaHeightM(bbox, 300_000),
                source: 'natural-earth',
              },
              { context: [kind, 'ocean', 'sea'], prior: 50 },
            ),
          );
          stats.marineAreas++;
        }
      }
    }

    // ── Bookmarks ──
    const bookmarks = data.bookmarks ?? [...WORLD_HIGHLIGHTS, ...SHOWCASE_AREAS];
    for (const b of bookmarks) {
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
      const place = b.country ?? (b.continent === 'Ocean' ? 'open ocean' : b.continent);
      entries.push(
        makeEntry(
          {
            id: ids.claim(b.id),
            name: b.name,
            displayName: `${b.name}, ${place}`,
            kind: bookmarkKind(b),
            lat: b.lat,
            lon: b.lon,
            heightM: b.camera.heightM,
            source: 'terra-bookmarks',
            bookmarkId: b.id,
          },
          { aliases: b.tags ?? [], context: [b.country ?? '', b.continent, b.category], prior: 70 },
        ),
      );
      stats.bookmarks++;
    }

    const deduped = dedupe(entries);
    stats.total = deduped.length;
    return new OfflineGazetteer(deduped, marineAreas, regionAreas, stats, warnings);
  }

  /** Number of searchable entries. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Ranked text search. Matching is diacritic- and case-insensitive:
   * exact > prefix > word-prefix > alias/tag > substring > fuzzy (edit distance ≤ 2
   * for queries of ≥ 5 characters); multi-word queries also match word by word
   * against the name and its context (country, continent, kind). Population,
   * capitals, countries and curated bookmarks are boosted. Ordering is stable.
   */
  search(query: string, limit = 10): GeocodeResult[] {
    const q = normalizeSearchText(query ?? '');
    if (q.length === 0) return [];
    const qWords = tokenizeSearchText(q);
    const max = Math.max(1, Math.min(100, Math.floor(limit) || 10));
    const scored: Array<{ entry: IndexEntry; score: number }> = [];
    for (const entry of this.entries) {
      const score = scoreEntry(entry, q, qWords);
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.result.name.localeCompare(b.entry.result.name, 'en') ||
        (a.entry.result.id < b.entry.result.id ? -1 : a.entry.result.id > b.entry.result.id ? 1 : 0),
    );
    return scored.slice(0, max).map(({ entry, score }) => ({ ...entry.result, score: Math.round(score * 10) / 10 }));
  }

  /**
   * Nearest populated places (Natural Earth cities and capitals) to a point,
   * closest first, with the great-circle distance in kilometres.
   */
  nearest(lat: number, lon: number, limit = 3): NearestPlace[] {
    return this.nearestOf(this.places, lat, lon, limit);
  }

  /**
   * Coarse reverse geocoding for the HUD, e.g. "Near Tokyo, Japan (12 km)",
   * "Tasman Sea, near Sydney, Australia (120 km)", "South Pacific Ocean" or
   * "Polar Plateau, Antarctica". Uses populated places and bookmarks within
   * 300 km, otherwise the containing sea, then the containing region.
   */
  describeLocation(lat: number, lon: number): string {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Unknown location';
    const near = this.nearestOf(this.named, lat, lon, 1)[0];
    const sea = this.containingArea(this.marine, lat, lon);
    if (near && near.distanceKm <= COASTAL_KM) {
      return near.distanceKm < 1 ? near.displayName : `Near ${near.displayName} (${formatKm(near.distanceKm)} km)`;
    }
    if (near && near.distanceKm <= FAR_KM) {
      const tail = `near ${near.displayName} (${formatKm(near.distanceKm)} km)`;
      return sea ? `${sea.name}, ${tail}` : `Near ${near.displayName} (${formatKm(near.distanceKm)} km)`;
    }
    if (sea) return sea.name;
    const region = this.containingArea(this.regions, lat, lon);
    if (region) {
      return region.region && normalizeSearchText(region.region) !== normalizeSearchText(region.name) ? `${region.name}, ${region.region}` : region.name;
    }
    return near ? `Remote area, nearest ${near.displayName} (${formatKm(near.distanceKm)} km)` : 'Unknown location';
  }

  /** Wraps this gazetteer as a {@link GeocodingAdapter} (offline, synchronous under the hood). */
  toAdapter(): GeocodingAdapter {
    return {
      id: 'offline-gazetteer',
      name: 'Offline gazetteer (Natural Earth + Terra bookmarks)',
      requiresNetwork: false,
      search: async (query, limit) => this.search(query, limit),
      reverse: async (lat, lon) => this.describeLocation(lat, lon),
    };
  }

  private nearestOf(pool: readonly IndexEntry[], lat: number, lon: number, limit: number): NearestPlace[] {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || pool.length === 0) return [];
    const max = Math.max(1, Math.min(100, Math.floor(limit) || 1));
    const latRad = lat * DEG;
    const lonRad = lon * DEG;
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const best: Array<{ entry: IndexEntry; cosAngle: number }> = [];
    for (const entry of pool) {
      // Spherical law of cosines on precomputed trig; larger cosine = closer.
      const cosAngle = sinLat * entry.sinLat + cosLat * entry.cosLat * Math.cos(entry.lonRad - lonRad);
      if (best.length < max) {
        best.push({ entry, cosAngle });
        if (best.length === max) best.sort((a, b) => b.cosAngle - a.cosAngle);
        continue;
      }
      if (cosAngle <= best[max - 1].cosAngle) continue;
      let i = max - 1;
      while (i > 0 && best[i - 1].cosAngle < cosAngle) {
        best[i] = best[i - 1];
        i--;
      }
      best[i] = { entry, cosAngle };
    }
    if (best.length < max) best.sort((a, b) => b.cosAngle - a.cosAngle);
    return best.map(({ entry }) => {
      const distanceKm = haversineKm(lat, lon, entry.result.lat, entry.result.lon);
      return { ...entry.result, score: Math.round((1000 / (1 + distanceKm)) * 10) / 10, distanceKm };
    });
  }

  private containingArea(areas: readonly NamedArea[], lat: number, lon: number): NamedArea | null {
    let best: NamedArea | null = null;
    for (const area of areas) {
      if (!bboxContains(area.bbox, lon, lat)) continue;
      if (!pointInGeometry(lon, lat, area.geometry)) continue;
      if (!best || area.weightedArea < best.weightedArea) best = area;
    }
    return best;
  }
}

function fuzzyDistance(entry: IndexEntry, q: string, max: number): number {
  let best = max + 1;
  const consider = (s: string) => {
    if (s.length < 4) return;
    const d = boundedEditDistance(q, s, max);
    if (d < best) best = d;
  };
  consider(entry.norm);
  for (const w of entry.words) consider(w);
  for (const a of entry.aliases) consider(a);
  for (const w of entry.aliasWords) consider(w);
  return best;
}

function matchTier(entry: IndexEntry, q: string): number {
  if (entry.norm === q) return 1000;
  if (entry.norm.startsWith(q)) return 850;
  for (let i = 1; i < entry.words.length; i++) {
    if (entry.words[i].startsWith(q)) return 750 - Math.min(i, 3) * 10;
  }
  // Aliases are bookmark tags and spelling variants: keywords rank below matches on the real name.
  if (entry.aliases.includes(q)) return 700;
  if (entry.aliases.some((a) => a.startsWith(q)) || entry.aliasWords.some((w) => w.startsWith(q))) return 680;
  if (entry.norm.includes(q)) return 550;
  if (q.length >= 5) {
    const d = fuzzyDistance(entry, q, 2);
    if (d <= 2) return 450 - 100 * (d - 1);
  }
  return 0;
}

function multiTokenTier(entry: IndexEntry, qWords: readonly string[]): number {
  let nameHits = 0;
  let contextHits = 0;
  for (const t of qWords) {
    if (entry.words.some((w) => w.startsWith(t)) || entry.aliasWords.some((w) => w.startsWith(t))) nameHits += 1;
    else if (entry.context.some((c) => c.startsWith(t))) contextHits += 1;
    else if (t.length >= 5 && entry.words.some((w) => w.length >= 4 && boundedEditDistance(t, w, 1) <= 1)) nameHits += 0.7;
  }
  if (nameHits === 0) return 0;
  return (600 * (nameHits + 0.6 * contextHits)) / qWords.length;
}

function scoreEntry(entry: IndexEntry, q: string, qWords: readonly string[]): number {
  let tier = matchTier(entry, q);
  let lengthPenalty = 0;
  if (tier > 0) lengthPenalty = Math.min(20, Math.max(0, entry.norm.length - q.length) * 0.5);
  else if (qWords.length >= 2) tier = multiTokenTier(entry, qWords);
  if (tier <= 0) return 0;
  return tier + entry.prior - lengthPenalty;
}
