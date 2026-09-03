import { Credit, Ellipsoid, Event as CesiumEvent, HeightmapTerrainData, Request, Resource, TerrainProvider, WebMercatorTilingScheme, type TerrainData, type TilingScheme } from 'cesium';
import { sharedTerrariumDecoder, type TerrariumDecoderPool } from './terrariumDecoder';
import type { TileCache } from '@/data/cache/tileCache';

export interface TerrariumTerrainProviderOptions {
  /** Tile URL template with {z}/{x}/{y}. Default: AWS Open Data Terrain Tiles (Terrarium encoding). */
  url?: string;
  /** Highest zoom level to request (Terrarium tiles exist to z15). */
  maximumLevel?: number;
  credit?: string | Credit;
  decoder?: TerrariumDecoderPool;
  /** Optional persistent cache for raw PNG tiles. */
  cache?: TileCache;
  /** Optional hook for streaming statistics. */
  onTile?: (event: { level: number; x: number; y: number; bytes: number; ms: number; error?: string }) => void;
}

export const TERRARIUM_DEFAULT_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/**
 * A CesiumJS TerrainProvider streaming Terrarium-encoded PNG tiles (Mapzen/AWS Terrain Tiles). No API key required.
 * Tiles are decoded in Web Workers into 256×256 height grids consumed by Cesium's heightmap mesher.
 */
export class TerrariumTerrainProvider implements TerrainProvider {
  readonly tilingScheme: TilingScheme;
  readonly errorEvent = new CesiumEvent();
  readonly credit: Credit;
  readonly hasWaterMask = false;
  readonly hasVertexNormals = false;
  readonly availability = undefined;
  readonly maximumLevel: number;
  private readonly resource: Resource;
  private readonly levelZeroMaximumGeometricError: number;
  private readonly decoder: TerrariumDecoderPool;
  private readonly onTile?: TerrariumTerrainProviderOptions['onTile'];
  private readonly cache?: TileCache;
  private readonly tileSize = 256;

  constructor(options: TerrariumTerrainProviderOptions = {}) {
    this.tilingScheme = new WebMercatorTilingScheme({ ellipsoid: Ellipsoid.WGS84 });
    this.maximumLevel = options.maximumLevel ?? 15;
    this.credit = typeof options.credit === 'string' || options.credit === undefined
      ? new Credit(options.credit ?? 'Terrain: Mapzen/AWS Terrain Tiles (SRTM, ETOPO1, GMTED2010, ArcticDEM, and others)', true)
      : options.credit;
    this.resource = new Resource({ url: options.url ?? TERRARIUM_DEFAULT_URL });
    this.levelZeroMaximumGeometricError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      Ellipsoid.WGS84, this.tileSize, this.tilingScheme.getNumberOfXTilesAtLevel(0));
    this.decoder = options.decoder ?? sharedTerrariumDecoder();
    this.onTile = options.onTile;
    this.cache = options.cache;
  }

  getLevelMaximumGeometricError(level: number): number {
    return this.levelZeroMaximumGeometricError / (1 << level);
  }

  getTileDataAvailable(_x: number, _y: number, level: number): boolean | undefined {
    return level <= this.maximumLevel;
  }

  loadTileDataAvailability(): undefined {
    return undefined;
  }

  requestTileGeometry(x: number, y: number, level: number, request?: Request): Promise<TerrainData> | undefined {
    if (level > this.maximumLevel) return undefined;
    const resource = this.resource.getDerivedResource({ templateValues: { z: String(level), x: String(x), y: String(y) }, request });
    const started = performance.now();
    const cacheKey = `terrarium/${level}/${x}/${y}`;
    const cache = this.cache;
    const fetchTile = (): Promise<ArrayBuffer> | undefined => {
      const p = resource.fetchArrayBuffer();
      if (!p) return undefined;
      return p.then((buf) => { if (cache) void cache.put(cacheKey, buf.slice(0)); return buf; });
    };
    let promise: Promise<ArrayBuffer> | undefined;
    if (cache) {
      promise = cache.get(cacheKey).then((hit) => {
        if (hit instanceof ArrayBuffer) return hit.slice(0);
        const p = fetchTile();
        if (!p) throw new Error('throttled');
        return p;
      });
    } else {
      promise = fetchTile();
      if (!promise) return undefined; // throttled by Cesium's request scheduler
    }
    return promise
      .then((buffer) => {
        const bytes = buffer.byteLength;
        return this.decoder.decode(buffer, this.tileSize, this.tileSize).then((decoded) => {
          this.onTile?.({ level, x, y, bytes, ms: performance.now() - started });
          return new HeightmapTerrainData({
            buffer: decoded.heights,
            width: this.tileSize,
            height: this.tileSize,
            childTileMask: level < this.maximumLevel ? 15 : 0,
            structure: { heightScale: 1, heightOffset: 0, elementsPerHeight: 1, stride: 1, elementMultiplier: 256, isBigEndian: false, lowestEncodedHeight: -32768, highestEncodedHeight: 32767 },
          }) as unknown as TerrainData;
        });
      })
      .catch((err: unknown) => {
        this.onTile?.({ level, x, y, bytes: 0, ms: performance.now() - started, error: err instanceof Error ? err.message : String(err) });
        throw err;
      });
  }
}
