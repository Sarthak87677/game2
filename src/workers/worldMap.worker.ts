/// <reference lib="webworker" />
/**
 * Builds the WorldMap raster off the main thread: rasterises Natural Earth land/lake/glacier polygons, fetches coarse
 * Terrarium elevation (zoom 2 → 16 tiles), evaluates the climate model on a coarse grid, and classifies Köppen + biome
 * per cell with a local lapse-rate correction. Posts a transferable WorldMapData back.
 */
import { estimateClimate } from '@/world/climate/model';
import { classifyKoppen } from '@/world/climate/koppen';
import { classifyBiome } from '@/world/climate/biome';
import { BIOME_LIST } from '@/world/biomes';
import { CLIMATE_GRID_HEIGHT, CLIMATE_GRID_WIDTH, KOPPEN_LIST, SURFACE_GLACIER, SURFACE_LAKE, SURFACE_LAND, SURFACE_OCEAN, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH, type WorldMapData } from '@/world/worldMap';
import { mercatorY } from '@/util/geo';
import { pointInPolygon } from '@/data/naturalEarth/geometry';

type Rings = [number, number][][];
export interface WorldMapBuildRequest {
  land: Rings[]; lakes: Rings[]; glaciers: Rings[];
  terrariumUrl: string | null;
  width?: number; height?: number;
}
export interface WorldMapBuildResponse { data?: WorldMapData; error?: string; progress?: string }

function post(msg: WorldMapBuildResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function rasteriseSurface(req: WorldMapBuildRequest, width: number, height: number): Uint8Array {
  const surface = new Uint8Array(width * height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      // lon/lat → pixel transform
      ctx.setTransform(width / 360, 0, 0, -height / 180, width / 2, height / 2);
      const fill = (polys: Rings[], color: string) => {
        ctx.fillStyle = color;
        const path = new Path2D();
        for (const rings of polys) for (const ring of rings) {
          path.moveTo(ring[0][0], ring[0][1]);
          for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
          path.closePath();
        }
        ctx.fill(path, 'evenodd');
      };
      ctx.fillStyle = '#000000';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(width / 360, 0, 0, -height / 180, width / 2, height / 2);
      fill(req.land, '#010101');
      fill(req.lakes, '#020202');
      fill(req.glaciers, '#030303');
      const px = ctx.getImageData(0, 0, width, height).data;
      for (let i = 0; i < surface.length; i++) surface[i] = Math.min(3, px[i * 4]);
      return surface;
    }
  }
  // Fallback: point-in-polygon at cell centres (slower, used when OffscreenCanvas is unavailable).
  const test = (polys: Rings[], lon: number, lat: number) => polys.some((rings) => pointInPolygon(rings, lon, lat));
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * 360 - 180;
      const i = y * width + x;
      if (test(req.glaciers, lon, lat)) surface[i] = SURFACE_GLACIER;
      else if (test(req.lakes, lon, lat)) surface[i] = SURFACE_LAKE;
      else if (test(req.land, lon, lat)) surface[i] = SURFACE_LAND;
      else surface[i] = SURFACE_OCEAN;
    }
  }
  return surface;
}

/** Two-pass chamfer distance transform (in cells) from non-land cells; converted to km by the caller. */
function distanceToCoast(surface: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = surface[i] === SURFACE_OCEAN ? 0 : INF;
  const at = (x: number, y: number) => d[y * width + ((x + width) % width)];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (d[i] === 0) continue;
    let best = d[i];
    if (y > 0) { best = Math.min(best, at(x, y - 1) + 1, at(x - 1, y - 1) + Math.SQRT2, at(x + 1, y - 1) + Math.SQRT2); }
    best = Math.min(best, at(x - 1, y) + 1);
    d[i] = best;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (d[i] === 0) continue;
    let best = d[i];
    if (y < height - 1) { best = Math.min(best, at(x, y + 1) + 1, at(x - 1, y + 1) + Math.SQRT2, at(x + 1, y + 1) + Math.SQRT2); }
    best = Math.min(best, at(x + 1, y) + 1);
    d[i] = best;
  }
  return d;
}

async function fetchCoarseElevation(urlTemplate: string, width: number, height: number): Promise<Int16Array | null> {
  const z = 2;
  const n = 1 << z;
  const size = 256 * n;
  const merc = new Float32Array(size * size);
  let ok = 0;
  const jobs: Promise<void>[] = [];
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    jobs.push((async () => {
      try {
        const url = urlTemplate.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty));
        const res = await fetch(url);
        if (!res.ok) return;
        const bitmap = await createImageBitmap(await res.blob());
        const c = new OffscreenCanvas(256, 256);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        const px = ctx.getImageData(0, 0, 256, 256).data;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          const p = (y * 256 + x) * 4;
          merc[(ty * 256 + y) * size + tx * 256 + x] = px[p] * 256 + px[p + 1] + px[p + 2] / 256 - 32768;
        }
        ok++;
      } catch { /* tile missing or offline */ }
    })());
  }
  await Promise.all(jobs);
  if (ok === 0) return null;
  const out = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    const my = Math.min(size - 1, Math.max(0, Math.floor(mercatorY(lat) * size)));
    for (let x = 0; x < width; x++) {
      const mx = Math.min(size - 1, Math.floor(((x + 0.5) / width) * size));
      out[y * width + x] = Math.max(-32768, Math.min(32767, Math.round(merc[my * size + mx])));
    }
  }
  return out;
}

self.onmessage = async (ev: MessageEvent<WorldMapBuildRequest>) => {
  const t0 = performance.now();
  try {
    const req = ev.data;
    const width = req.width ?? WORLD_MAP_WIDTH;
    const height = req.height ?? WORLD_MAP_HEIGHT;
    post({ progress: 'rasterising surface' });
    const surface = rasteriseSurface(req, width, height);
    post({ progress: 'fetching coarse elevation' });
    const elevationPromise = req.terrariumUrl ? fetchCoarseElevation(req.terrariumUrl, width, height) : Promise.resolve(null);
    const dist = distanceToCoast(surface, width, height);
    const kmPerCell = 40075 / width;
    const distCoast = new Uint16Array(width * height);
    for (let i = 0; i < dist.length; i++) distCoast[i] = Math.min(65535, Math.round(dist[i] * kmPerCell));
    post({ progress: 'evaluating climate model' });
    const monthlyTemp = new Float32Array(CLIMATE_GRID_WIDTH * CLIMATE_GRID_HEIGHT * 12);
    const monthlyPrecip = new Float32Array(CLIMATE_GRID_WIDTH * CLIMATE_GRID_HEIGHT * 12);
    for (let cy = 0; cy < CLIMATE_GRID_HEIGHT; cy++) {
      const lat = 90 - ((cy + 0.5) / CLIMATE_GRID_HEIGHT) * 180;
      for (let cx = 0; cx < CLIMATE_GRID_WIDTH; cx++) {
        const lon = ((cx + 0.5) / CLIMATE_GRID_WIDTH) * 360 - 180;
        const fx = Math.floor(((cx + 0.5) / CLIMATE_GRID_WIDTH) * width);
        const fy = Math.floor(((cy + 0.5) / CLIMATE_GRID_HEIGHT) * height);
        const est = estimateClimate({ lat, lon, elevationM: 0, distanceToCoastKm: distCoast[fy * width + fx] });
        const base = (cy * CLIMATE_GRID_WIDTH + cx) * 12;
        for (let m = 0; m < 12; m++) { monthlyTemp[base + m] = est.tempC[m]; monthlyPrecip[base + m] = est.precipMm[m]; }
      }
    }
    const elevationFetched = await elevationPromise;
    const elevation = elevationFetched ?? new Int16Array(width * height);
    post({ progress: 'classifying biomes' });
    const biome = new Uint8Array(width * height);
    const koppen = new Uint8Array(width * height);
    const annualTemp = new Int8Array(width * height);
    const annualPrecip = new Uint16Array(width * height);
    const biomeIndex = new Map<string, number>(BIOME_LIST.map((b: string, i: number) => [b, i]));
    const koppenIndex = new Map<string, number>(KOPPEN_LIST.map((k, i) => [k, i]));
    const temps: number[] = new Array(12).fill(0);
    const precs: number[] = new Array(12).fill(0);
    for (let y = 0; y < height; y++) {
      const lat = 90 - ((y + 0.5) / height) * 180;
      const cy = Math.min(CLIMATE_GRID_HEIGHT - 1, Math.floor((y / height) * CLIMATE_GRID_HEIGHT));
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cx = Math.min(CLIMATE_GRID_WIDTH - 1, Math.floor((x / width) * CLIMATE_GRID_WIDTH));
        const base = (cy * CLIMATE_GRID_WIDTH + cx) * 12;
        const elev = surface[i] === SURFACE_OCEAN ? 0 : Math.max(0, elevation[i]);
        const lapse = elev * 0.0065;
        let tSum = 0, pSum = 0;
        for (let m = 0; m < 12; m++) { temps[m] = monthlyTemp[base + m] - lapse; precs[m] = monthlyPrecip[base + m]; tSum += temps[m]; pSum += precs[m]; }
        const k = classifyKoppen(temps, precs, lat);
        const b = classifyBiome({ koppen: k, elevationM: elev, annualPrecipMm: pSum, annualMeanTempC: tSum / 12, lat, isWater: surface[i] === SURFACE_OCEAN || surface[i] === SURFACE_LAKE, isGlaciated: surface[i] === SURFACE_GLACIER, landCoverHint: surface[i] === SURFACE_LAKE ? 'lake' : undefined });
        biome[i] = biomeIndex.get(b) ?? 0;
        koppen[i] = koppenIndex.get(k) ?? 0;
        annualTemp[i] = Math.max(-128, Math.min(127, Math.round(tSum / 12)));
        annualPrecip[i] = Math.max(0, Math.min(65535, Math.round(pSum)));
      }
    }
    // Coastal fill: ocean cells touching land inherit the neighbouring land biome/climate so that coastal cities,
    // beaches and islands smaller than a cell (39 km) are not painted as open sea at ground level. The surface class
    // stays 'ocean' so the base map and HUD still know where the vector coastline says water is.
    post({ progress: 'filling coastal cells' });
    const filledBiome = new Uint8Array(biome);
    const filledKoppen = new Uint8Array(koppen);
    const filledTemp = new Int8Array(annualTemp);
    const filledPrecip = new Uint16Array(annualPrecip);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (surface[i] !== SURFACE_OCEAN) continue;
      let src = -1;
      for (let dy = -1; dy <= 1 && src < 0; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const j = yy * width + ((x + dx + width) % width);
          if (surface[j] !== SURFACE_OCEAN && surface[j] !== SURFACE_LAKE) { src = j; break; }
        }
      }
      if (src >= 0) { filledBiome[i] = biome[src]; filledKoppen[i] = koppen[src]; filledTemp[i] = annualTemp[src]; filledPrecip[i] = annualPrecip[src]; }
    }
    const data: WorldMapData = { width, height, surface, elevation, biome: filledBiome, koppen: filledKoppen, annualTemp: filledTemp, annualPrecip: filledPrecip, distCoast, monthlyTemp, monthlyPrecip, hasElevation: elevationFetched !== null, buildMs: performance.now() - t0 };
    post({ data }, [surface.buffer, elevation.buffer, filledBiome.buffer, filledKoppen.buffer, filledTemp.buffer, filledPrecip.buffer, distCoast.buffer, monthlyTemp.buffer, monthlyPrecip.buffer]);
  } catch (e) {
    post({ error: e instanceof Error ? e.message : String(e) });
  }
};
