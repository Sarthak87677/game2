import { ArcGisMapServerImageryProvider, IonImageryProvider, Ion, OpenStreetMapImageryProvider, UrlTemplateImageryProvider, WebMapTileServiceImageryProvider, WebMercatorTilingScheme, type ImageryProvider } from 'cesium';
import type { AdapterEnv, ImageryAdapter } from '../types';
import { ProceduralImageryProvider, type ProceduralImageryOptions } from './proceduralImageryProvider';

export function createProceduralImageryAdapter(opts: ProceduralImageryOptions): ImageryAdapter {
  return {
    maxZoom: 10,
    info: {
      id: 'procedural', name: 'Inferred climate atlas (offline)', provider: 'Terra Infinite / Natural Earth', dataset: 'Natural Earth 1:50m vectors + Terra climate model',
      url: 'https://www.naturalearthdata.com/', coverage: 'Global incl. poles', resolution: '~1 km vectors, 39 km climate raster', lastUpdated: 'Natural Earth v5.1.2 (2022)',
      licence: 'Public domain (Natural Earth); MIT (Terra Infinite)', attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com', attributionShort: 'Natural Earth (public domain)',
      requiresApiKey: false, requiresNetwork: false, provenance: 'inferred', produces: 'Coastlines, lakes, glaciers, rivers (measured); biome colouring (inferred)',
    },
    isAvailable: () => ({ available: true }),
    createProvider: async () => new ProceduralImageryProvider(opts),
  };
}

export function createOsmImageryAdapter(env: AdapterEnv): ImageryAdapter {
  return {
    maxZoom: 19,
    usageNote: 'OpenStreetMap tile usage policy: light use only; heavy use requires your own tile server.',
    info: {
      id: 'osm', name: 'OpenStreetMap standard tiles', provider: 'OpenStreetMap Foundation', dataset: 'OSM Carto raster tiles', url: 'https://operations.osmfoundation.org/policies/tiles/',
      coverage: 'Global (±85°)', resolution: 'Zoom 0–19', lastUpdated: 'Continuously updated', licence: 'ODbL 1.0 (data); CC BY-SA 2.0 (tiles)',
      attribution: '© OpenStreetMap contributors', attributionShort: '© OpenStreetMap contributors', requiresApiKey: false, requiresNetwork: true, provenance: 'measured', produces: 'Map base layer',
    },
    isAvailable: () => (env.disabledAdapters?.has('osm') ? { available: false, reason: 'disabled by VITE_DISABLED_ADAPTERS' } : { available: true }),
    createProvider: async () => new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', maximumLevel: 19 }) as unknown as ImageryProvider,
  };
}

export function createEsriImageryAdapter(env: AdapterEnv): ImageryAdapter {
  return {
    maxZoom: 19,
    usageNote: 'Esri World Imagery is free for non-commercial and low-volume use under the Esri Terms of Use; add an ArcGIS key for production.',
    info: {
      id: 'esri', name: 'Esri World Imagery (satellite)', provider: 'Esri, Maxar, Earthstar Geographics and the GIS User Community', dataset: 'World_Imagery MapServer',
      url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9', coverage: 'Global (±85°)', resolution: '15 m global, 30–60 cm in many regions', lastUpdated: 'Rolling updates',
      licence: 'Esri Master Agreement / Terms of Use', attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', attributionShort: '© Esri, Maxar, Earthstar Geographics',
      requiresApiKey: false, requiresNetwork: true, provenance: 'measured', produces: 'Satellite base layer',
    },
    isAvailable: () => (env.disabledAdapters?.has('esri') ? { available: false, reason: 'disabled' } : { available: true }),
    createProvider: async () => (await ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { enablePickFeatures: false })) as unknown as ImageryProvider,
  };
}

export function createGibsImageryAdapter(env: AdapterEnv): ImageryAdapter {
  return {
    maxZoom: 8,
    info: {
      id: 'gibs', name: 'NASA GIBS Blue Marble (shaded relief + bathymetry)', provider: 'NASA EOSDIS GIBS', dataset: 'BlueMarble_ShadedRelief_Bathymetry', url: 'https://nasa-gibs.github.io/gibs-api-docs/',
      coverage: 'Global (±85°)', resolution: '500 m (zoom ≤ 8)', lastUpdated: '2004 composite', licence: 'Public domain (NASA)', attribution: 'NASA Global Imagery Browse Services (GIBS), NASA/GSFC/Earth Science Data and Information System',
      attributionShort: 'NASA GIBS', requiresApiKey: false, requiresNetwork: true, provenance: 'measured', produces: 'Orbital/continental base layer',
    },
    isAvailable: () => (env.disabledAdapters?.has('gibs') ? { available: false, reason: 'disabled' } : { available: true }),
    createProvider: async () => new WebMapTileServiceImageryProvider({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{TileMatrix}/{TileRow}/{TileCol}.jpeg',
      layer: 'BlueMarble_ShadedRelief_Bathymetry', style: 'default', format: 'image/jpeg', tileMatrixSetID: 'GoogleMapsCompatible_Level8',
      maximumLevel: 8, tilingScheme: new WebMercatorTilingScheme(), credit: 'NASA GIBS',
    }) as unknown as ImageryProvider,
  };
}

export function createMapTilerImageryAdapter(env: AdapterEnv): ImageryAdapter {
  return {
    maxZoom: 20,
    info: {
      id: 'maptiler', name: 'MapTiler Satellite', provider: 'MapTiler', dataset: 'satellite-v2', url: 'https://www.maptiler.com/', coverage: 'Global', resolution: 'Up to 0.3 m (zoom 20)', lastUpdated: 'Rolling',
      licence: 'MapTiler Terms of Service (API key)', attribution: '© MapTiler © OpenStreetMap contributors', attributionShort: '© MapTiler', requiresApiKey: true, requiresNetwork: true, provenance: 'measured', produces: 'High-resolution satellite base layer',
    },
    isAvailable: () => (env.maptilerKey ? { available: true } : { available: false, reason: 'VITE_MAPTILER_KEY not set' }),
    createProvider: async () => new UrlTemplateImageryProvider({ url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(env.maptilerKey ?? '')}`, maximumLevel: 20, credit: '© MapTiler © OpenStreetMap contributors' }) as unknown as ImageryProvider,
  };
}

export function createIonImageryAdapter(env: AdapterEnv): ImageryAdapter {
  return {
    maxZoom: 19,
    info: {
      id: 'ion', name: 'Cesium ion – Bing Maps Aerial', provider: 'Cesium ion / Microsoft Bing', dataset: 'Bing Maps Aerial (ion asset 2)', url: 'https://ion.cesium.com/', coverage: 'Global', resolution: 'Up to 0.3 m', lastUpdated: 'Rolling',
      licence: 'Cesium ion terms (free tier available)', attribution: '© Microsoft Bing, Cesium ion', attributionShort: '© Bing / Cesium ion', requiresApiKey: true, requiresNetwork: true, provenance: 'measured', produces: 'Satellite base layer',
    },
    isAvailable: () => (env.cesiumIonToken ? { available: true } : { available: false, reason: 'VITE_CESIUM_ION_TOKEN not set' }),
    createProvider: async () => {
      Ion.defaultAccessToken = env.cesiumIonToken ?? '';
      return (await IonImageryProvider.fromAssetId(2)) as unknown as ImageryProvider;
    },
  };
}
