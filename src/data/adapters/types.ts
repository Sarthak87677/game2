/**
 * Data-adapter contracts. Every external data source in Terra Infinite is wrapped by one of these interfaces so
 * providers can be swapped (open/no-key defaults vs optional keyed services) and so the UI can show provenance.
 */
import type { ImageryProvider, TerrainProvider } from 'cesium';

/** How trustworthy a piece of information is, surfaced in the UI. */
export type Provenance = 'measured' | 'inferred' | 'procedural' | 'live';

export interface DataSourceInfo {
  /** Stable id used in settings and diagnostics, e.g. "terrarium". */
  id: string;
  /** Human label. */
  name: string;
  provider: string;
  dataset: string;
  url: string;
  coverage: string;
  resolution: string;
  lastUpdated: string;
  licence: string;
  attribution: string;
  /** HTML/markdown-free attribution line required on screen. */
  attributionShort: string;
  requiresApiKey: boolean;
  requiresNetwork: boolean;
  provenance: Provenance;
  /** What the app derives from it. */
  produces: string;
}

export interface AdapterAvailability {
  available: boolean;
  reason?: string;
}

export interface TerrainAdapter {
  readonly info: DataSourceInfo;
  isAvailable(): AdapterAvailability;
  createProvider(): Promise<TerrainProvider>;
  /** Highest zoom level with data (slippy-map convention). */
  readonly maxZoom: number;
}

export interface ImageryAdapter {
  readonly info: DataSourceInfo;
  isAvailable(): AdapterAvailability;
  createProvider(): Promise<ImageryProvider>;
  /** Highest zoom level with data. */
  readonly maxZoom: number;
  /** Suggested usage limit note (e.g. OSM tile policy) shown in settings. */
  readonly usageNote?: string;
}

export interface AdapterEnv {
  cesiumIonToken?: string;
  maptilerKey?: string;
  overpassUrl?: string;
  nominatimUrl?: string;
  enableLiveWeather?: boolean;
  disabledAdapters?: Set<string>;
}

/** Reads Vite env variables into a typed structure. Never logs secrets. */
export function readAdapterEnv(env: Record<string, string | boolean | undefined> = import.meta.env as Record<string, string | boolean | undefined>): AdapterEnv {
  const str = (k: string): string | undefined => {
    const v = env[k];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const disabled = new Set((str('VITE_DISABLED_ADAPTERS') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  // Runtime override for offline demos and end-to-end tests: ?terraFixtures=1 routes OSM to the synthetic responder
  // served by the dev/preview server (TERRA_FIXTURES=1) and disables other network adapters.
  const fixtures = typeof location !== 'undefined' && /[?&]terraFixtures=1/.test(location.search);
  if (fixtures) { disabled.add('nominatim'); disabled.add('open-meteo'); disabled.add('photon'); }
  return {
    cesiumIonToken: str('VITE_CESIUM_ION_TOKEN'),
    maptilerKey: str('VITE_MAPTILER_KEY'),
    overpassUrl: fixtures ? '/__fixtures/overpass' : str('VITE_OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter',
    nominatimUrl: str('VITE_NOMINATIM_URL') ?? 'https://nominatim.openstreetmap.org',
    enableLiveWeather: (str('VITE_ENABLE_LIVE_WEATHER') ?? 'true') !== 'false',
    disabledAdapters: disabled,
  };
}
