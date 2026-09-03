import type { TileCache } from '@/data/cache/tileCache';
import { tileBounds } from '@/util/geo';
import { parseOverpass, type OverpassResponse } from './osmParse';
import type { FeatureAdapter, FeatureTile } from './types';

export interface OverpassAdapterOptions {
  url: string;
  cache?: TileCache;
  /** Minimum spacing between requests (public Overpass fair-use). */
  minIntervalMs?: number;
  timeoutS?: number;
  /** Cache freshness in ms (default 7 days). */
  maxAgeMs?: number;
  fetchImpl?: typeof fetch;
}

export function overpassQuery(bbox: { west: number; south: number; east: number; north: number }, timeoutS: number): string {
  const b = `${bbox.south.toFixed(6)},${bbox.west.toFixed(6)},${bbox.north.toFixed(6)},${bbox.east.toFixed(6)}`;
  return `[out:json][timeout:${timeoutS}][bbox:${b}];(
way["building"]["building"!="no"];
relation["building"]["type"="multipolygon"];
way["man_made"~"^(tower|lighthouse|chimney|water_tower|silo|storage_tank)$"];
relation["man_made"~"^(tower|lighthouse)$"]["type"="multipolygon"];
way["highway"]["highway"!~"^(proposed|construction|abandoned|razed|corridor|elevator|bus_stop|platform)$"];
way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"]["service"!~"."];
way["waterway"~"^(river|stream|canal|riverbank)$"];
way["natural"="water"];
relation["natural"="water"]["type"="multipolygon"];
way["landuse"~"^(forest|farmland|farmyard|residential|industrial|commercial|retail|grass|meadow|orchard|vineyard|recreation_ground|allotments|cemetery|reservoir)$"];
way["leisure"~"^(park|garden|pitch|golf_course|nature_reserve)$"];
way["natural"~"^(wood|wetland|scrub|heath|grassland|beach|sand)$"];
node["place"~"^(city|town|village|hamlet|suburb)$"];
node["tourism"~"^(attraction|viewpoint|museum)$"]["name"];
node["historic"]["name"];
);out body geom;`;
}

/**
 * Streams OpenStreetMap features per slippy tile through the Overpass API with a request throttle, timeouts,
 * IndexedDB caching and graceful offline degradation. Public Overpass instances are shared resources: usage is kept
 * light and users can point VITE_OVERPASS_URL at their own instance.
 */
export class OverpassAdapter implements FeatureAdapter {
  readonly id = 'overpass';
  readonly zoom = 15;
  private lastRequest = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private failures = 0;
  private blockedUntil = 0;
  lastError: string | null = null;
  requests = 0;
  cacheHits = 0;
  private readonly opts: Required<Omit<OverpassAdapterOptions, 'cache' | 'fetchImpl'>> & { cache?: TileCache; fetchImpl: typeof fetch };

  constructor(opts: OverpassAdapterOptions) {
    this.opts = { minIntervalMs: 1500, timeoutS: 25, maxAgeMs: 7 * 86400_000, ...opts, fetchImpl: opts.fetchImpl ?? ((input, init) => fetch(input, init)) };
  }

  isAvailable(): { available: boolean; reason?: string } {
    if (Date.now() < this.blockedUntil) return { available: false, reason: `Overpass unreachable (${this.lastError ?? 'network'}); retrying later` };
    return { available: true };
  }

  get online(): boolean | null {
    if (this.requests === 0) return null;
    return Date.now() >= this.blockedUntil;
  }

  async fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<FeatureTile> {
    const key = `osm/${z}/${x}/${y}`;
    const bbox = tileBounds(x, y, z);
    const cache = this.opts.cache;
    if (cache) {
      const hit = await cache.get(key);
      if (typeof hit === 'string') {
        try {
          const tile = JSON.parse(hit) as FeatureTile;
          if (Date.now() - tile.fetchedAt < this.opts.maxAgeMs) { this.cacheHits++; return { ...tile, source: 'cache' }; }
        } catch { /* fall through */ }
      }
    }
    if (Date.now() < this.blockedUntil) throw new Error(`Overpass temporarily disabled: ${this.lastError}`);
    // Serialise requests and respect the minimum interval.
    const run = this.chain.then(async () => {
      const wait = this.lastRequest + this.opts.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      this.lastRequest = Date.now();
      this.requests++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (this.opts.timeoutS + 5) * 1000);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      try {
        const res = await this.opts.fetchImpl(this.opts.url, { method: 'POST', body: 'data=' + encodeURIComponent(overpassQuery(bbox, this.opts.timeoutS)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: controller.signal });
        if (res.status === 429 || res.status === 504) { this.failures++; this.lastError = `HTTP ${res.status}`; this.blockedUntil = Date.now() + 60_000 * Math.min(10, this.failures); throw new Error(`Overpass ${res.status}`); }
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        const json = (await res.json()) as OverpassResponse;
        this.failures = 0;
        const tile = parseOverpass(json, { z, x, y, bbox }, Date.now());
        if (cache) void cache.put(key, JSON.stringify(tile));
        return tile;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError' && signal?.aborted) throw e;
        this.failures++;
        this.lastError = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch|NetworkError|network|ECONN|abort/i.test(this.lastError)) this.blockedUntil = Date.now() + 120_000 * Math.min(5, this.failures);
        throw e;
      } finally {
        clearTimeout(timer);
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
