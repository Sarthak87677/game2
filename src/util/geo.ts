/** Geodesy helpers shared by adapters, generation and UI (pure, Cesium-free). */

export const EARTH_RADIUS_M = 6371008.8;
export const DEG = Math.PI / 180;
export const MAX_MERCATOR_LAT = 85.05112878;

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Clamp longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === 180) l = -180;
  return l;
}

export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/** Web-Mercator normalised y in [0,1] (0 = north). */
export function mercatorY(lat: number): number {
  const phi = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * DEG;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
}

export function mercatorX(lon: number): number {
  return (wrapLon(lon) + 180) / 360;
}

/** Inverse of mercatorY. */
export function latFromMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) / DEG;
}

/** Slippy-map tile coordinates for a lat/lon at a zoom level. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  return { x: Math.floor(mercatorX(lon) * n), y: Math.floor(mercatorY(lat) * n) };
}

/** Geographic bounds of a slippy-map tile. */
export function tileBounds(x: number, y: number, z: number): { west: number; south: number; east: number; north: number } {
  const n = 2 ** z;
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: latFromMercatorY(y / n), south: latFromMercatorY((y + 1) / n) };
}

/** Metres per degree of longitude at a latitude (approximate). */
export function metresPerDegreeLon(lat: number): number {
  return 111320 * Math.cos(lat * DEG);
}

export const METRES_PER_DEGREE_LAT = 111132;

/** Local ENU offset in metres from origin to point (flat-earth approximation valid over a few km). */
export function enuOffsetM(originLat: number, originLon: number, lat: number, lon: number): { east: number; north: number } {
  return { east: (wrapLon(lon - originLon)) * metresPerDegreeLon(originLat), north: (lat - originLat) * METRES_PER_DEGREE_LAT };
}

/** Inverse of enuOffsetM. */
export function offsetToLonLat(originLat: number, originLon: number, east: number, north: number): { lat: number; lon: number } {
  return { lat: originLat + north / METRES_PER_DEGREE_LAT, lon: wrapLon(originLon + east / metresPerDegreeLon(originLat)) };
}
