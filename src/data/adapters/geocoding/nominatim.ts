import type { GeocodeResult, GeocodingAdapter } from '@/data/geocoding/types';
import { fetchJsonWithTimeout, RateLimiter } from './rateLimit';

interface NominatimRow { place_id: number; lat: string; lon: string; name?: string; display_name: string; category?: string; type?: string; addresstype?: string; importance?: number }

export interface NominatimOptions { url?: string; fetchImpl?: typeof fetch; minIntervalMs?: number; timeoutMs?: number }

function kindFor(row: NominatimRow): GeocodeResult['kind'] {
  const t = row.addresstype ?? row.type ?? '';
  if (t === 'country') return 'country';
  if (/city|town|village|hamlet|municipality|suburb|borough/.test(t)) return 'city';
  if (/peak|mountain|volcano|water|bay|river|lake|desert|island|glacier|forest|national_park/.test(`${row.category} ${t}`)) return 'physical';
  return 'landmark';
}

function heightFor(kind: GeocodeResult['kind'], importance: number): number {
  if (kind === 'country') return 3_000_000;
  if (kind === 'city') return importance > 0.6 ? 12_000 : 5_000;
  if (kind === 'physical') return 20_000;
  return 800;
}

/**
 * OpenStreetMap Nominatim geocoder (optional network adapter). Respects the public usage policy: ≤ 1 request/second,
 * no bulk use, results cached briefly. Configure VITE_NOMINATIM_URL to use your own instance.
 */
export class NominatimAdapter implements GeocodingAdapter {
  readonly id = 'nominatim';
  readonly name = 'OpenStreetMap Nominatim';
  readonly requiresNetwork = true;
  private limiter: RateLimiter;
  private fetchImpl: typeof fetch;
  private url: string;
  private timeoutMs: number;
  private cache = new Map<string, GeocodeResult[]>();
  private blockedUntil = 0;
  lastError: string | null = null;

  constructor(opts: NominatimOptions = {}) {
    this.url = (opts.url ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.limiter = new RateLimiter(opts.minIntervalMs ?? 1100);
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  get online(): boolean | null { return this.lastError === null ? null : Date.now() >= this.blockedUntil; }

  async search(query: string, limit = 8): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 2 || Date.now() < this.blockedUntil) return [];
    const key = `${q}|${limit}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const rows = (await this.limiter.run(() => fetchJsonWithTimeout(this.fetchImpl, `${this.url}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=${limit}&accept-language=en`, this.timeoutMs))) as NominatimRow[];
      const results = rows.map((r) => {
        const kind = kindFor(r);
        const importance = r.importance ?? 0.3;
        return { id: `nominatim:${r.place_id}`, name: r.name || r.display_name.split(',')[0], displayName: r.display_name, kind, lat: Number(r.lat), lon: Number(r.lon), heightM: heightFor(kind, importance), source: 'nominatim' as const, score: 40 + importance * 40 } satisfies GeocodeResult;
      });
      this.cache.set(key, results);
      this.lastError = null;
      return results;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.blockedUntil = Date.now() + 120_000;
      return [];
    }
  }

  async reverse(lat: number, lon: number): Promise<string | null> {
    if (Date.now() < this.blockedUntil) return null;
    try {
      const row = (await this.limiter.run(() => fetchJsonWithTimeout(this.fetchImpl, `${this.url}/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&format=jsonv2&zoom=14&accept-language=en`, this.timeoutMs))) as NominatimRow & { error?: string };
      if (row.error) return null;
      this.lastError = null;
      return row.display_name ?? null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.blockedUntil = Date.now() + 120_000;
      return null;
    }
  }
}
