/**
 * Bookmark data model shared by the curated world highlights, the showcase
 * presets and the offline gazetteer.
 *
 * Everything under `src/data` is pure TypeScript with no Cesium dependency so
 * it can be unit-tested in Node / happy-dom.
 */

/** Thematic category of a bookmark; drives default camera framing and icons. */
export type BookmarkCategory =
  | 'city'
  | 'landmark'
  | 'nature'
  | 'mountain'
  | 'river'
  | 'desert'
  | 'polar'
  | 'island'
  | 'ocean'
  | 'park'
  | 'rural';

/** Continent of a bookmark; `'Ocean'` is used for open ocean and remote oceanic islands. */
export type BookmarkContinent =
  | 'Africa'
  | 'Antarctica'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Oceania'
  | 'Ocean';

/** Camera pose used when flying to a bookmark. */
export interface BookmarkCamera {
  /** Camera height above the WGS84 ellipsoid in metres. */
  heightM: number;
  /** Compass heading in degrees, 0 = north, increasing clockwise, in [0, 360). */
  headingDeg: number;
  /** Pitch in degrees; negative looks down (−90 = straight down). Always negative for bookmarks. */
  pitchDeg: number;
}

/** A curated, named place on the globe with a suggested camera pose. */
export interface Bookmark {
  /** Unique kebab-case identifier, e.g. `eiffel-tower`. */
  id: string;
  /** Human readable name. */
  name: string;
  category: BookmarkCategory;
  continent: BookmarkContinent;
  /** Country name (omitted for Antarctica, open ocean and disputed/unclaimed places). */
  country?: string;
  /** Latitude in decimal degrees, WGS84. Approximate: see the data note in each file. */
  lat: number;
  /** Longitude in decimal degrees, WGS84. Approximate: see the data note in each file. */
  lon: number;
  camera: BookmarkCamera;
  /** One-sentence description shown in the UI. */
  description: string;
  /**
   * One sentence saying what is measured vs inferred vs procedural at this place,
   * e.g. "Terrain and coastlines are measured; buildings come from OpenStreetMap
   * when online, otherwise procedural."
   */
  dataNote: string;
  /** Optional lowercase search aliases / keywords (e.g. `['paris', 'tower']`). */
  tags?: string[];
}

/** A camera waypoint of a showcase tour. */
export interface TourWaypoint {
  lat: number;
  lon: number;
  heightM: number;
  headingDeg: number;
  /** Negative looks down. */
  pitchDeg: number;
  /** Seconds spent flying to / dwelling at this waypoint. */
  durationS: number;
}

/**
 * A showcase preset: a bookmark used for demos, QA and e2e checks, with the
 * biome the classifier is expected to produce there, a walking-mode start
 * point and an optional guided camera tour.
 */
export interface ShowcaseArea extends Bookmark {
  /**
   * Free-text biome id (lowercase kebab-case) the biome classifier is expected
   * to report at `groundSpot`, e.g. `tropical-rainforest` or `urban-temperate`.
   */
  expectedBiome: string;
  /** A good walking-mode start point (on land, reasonably flat, representative). */
  groundSpot: { lat: number; lon: number };
  /** Optional guided camera tour through the area. */
  tourPath?: TourWaypoint[];
}
