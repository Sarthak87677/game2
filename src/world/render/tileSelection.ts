/**
 * Pure helpers behind NearFieldWorld's streaming: which NEAR_FIELD_ZOOM tiles surround the camera at which LOD,
 * which loaded tiles to evict, retry backoff, and building-top lookups for walking collisions. Cesium-free and
 * unit-tested in isolation.
 */
import type { BuildingSpec } from '@/world/procedural/types';
import { NEAR_FIELD_ZOOM } from '@/world/procedural/types';
import { enuOffsetM, haversineM, lonLatToTile, tileBounds } from '@/util/geo';
import { pointInRing } from './geometry/shapes';

export type NearFieldLod = 'full' | 'impostor';

export interface TileCandidate {
  key: string;
  z: number;
  x: number;
  y: number;
  /** Distance from the camera ground point to the tile centre (m). */
  distM: number;
  lod: NearFieldLod;
  lat: number;
  lon: number;
}

/** Canonical tile key `z/x/y`. */
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/**
 * Tiles whose centre lies within `impostorRadiusM` of the camera ground point, sorted nearest first. Tiles within
 * `fullRadiusM` get full LOD; the camera's own tile (and any tile within three quarters of a tile width) is always
 * full so a small radius on low quality still shows detail underfoot. Longitude wraps across the antimeridian.
 */
export function selectNearFieldTiles(lat: number, lon: number, fullRadiusM: number, impostorRadiusM: number, zoom = NEAR_FIELD_ZOOM): TileCandidate[] {
  const n = 2 ** zoom;
  const centre = lonLatToTile(lon, lat, zoom);
  const cb = tileBounds(centre.x, centre.y, zoom);
  const tileM = Math.max(1, haversineM((cb.north + cb.south) / 2, cb.west, (cb.north + cb.south) / 2, cb.east));
  const tileNorthM = Math.max(1, haversineM(cb.south, cb.west, cb.north, cb.west));
  const fullR = Math.max(fullRadiusM, tileM * 0.75);
  const outerR = Math.max(impostorRadiusM, fullR);
  const spanX = Math.ceil(outerR / tileM) + 1;
  const spanY = Math.ceil(outerR / tileNorthM) + 1;
  const out: TileCandidate[] = [];
  for (let dy = -spanY; dy <= spanY; dy++) {
    const y = centre.y + dy;
    if (y < 0 || y >= n) continue;
    for (let dx = -spanX; dx <= spanX; dx++) {
      const x = ((centre.x + dx) % n + n) % n;
      const b = tileBounds(x, y, zoom);
      const clat = (b.north + b.south) / 2, clon = (b.east + b.west) / 2;
      const d = haversineM(lat, lon, clat, clon);
      if (d > outerR) continue;
      out.push({ key: tileKey(zoom, x, y), z: zoom, x, y, distM: d, lod: d <= fullR ? 'full' : 'impostor', lat: clat, lon: clon });
    }
  }
  out.sort((a, b) => a.distM - b.distM || a.key.localeCompare(b.key));
  return out;
}

export interface LoadedTileInfo {
  key: string;
  distM: number;
  /** Timestamp of the last tick that wanted the tile (ms). */
  lastUsed: number;
}

/**
 * Keys to unload: everything beyond `keepRadiusM`, then — if more than `maxTiles` remain — the farthest (ties broken
 * by least recently used) until the cap holds. Result is in eviction order.
 */
export function unloadOrder(loaded: readonly LoadedTileInfo[], keepRadiusM: number, maxTiles: number): string[] {
  const far: LoadedTileInfo[] = [];
  const keep: LoadedTileInfo[] = [];
  for (const t of loaded) (t.distM > keepRadiusM ? far : keep).push(t);
  far.sort((a, b) => b.distM - a.distM || a.lastUsed - b.lastUsed);
  const keys = far.map((t) => t.key);
  if (keep.length > maxTiles) {
    keep.sort((a, b) => b.distM - a.distM || a.lastUsed - b.lastUsed);
    for (let i = 0; i < keep.length - maxTiles; i++) keys.push(keep[i].key);
  }
  return keys;
}

/** Exponential backoff for tiles whose generator returned null/failed: 1.5 s, 3 s, 6 s ... capped at 30 s. */
export function retryDelayMs(failures: number): number {
  return Math.min(30_000, 1500 * 2 ** Math.max(0, failures - 1));
}

/** Tile-local metres (x east, y north) of a lat/lon relative to a tile anchor. */
export function tileLocalPoint(anchorLat: number, anchorLon: number, lat: number, lon: number): { x: number; y: number } {
  const o = enuOffsetM(anchorLat, anchorLon, lat, lon);
  return { x: o.east, y: o.north };
}

/** Highest building top (absolute metres) whose footprint contains the local point, or null. */
export function buildingHeightAt(buildings: readonly BuildingSpec[], x: number, y: number): number | null {
  let best: number | null = null;
  for (const b of buildings) {
    if (b.footprint.length < 3 || !pointInRing(b.footprint, x, y)) continue;
    const top = b.baseZ + b.heightM;
    if (best === null || top > best) best = top;
  }
  return best;
}
