/** Public entry point for the geocoding data module (offline parts only; networked adapters live elsewhere). */
export type { GeocodeKind, GeocodeResult, GeocodeSource, GeocodingAdapter, NearestPlace } from './types';
export { parseCoordinates, formatCoordinates } from './parseCoordinates';
export type { ParsedCoordinates, FormatCoordinatesOptions } from './parseCoordinates';
export { OfflineGazetteer } from './offlineIndex';
export type { FetchJson, GazetteerSourceData, GazetteerStats } from './offlineIndex';
export { normalizeSearchText, tokenizeSearchText, slugify, titleCaseIfUpper, boundedEditDistance } from './textMatch';
export {
  EARTH_RADIUS_KM,
  haversineKm,
  wrapLongitude,
  isAreaGeometry,
  outerRings,
  ringsBBox,
  geometryBBox,
  largestRingBBox,
  bboxCentre,
  bboxDiagonalKm,
  bboxUnion,
  bboxContains,
  bboxWeightedArea,
  pointInRing,
  pointInPolygon,
  pointInGeometry,
} from './geometry';
export type { AreaGeometry, BBox, MultiPolygonGeometry, PolygonGeometry, Position, Ring, PolygonCoords, MultiPolygonCoords } from './geometry';
