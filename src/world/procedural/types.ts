/**
 * Contract between the procedural GENERATOR (worker, pure TS) and the near-field RENDERER (Cesium).
 * Everything is expressed in a tile-local east-north-up frame in metres so the renderer can anchor each tile with a
 * single model matrix (floating-origin: no world-scale floats in vertex data).
 */
import type { Biome } from '@/world/climate/biome';
import type { FeatureTile } from '@/data/adapters/features/types';

/** Slippy-map zoom used for near-field generation tiles (~610 m at the equator). */
export const NEAR_FIELD_ZOOM = 16;

export type SpeciesKind = 'tree' | 'shrub' | 'grass' | 'flower' | 'crop' | 'rock' | 'cactus' | 'palm' | 'reed';
export type LeafType = 'broadleaf' | 'needle' | 'palm' | 'none' | 'succulent';
export type LeafHabit = 'evergreen' | 'deciduous' | 'seasonal-dry';

export interface FruitRule {
  /** Display name, e.g. "apple". */
  name: string;
  colour: string;
  /** Diameter in metres. */
  sizeM: number;
  /** Hemisphere-relative months (1-12, northern-hemisphere calendar) during which fruit is visible; mirrored for the south. */
  months: number[];
}

export interface FlowerRule { colour: string; months: number[] }

export interface Species {
  id: string;
  name: string;
  kind: SpeciesKind;
  leafType: LeafType;
  habit: LeafHabit;
  /** Biomes where the species naturally occurs, with relative weight. */
  biomes: Partial<Record<Biome, number>>;
  /** Typical mature height range in metres. */
  heightM: [number, number];
  /** Crown/spread as a fraction of height. */
  spread: number;
  trunkColour: string;
  leafColour: string;
  autumnColour?: string;
  flowers?: FlowerRule;
  fruit?: FruitRule;
  /** Elevation limits (m). */
  elevationM?: [number, number];
  /** Preferred slope (0 flat .. 1 steep) upper bound. */
  maxSlope?: number;
  /** Prefers being near water (0..1 weight). */
  waterAffinity?: number;
  /** Cultivated crop: planted in rows on farmland. */
  cultivated?: boolean;
}

export interface Placement {
  /** Species id from the library. */
  species: string;
  /** Local ENU metres from the tile anchor (x east, y north). z is the terrain height sampled by the generator. */
  x: number;
  y: number;
  z: number;
  /** Uniform scale factor relative to the species' nominal size. */
  scale: number;
  /** Rotation about the up axis, radians. */
  rotation: number;
  /** Per-instance variation seed (0..1). */
  variant: number;
  /** Phenology at generation time: 0..1 leaf-on, flowering, fruiting. */
  leafOn: number;
  flowering: number;
  fruiting: number;
}

export interface BuildingSpec {
  id: string;
  /** Footprint polygon in local metres (closed ring not required). */
  footprint: [number, number][];
  heightM: number;
  baseZ: number;
  style: 'rural' | 'suburban' | 'urban' | 'tower' | 'industrial' | 'religious';
  /** Provenance: OSM footprint vs procedural settlement. */
  source: 'osm' | 'procedural';
  roof: 'flat' | 'gable' | 'hip';
  colour: string;
}

export interface FieldSpec {
  id: string;
  polygon: [number, number][];
  crop: string;
  /** Row orientation, radians. */
  rowAngle: number;
  colour: string;
}

export interface NearFieldTile {
  key: string;
  z: number;
  x: number;
  y: number;
  /** Anchor (tile centre) in degrees; the renderer computes the ENU model matrix from it. */
  anchorLat: number;
  anchorLon: number;
  anchorHeightM: number;
  biome: Biome;
  /** Dominant classes for LOD/impostor colouring. */
  canopyColour: string;
  groundColour: string;
  placements: Placement[];
  buildings: BuildingSpec[];
  fields: FieldSpec[];
  /** Deterministic seed used (for diagnostics). */
  seed: number;
  generatedMs: number;
  /** Counts for diagnostics/perf panels. */
  counts: Record<SpeciesKind, number>;
}

/** Height field for a tile: row-major, north→south, west→east, in metres above the ellipsoid. */
export interface HeightField { width: number; height: number; heights: Float32Array; west: number; south: number; east: number; north: number }

export interface GenerationContext {
  z: number;
  x: number;
  y: number;
  /** ISO date used for phenology. */
  dateIso: string;
  biome: Biome;
  koppen: string;
  monthlyTempC: number[];
  monthlyPrecipMm: number[];
  distCoastKm: number;
  /** Surface class from the WorldMap raster: ocean/land/lake/glacier. */
  surface: 'ocean' | 'land' | 'lake' | 'glacier';
  heightField: HeightField | null;
  /** Nearby OSM features (roads, landuse, buildings, water) when available — generation avoids roads/buildings and follows land use. */
  osm: FeatureTile | null;
  /** Estimated urban density 0..1 from populated places (procedural settlements appear when OSM buildings are absent). */
  urbanDensity: number;
  /** Nearest settlement name for naming procedural villages. */
  settlementName: string | null;
  /** Quality multiplier 0..1 for instance counts. */
  density: number;
}
