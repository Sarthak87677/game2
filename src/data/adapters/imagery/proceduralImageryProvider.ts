import { Credit, Event as CesiumEvent, GeographicTilingScheme, Rectangle, type ImageryProvider, type ImageryTypes, type Proxy, type Request, type TileDiscardPolicy, type TilingScheme } from 'cesium';
import type { NaturalEarth } from '@/data/naturalEarth';
import type { WorldMap } from '@/world/worldMap';
import { BIOME_INFO, type Biome } from '@/world/climate/biome';
import { BIOME_LIST } from '@/world/biomes';
import { fbm2 } from '@/util/hash';

export interface ProceduralImageryOptions {
  naturalEarth: () => NaturalEarth | null;
  worldMap: () => WorldMap | null;
  maximumLevel?: number;
  tileSize?: number;
}

interface Rgb { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * Offline base imagery: an inferred "climate atlas" look rendered from Natural Earth vectors, the WorldMap biome raster
 * and deterministic noise. It replaces satellite imagery when no network provider is available and is clearly labelled
 * as inferred/procedural in the UI. Geographic tiling covers the poles (unlike Web-Mercator satellite layers).
 */
export class ProceduralImageryProvider implements ImageryProvider {
  readonly tilingScheme: TilingScheme = new GeographicTilingScheme();
  readonly rectangle: Rectangle = Rectangle.MAX_VALUE;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly maximumLevel: number;
  readonly minimumLevel = 0;
  readonly tileDiscardPolicy = undefined as unknown as TileDiscardPolicy;
  readonly errorEvent = new CesiumEvent();
  readonly credit = new Credit('Base map: inferred climate atlas from Natural Earth (public domain) + Terra Infinite climate model', true);
  readonly proxy = undefined as unknown as Proxy;
  readonly hasAlphaChannel = false;
  private readonly opts: ProceduralImageryOptions;
  private palette: { base: Rgb; secondary: Rgb }[] = [];
  private canvasPool: HTMLCanvasElement[] = [];
  /** Number of tiles rendered (diagnostics). */
  tilesRendered = 0;

  constructor(opts: ProceduralImageryOptions) {
    this.opts = opts;
    this.tileWidth = opts.tileSize ?? 256;
    this.tileHeight = opts.tileSize ?? 256;
    this.maximumLevel = opts.maximumLevel ?? 10;
    this.palette = BIOME_LIST.map((b: Biome) => ({ base: hexToRgb(BIOME_INFO[b].groundPalette.base), secondary: hexToRgb(BIOME_INFO[b].groundPalette.secondary) }));
  }

  getTileCredits(): Credit[] {
    return [];
  }

  pickFeatures(): undefined {
    return undefined;
  }

  requestImage(x: number, y: number, level: number, _request?: Request): Promise<ImageryTypes> | undefined {
    const canvas = this.render(x, y, level);
    return Promise.resolve(canvas);
  }

  private takeCanvas(): HTMLCanvasElement {
    const c = this.canvasPool.pop() ?? document.createElement('canvas');
    c.width = this.tileWidth;
    c.height = this.tileHeight;
    return c;
  }

  private render(x: number, y: number, level: number): HTMLCanvasElement {
    const rect = this.tilingScheme.tileXYToRectangle(x, y, level);
    const west = (rect.west * 180) / Math.PI, east = (rect.east * 180) / Math.PI;
    const south = (rect.south * 180) / Math.PI, north = (rect.north * 180) / Math.PI;
    const w = this.tileWidth, h = this.tileHeight;
    const canvas = this.takeCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;
    const ne = this.opts.naturalEarth();
    const wm = this.opts.worldMap();

    // 1) Surface mask: crisp vector coastlines when Natural Earth is loaded, WorldMap raster otherwise.
    const mask = new Uint8Array(w * h); // 0 ocean 1 land 2 lake 3 glacier
    if (ne && ne.land.items.length > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.setTransform(w / (east - west), 0, 0, -h / (north - south), (-west * w) / (east - west), (north * h) / (north - south));
      ctx.fillStyle = '#010101';
      ctx.fill(ne.land.path, 'evenodd');
      ctx.fillStyle = '#020202';
      ctx.fill(ne.lakes.path, 'evenodd');
      ctx.fillStyle = '#030303';
      ctx.fill(ne.glaciers.path, 'evenodd');
      const px = ctx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < mask.length; i++) mask[i] = Math.min(3, px[i * 4]);
    } else if (wm) {
      for (let j = 0; j < h; j++) {
        const lat = north - ((j + 0.5) / h) * (north - south);
        for (let i = 0; i < w; i++) {
          const lon = west + ((i + 0.5) / w) * (east - west);
          mask[j * w + i] = wm.data.surface[wm.index(lat, lon)];
        }
      }
    }

    // 2) Colour pass.
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const noiseScale = 2 ** Math.min(level, 9) * 6;
    for (let j = 0; j < h; j++) {
      const lat = north - ((j + 0.5) / h) * (north - south);
      const v = (90 - lat) / 180;
      for (let i = 0; i < w; i++) {
        const lon = west + ((i + 0.5) / w) * (east - west);
        const u = (lon + 180) / 360;
        const p = (j * w + i) * 4;
        const m = mask[j * w + i];
        const n = fbm2(u * noiseScale, v * noiseScale * 0.5, 3, 7);
        let r: number, g: number, b: number;
        if (m === 0) {
          // Ocean: depth-shaded when coarse bathymetry is available.
          const depth = wm && wm.data.hasElevation ? Math.max(0, -wm.data.elevation[wm.index(lat, lon)]) : 3000;
          const t = Math.min(1, depth / 5000);
          const polar = Math.min(1, Math.max(0, (Math.abs(lat) - 60) / 25));
          r = 24 + 26 * (1 - t) + polar * 120;
          g = 62 + 60 * (1 - t) + polar * 110;
          b = 110 + 70 * (1 - t) + polar * 90;
          const k = 0.94 + 0.12 * n;
          r *= k; g *= k; b *= k;
        } else if (m === 3) {
          const k = 0.9 + 0.1 * n;
          r = 236 * k; g = 242 * k; b = 248 * k;
        } else if (m === 2) {
          r = 46 + 20 * n; g = 96 + 20 * n; b = 140 + 20 * n;
        } else {
          let base: Rgb, secondary: Rgb;
          let elev = 0;
          if (wm) {
            const idx = wm.index(lat, lon);
            const pal = this.palette[wm.data.biome[idx]] ?? this.palette[0];
            base = pal.base; secondary = pal.secondary;
            elev = wm.data.hasElevation ? Math.max(0, wm.data.elevation[idx]) : 0;
          } else {
            base = { r: 110, g: 130, b: 70 }; secondary = { r: 150, g: 140, b: 90 };
          }
          const t = n;
          r = base.r + (secondary.r - base.r) * t;
          g = base.g + (secondary.g - base.g) * t;
          b = base.b + (secondary.b - base.b) * t;
          // Elevation: rockier and lighter above ~2500 m, snow above a latitude-dependent snowline.
          const snowline = 5200 - Math.abs(lat) * 60;
          const rock = Math.min(1, Math.max(0, (elev - 2200) / 1800));
          const snow = Math.min(1, Math.max(0, (elev - snowline) / 600));
          r = r + (128 - r) * rock * 0.7; g = g + (120 - g) * rock * 0.7; b = b + (112 - b) * rock * 0.7;
          r = r + (245 - r) * snow; g = g + (247 - g) * snow; b = b + (250 - b) * snow;
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(img, 0, 0);

    // 3) Rivers at regional levels.
    if (ne && level >= 3 && ne.rivers.items.length > 0) {
      ctx.setTransform(w / (east - west), 0, 0, -h / (north - south), (-west * w) / (east - west), (north * h) / (north - south));
      ctx.strokeStyle = 'rgba(70,120,170,0.9)';
      ctx.lineWidth = ((east - west) / w) * (level >= 6 ? 1.6 : 1.1);
      ctx.lineJoin = 'round';
      ctx.stroke(ne.rivers.path);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.tilesRendered++;
    return canvas;
  }
}
