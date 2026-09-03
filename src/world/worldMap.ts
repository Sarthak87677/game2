/**
 * WorldMap: a coarse equirectangular raster (default 1024×512, ~39 km at the equator) combining Natural Earth surface
 * masks, coarse Terrarium elevation and the climate/biome model. It is the single source of truth for biome lookups on
 * the CPU (procedural generation, HUD readouts, procedural imagery) and on the GPU (ground material biome texture).
 * The raster is built in a Web Worker (see workers/worldMap.worker.ts).
 */
import type { Biome } from '@/world/climate/biome';
import { BIOME_LIST } from '@/world/biomes';
import type { KoppenClass } from '@/world/climate/koppen';

export const WORLD_MAP_WIDTH = 1024;
export const WORLD_MAP_HEIGHT = 512;
export const CLIMATE_GRID_WIDTH = 256;
export const CLIMATE_GRID_HEIGHT = 128;

/** Surface classes stored in WorldMapData.surface. */
export const SURFACE_OCEAN = 0;
export const SURFACE_LAND = 1;
export const SURFACE_LAKE = 2;
export const SURFACE_GLACIER = 3;

export interface WorldMapData {
  width: number;
  height: number;
  /** 0 ocean, 1 land, 2 lake, 3 glacier. */
  surface: Uint8Array;
  /** Coarse elevation in metres (Int16), bathymetry negative. */
  elevation: Int16Array;
  /** Index into BIOME_LIST. */
  biome: Uint8Array;
  /** Index into KOPPEN_LIST. */
  koppen: Uint8Array;
  /** Annual mean temperature °C ×1 (Int8). */
  annualTemp: Int8Array;
  /** Annual precipitation mm (Uint16). */
  annualPrecip: Uint16Array;
  /** Distance to coast km (Uint16), 0 on the ocean. */
  distCoast: Uint16Array;
  /** Coarse monthly climate at sea level: [CLIMATE_GRID_HEIGHT][CLIMATE_GRID_WIDTH][12]. */
  monthlyTemp: Float32Array;
  monthlyPrecip: Float32Array;
  /** Whether coarse elevation was actually fetched (false → elevation all zero). */
  hasElevation: boolean;
  /** Build diagnostics. */
  buildMs: number;
}

export const KOPPEN_LIST: KoppenClass[] = ['Af', 'Am', 'Aw', 'As', 'BWh', 'BWk', 'BSh', 'BSk', 'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc', 'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd', 'ET', 'EF'];

export interface WorldSample {
  surface: 'ocean' | 'land' | 'lake' | 'glacier';
  elevationM: number;
  biome: Biome;
  koppen: KoppenClass;
  annualTempC: number;
  annualPrecipMm: number;
  distCoastKm: number;
  monthlyTempC: number[];
  monthlyPrecipMm: number[];
}

const SURFACE_NAMES: WorldSample['surface'][] = ['ocean', 'land', 'lake', 'glacier'];

export class WorldMap {
  constructor(readonly data: WorldMapData) {}

  get width(): number { return this.data.width; }
  get height(): number { return this.data.height; }

  /** Raster index for a lat/lon (nearest cell). */
  index(lat: number, lon: number): number {
    const { width, height } = this.data;
    const x = Math.min(width - 1, Math.max(0, Math.floor(((lon + 180) / 360) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
    return y * width + x;
  }

  /** Index of the nearest cell whose surface is land/lake/glacier within `radius` cells, or the cell itself. */
  nearestLandIndex(lat: number, lon: number, radius = 3): number {
    const d = this.data;
    const i0 = this.index(lat, lon);
    if (d.surface[i0] !== SURFACE_OCEAN) return i0;
    const x0 = i0 % d.width, y0 = Math.floor(i0 / d.width);
    let best = i0, bestD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const x = (x0 + dx + d.width) % d.width, y = y0 + dy;
      if (y < 0 || y >= d.height) continue;
      const i = y * d.width + x;
      if (d.surface[i] === SURFACE_OCEAN) continue;
      const dist = dx * dx + dy * dy;
      if (dist < bestD) { bestD = dist; best = i; }
    }
    return best;
  }

  /**
   * Samples the raster at a point. With `preferLand` (use when a precise vector source says the point is on land, e.g.
   * a coastal city) the nearest land cell is used so 39 km ocean cells do not swallow coastlines.
   */
  sample(lat: number, lon: number, preferLand = false): WorldSample {
    const d = this.data;
    const i = preferLand ? this.nearestLandIndex(lat, lon) : this.index(lat, lon);
    const cx = Math.min(CLIMATE_GRID_WIDTH - 1, Math.max(0, Math.floor(((lon + 180) / 360) * CLIMATE_GRID_WIDTH)));
    const cy = Math.min(CLIMATE_GRID_HEIGHT - 1, Math.max(0, Math.floor(((90 - lat) / 180) * CLIMATE_GRID_HEIGHT)));
    const ci = (cy * CLIMATE_GRID_WIDTH + cx) * 12;
    const elevation = d.elevation[i];
    const lapse = Math.max(0, elevation) * 0.0065;
    const monthlyTempC: number[] = [];
    const monthlyPrecipMm: number[] = [];
    for (let m = 0; m < 12; m++) {
      monthlyTempC.push(d.monthlyTemp[ci + m] - lapse);
      monthlyPrecipMm.push(d.monthlyPrecip[ci + m]);
    }
    return {
      surface: SURFACE_NAMES[d.surface[i]] ?? 'ocean',
      elevationM: elevation,
      biome: BIOME_LIST[d.biome[i]] ?? 'ocean',
      koppen: KOPPEN_LIST[d.koppen[i]] ?? 'Af',
      annualTempC: d.annualTemp[i],
      annualPrecipMm: d.annualPrecip[i],
      distCoastKm: d.distCoast[i],
      monthlyTempC,
      monthlyPrecipMm,
    };
  }

  /** Bilinear-free fast biome id lookup used by rasterisers. */
  biomeIdAt(lat: number, lon: number): number {
    return this.data.biome[this.index(lat, lon)];
  }

  /**
   * Builds the RGBA biome texture consumed by the ground material shader:
   * R = biome index, G = annual temp + 128, B = min(255, precip / 16), A = surface class × 64 + 63.
   */
  toTexture(): HTMLCanvasElement {
    const { width, height, biome, annualTemp, annualPrecip, surface } = this.data;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const img = ctx.createImageData(width, height);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      img.data[p] = biome[i];
      img.data[p + 1] = Math.max(0, Math.min(255, annualTemp[i] + 128));
      img.data[p + 2] = Math.min(255, Math.round(annualPrecip[i] / 16));
      img.data[p + 3] = surface[i] * 64 + 63;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}
