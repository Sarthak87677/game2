import type { GeocodeResult, GeocodingAdapter } from '@/data/geocoding/types';
import { fetchJsonWithTimeout, RateLimiter } from './rateLimit';

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: { osm_id: number; name?: string; country?: string; city?: string; state?: string; osm_key?: string; osm_value?: string; type?: string } }

/** Komoot Photon geocoder (OSM-based, no key, fair-use). Optional alternative to Nominatim. */
export class PhotonAdapter implements GeocodingAdapter {
  readonly id = 'photon';
  readonly name = 'Photon (komoot)';
  readonly requiresNetwork = true;
  private limiter = new RateLimiter(600);
  private blockedUntil = 0;
  lastError: string | null = null;
  constructor(private url = 'https://photon.komoot.io/api/', private fetchImpl: typeof fetch = (i, init) => fetch(i, init)) {}

  async search(query: string, limit = 8): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 2 || Date.now() < this.blockedUntil) return [];
    try {
      const json = (await this.limiter.run(() => fetchJsonWithTimeout(this.fetchImpl, `${this.url}?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`, 8000))) as { features: PhotonFeature[] };
      this.lastError = null;
      return json.features.filter((f) => f.properties.name).map((f) => {
        const p = f.properties;
        const isCity = p.osm_key === 'place' && /city|town|village|hamlet/.test(p.osm_value ?? '');
        const isCountry = p.osm_key === 'place' && p.osm_value === 'country';
        const kind: GeocodeResult['kind'] = isCountry ? 'country' : isCity ? 'city' : p.osm_key === 'natural' ? 'physical' : 'landmark';
        return { id: `photon:${p.osm_id}`, name: p.name!, displayName: [p.name, p.city, p.state, p.country].filter(Boolean).join(', '), kind, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], heightM: kind === 'country' ? 3_000_000 : kind === 'city' ? 6000 : kind === 'physical' ? 15_000 : 800, source: 'photon' as const, score: 45 };
      });
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.blockedUntil = Date.now() + 120_000;
      return [];
    }
  }
}
