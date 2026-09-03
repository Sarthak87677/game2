/** Minimal GeoJSON geometry types and pure spatial helpers (Cesium-free). */
export type Position = [number, number];
export interface PolygonGeometry { type: 'Polygon'; coordinates: Position[][] }
export interface MultiPolygonGeometry { type: 'MultiPolygon'; coordinates: Position[][][] }
export interface LineStringGeometry { type: 'LineString'; coordinates: Position[] }
export interface MultiLineStringGeometry { type: 'MultiLineString'; coordinates: Position[][] }
export interface PointGeometry { type: 'Point'; coordinates: Position }
export type Geometry = PolygonGeometry | MultiPolygonGeometry | LineStringGeometry | MultiLineStringGeometry | PointGeometry;
export interface Feature<P = Record<string, unknown>> { type: 'Feature'; properties: P; geometry: Geometry }
export interface FeatureCollection<P = Record<string, unknown>> { type: 'FeatureCollection'; features: Feature<P>[] }

export interface BBox { west: number; south: number; east: number; north: number }

export function bboxOfRings(rings: Position[][]): BBox {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < west) west = x; if (x > east) east = x; if (y < south) south = y; if (y > north) north = y;
  }
  return { west, south, east, north };
}

export function bboxContains(b: BBox, lon: number, lat: number): boolean {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

/** Ray-casting point-in-ring test. */
export function pointInRing(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Point in polygon with holes (first ring outer, rest holes). */
export function pointInPolygon(rings: Position[][], lon: number, lat: number): boolean {
  if (rings.length === 0 || !pointInRing(rings[0], lon, lat)) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(rings[i], lon, lat)) return false;
  return true;
}

/** Iterate polygon ring-sets of a (Multi)Polygon geometry. */
export function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

export function linesOf(g: Geometry): Position[][] {
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}
