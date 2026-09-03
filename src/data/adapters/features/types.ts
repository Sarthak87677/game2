/** Feature types produced by the OpenStreetMap adapter (or any future vector-feature adapter). */
export type LonLat = [number, number];

export type RoadKind = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'service' | 'track' | 'path' | 'pedestrian' | 'rail' | 'other';
export type WaterKind = 'river' | 'stream' | 'canal' | 'lake' | 'reservoir' | 'other';
export type LandUseKind = 'park' | 'forest' | 'farmland' | 'residential' | 'industrial' | 'commercial' | 'grass' | 'wetland' | 'orchard' | 'vineyard' | 'scrub' | 'beach' | 'other';
export type HeightSource = 'tag' | 'levels' | 'inferred';

export interface OsmBuilding {
  id: string;
  outer: LonLat[];
  holes: LonLat[][];
  heightM: number;
  levels: number | null;
  heightSource: HeightSource;
  type: string;
  name: string | null;
  centroid: LonLat;
}

export interface OsmRoad { id: string; kind: RoadKind; coords: LonLat[]; name: string | null; widthM: number; bridge: boolean; tunnel: boolean; lanes: number | null; oneway: boolean }
export interface OsmWater { id: string; kind: WaterKind; polygon: LonLat[] | null; line: LonLat[] | null; name: string | null; widthM: number }
export interface OsmLandUse { id: string; kind: LandUseKind; polygon: LonLat[]; name: string | null }
export interface OsmPoi { id: string; name: string; kind: string; lat: number; lon: number; population: number | null }

export interface FeatureTile {
  key: string;
  z: number;
  x: number;
  y: number;
  bbox: { west: number; south: number; east: number; north: number };
  buildings: OsmBuilding[];
  roads: OsmRoad[];
  water: OsmWater[];
  landuse: OsmLandUse[];
  pois: OsmPoi[];
  fetchedAt: number;
  source: 'network' | 'cache';
  truncated: boolean;
}

export interface FeatureAdapter {
  readonly id: string;
  readonly zoom: number;
  isAvailable(): { available: boolean; reason?: string };
  fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<FeatureTile>;
}
