import { CesiumTerrainProvider, EllipsoidTerrainProvider, Ion, type TerrainProvider } from 'cesium';
import type { AdapterEnv, TerrainAdapter } from '../types';
import { TERRARIUM_DEFAULT_URL, TerrariumTerrainProvider, type TerrariumTerrainProviderOptions } from './terrariumTerrainProvider';

export { TerrariumTerrainProvider, TERRARIUM_DEFAULT_URL };

export function createTerrariumTerrainAdapter(env: AdapterEnv, options: TerrariumTerrainProviderOptions = {}): TerrainAdapter {
  return {
    maxZoom: 15,
    info: {
      id: 'terrarium', name: 'AWS Terrain Tiles (Terrarium)', provider: 'Amazon Web Services Open Data / Mapzen', dataset: 'Terrain Tiles (terrarium PNG)', url: 'https://registry.opendata.aws/terrain-tiles/',
      coverage: 'Global incl. bathymetry', resolution: '≈30 m (zoom 15) where SRTM/NED exist; coarser elsewhere', lastUpdated: '2017 build (sources: SRTM, NED, ETOPO1, GMTED2010, ArcticDEM, EU-DEM, Australia, Mexico, Norway, NZ, Canada)',
      licence: 'Open (source datasets are public domain or open licences; see registry)', attribution: 'Terrain Tiles: Mapzen/AWS – SRTM (NASA), ETOPO1 (NOAA), GMTED2010 (USGS), ArcticDEM (PGC), EU-DEM (EEA) and others',
      attributionShort: 'Terrain: Mapzen/AWS Terrain Tiles', requiresApiKey: false, requiresNetwork: true, provenance: 'measured', produces: 'Elevation, slope, bathymetry, coarse climate lapse rate',
    },
    isAvailable: () => (env.disabledAdapters?.has('terrarium') ? { available: false, reason: 'disabled' } : { available: true }),
    createProvider: async () => new TerrariumTerrainProvider(options) as unknown as TerrainProvider,
  };
}

export function createEllipsoidTerrainAdapter(): TerrainAdapter {
  return {
    maxZoom: 0,
    info: {
      id: 'ellipsoid', name: 'Smooth ellipsoid (no terrain)', provider: 'CesiumJS', dataset: 'WGS84 ellipsoid', url: 'https://cesium.com/platform/cesiumjs/', coverage: 'Global', resolution: 'n/a', lastUpdated: 'n/a',
      licence: 'Apache 2.0', attribution: 'CesiumJS', attributionShort: 'CesiumJS', requiresApiKey: false, requiresNetwork: false, provenance: 'procedural', produces: 'Flat reference surface (fallback when offline)',
    },
    isAvailable: () => ({ available: true }),
    createProvider: async () => new EllipsoidTerrainProvider(),
  };
}

export function createIonTerrainAdapter(env: AdapterEnv): TerrainAdapter {
  return {
    maxZoom: 16,
    info: {
      id: 'ion', name: 'Cesium World Terrain', provider: 'Cesium ion', dataset: 'Cesium World Terrain (asset 1)', url: 'https://cesium.com/platform/cesium-ion/content/cesium-world-terrain/', coverage: 'Global', resolution: '≈30 m global, up to 1–5 m in places',
      lastUpdated: 'Rolling', licence: 'Cesium ion terms (free tier)', attribution: 'Cesium World Terrain', attributionShort: 'Cesium World Terrain', requiresApiKey: true, requiresNetwork: true, provenance: 'measured', produces: 'Elevation with water mask and vertex normals',
    },
    isAvailable: () => (env.cesiumIonToken ? { available: true } : { available: false, reason: 'VITE_CESIUM_ION_TOKEN not set' }),
    createProvider: async () => {
      Ion.defaultAccessToken = env.cesiumIonToken ?? '';
      return CesiumTerrainProvider.fromIonAssetId(1, { requestWaterMask: true, requestVertexNormals: true });
    },
  };
}
