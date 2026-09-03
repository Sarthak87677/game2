/**
 * Small spherical-geometry helpers for GeoJSON-like data: haversine distance,
 * antimeridian-aware bounding boxes and ray-casting point-in-polygon tests.
 * Pure functions, no dependencies.
 */

/** A GeoJSON position: `[lon, lat, ...]`. */
export type Position = number[];
/** A closed ring of positions. */
export type Ring = Position[];
/** Polygon coordinates: outer ring followed by holes. */
export type PolygonCoords = Ring[];
/** MultiPolygon coordinates. */
export type MultiPolygonCoords = PolygonCoords[];

/** GeoJSON Polygon geometry. */
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: PolygonCoords;
}
/** GeoJSON MultiPolygon geometry. */
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: MultiPolygonCoords;
}
/** A polygonal geometry. */
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** Geographic bounding box in degrees. `maxLon` may exceed 180 when the box crosses the antimeridian. */
export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Mean Earth radius in kilometres (approximate, spherical model). */
export const EARTH_RADIUS_KM = 6371.0088;

const DEG = Math.PI / 180;

/** Great-circle distance in kilometres between two WGS84 points (spherical approximation). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const a = s1 * s1 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Wraps a longitude into [−180, 180]. */
export function wrapLongitude(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function isPosition(p: unknown): p is Position {
  return Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number';
}

function isRing(r: unknown): r is Ring {
  return Array.isArray(r) && r.length >= 3 && r.every(isPosition);
}

function isPolygonCoords(c: unknown): c is PolygonCoords {
  return Array.isArray(c) && c.length >= 1 && c.every(isRing);
}

/** Type guard for a Polygon / MultiPolygon geometry with numeric coordinates. */
export function isAreaGeometry(value: unknown): value is AreaGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type === 'Polygon') return isPolygonCoords(g.coordinates);
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) && g.coordinates.every(isPolygonCoords);
  return false;
}

/** Outer rings of a geometry (holes are skipped). */
export function outerRings(geometry: AreaGeometry): Ring[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  return geometry.coordinates.map((poly) => poly[0]);
}

/**
 * Bounding box of a set of rings. If the raw longitude span exceeds 180° the
 * box is assumed to cross the antimeridian and is recomputed with negative
 * longitudes shifted by +360 (so `maxLon` may exceed 180).
 */
export function ringsBBox(rings: readonly Ring[]): BBox | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[0] < minLon) minLon = p[0];
      if (p[0] > maxLon) maxLon = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    }
  }
  if (!Number.isFinite(minLon)) return null;
  if (maxLon - minLon > 180) {
    let sMin = Infinity;
    let sMax = -Infinity;
    for (const ring of rings) {
      for (const p of ring) {
        const lon = p[0] < 0 ? p[0] + 360 : p[0];
        if (lon < sMin) sMin = lon;
        if (lon > sMax) sMax = lon;
      }
    }
    if (sMax - sMin < maxLon - minLon) {
      minLon = sMin;
      maxLon = sMax;
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

/** Bounding box of all outer rings of a geometry. */
export function geometryBBox(geometry: AreaGeometry): BBox | null {
  return ringsBBox(outerRings(geometry));
}

/** Weighted (cos-latitude) area of a bounding box in square degrees; used to rank rings. */
export function bboxWeightedArea(b: BBox): number {
  const midLat = (b.minLat + b.maxLat) / 2;
  return (b.maxLon - b.minLon) * (b.maxLat - b.minLat) * Math.max(0.05, Math.cos(midLat * DEG));
}

/** Bounding box of the largest outer ring (by weighted bbox area) of a geometry. */
export function largestRingBBox(geometry: AreaGeometry): BBox | null {
  let best: BBox | null = null;
  let bestArea = -1;
  for (const ring of outerRings(geometry)) {
    const b = ringsBBox([ring]);
    if (!b) continue;
    const area = bboxWeightedArea(b);
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return best;
}

/** Centre of a bounding box, with the longitude wrapped into [−180, 180]. */
export function bboxCentre(b: BBox): { lat: number; lon: number } {
  return { lat: (b.minLat + b.maxLat) / 2, lon: wrapLongitude((b.minLon + b.maxLon) / 2) };
}

/** Approximate diagonal of a bounding box in kilometres. */
export function bboxDiagonalKm(b: BBox): number {
  const lonSpan = Math.min(180, b.maxLon - b.minLon);
  return haversineKm(b.minLat, 0, b.maxLat, lonSpan);
}

/** Union of two bounding boxes (no antimeridian handling beyond the inputs). */
export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    minLon: Math.min(a.minLon, b.minLon),
    minLat: Math.min(a.minLat, b.minLat),
    maxLon: Math.max(a.maxLon, b.maxLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

/** True when the point lies inside the bounding box (handles boxes extending past 180°). */
export function bboxContains(b: BBox, lon: number, lat: number): boolean {
  if (lat < b.minLat || lat > b.maxLat) return false;
  if (lon >= b.minLon && lon <= b.maxLon) return true;
  const shifted = lon + 360;
  return shifted >= b.minLon && shifted <= b.maxLon;
}

/**
 * Even-odd ray casting test of a point against a ring. Coordinates are used
 * as-is (naive antimeridian handling, matching how Natural Earth splits its
 * polygons at ±180°).
 */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon honouring holes. */
export function pointInPolygon(lon: number, lat: number, polygon: PolygonCoords): boolean {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (pointInRing(lon, lat, polygon[k])) return false;
  }
  return true;
}

/** Point-in-geometry for Polygon and MultiPolygon. */
export function pointInGeometry(lon: number, lat: number, geometry: AreaGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(lon, lat, geometry.coordinates);
  for (const poly of geometry.coordinates) {
    if (pointInPolygon(lon, lat, poly)) return true;
  }
  return false;
}
