/**
 * Default camera poses and data notes per bookmark category, plus a small
 * helper that expands compact "seed" records into full {@link Bookmark}s.
 */
import type { Bookmark, BookmarkCamera, BookmarkCategory, BookmarkContinent } from './types';

/**
 * Default camera pose per category. Heights follow the project guideline:
 * cities ~1.5–4 km, landmarks ~0.4–0.9 km, mountains 6–15 km, ecosystems
 * 5–20 km, polar 20–80 km. Pitch is always negative (looking down).
 */
export const DEFAULT_CAMERA_BY_CATEGORY: Readonly<Record<BookmarkCategory, BookmarkCamera>> = {
  city: { heightM: 2500, headingDeg: 0, pitchDeg: -35 },
  landmark: { heightM: 600, headingDeg: 0, pitchDeg: -30 },
  nature: { heightM: 8000, headingDeg: 0, pitchDeg: -35 },
  mountain: { heightM: 9000, headingDeg: 0, pitchDeg: -25 },
  river: { heightM: 5000, headingDeg: 0, pitchDeg: -35 },
  desert: { heightM: 8000, headingDeg: 0, pitchDeg: -35 },
  polar: { heightM: 40000, headingDeg: 0, pitchDeg: -45 },
  island: { heightM: 6000, headingDeg: 0, pitchDeg: -35 },
  ocean: { heightM: 30000, headingDeg: 0, pitchDeg: -45 },
  park: { heightM: 8000, headingDeg: 0, pitchDeg: -35 },
  rural: { heightM: 2500, headingDeg: 0, pitchDeg: -35 },
};

/**
 * Default one-sentence data provenance note per category. Every note says
 * what is measured (terrain, coastlines, water), what is inferred (climate,
 * vegetation, snow) and what is procedural (buildings offline, detail).
 */
export const DEFAULT_DATA_NOTE_BY_CATEGORY: Readonly<Record<BookmarkCategory, string>> = {
  city:
    'Terrain and coastlines are measured; buildings come from OpenStreetMap when online, otherwise procedural; climate and vegetation are inferred.',
  landmark:
    'Terrain is measured; the landmark footprint comes from OpenStreetMap when online, otherwise a procedural stand-in; surroundings are inferred.',
  nature:
    'Terrain, rivers and water bodies are measured; vegetation density and species mix are inferred from climate and rendered procedurally.',
  mountain:
    'Elevation is measured from global terrain; snow line, rock texture and vegetation are inferred from latitude, altitude and climate.',
  river:
    'Terrain and the river course are measured; water level, colour and riparian vegetation are inferred and rendered procedurally.',
  desert:
    'Terrain is measured; dune fields, sand colour and sparse vegetation are inferred from climate and rendered procedurally.',
  polar:
    'Terrain and the ice-sheet outline are measured; snow surface, sea ice extent and stations are inferred and drawn procedurally.',
  island:
    'Coastline and terrain are measured; reefs, beaches and vegetation are inferred from climate; settlements come from OpenStreetMap when online, otherwise procedural.',
  ocean:
    'Bathymetry and coastlines are measured where available; wave state, water colour and sea ice are inferred and rendered procedurally.',
  park:
    'Terrain, lakes and rivers are measured; forest cover and wildlife habitats are inferred from climate and rendered procedurally.',
  rural:
    'Terrain and rivers are measured; field patterns, crops and villages are procedural unless OpenStreetMap detail is available online.',
};

/** Compact input record for {@link defineBookmark}. */
export interface BookmarkSeed {
  id: string;
  name: string;
  category: BookmarkCategory;
  continent: BookmarkContinent;
  country?: string;
  lat: number;
  lon: number;
  description: string;
  /** Overrides the category default. */
  dataNote?: string;
  tags?: string[];
  /** Partial camera override merged over the category default. */
  camera?: Partial<BookmarkCamera>;
}

/**
 * Expands a seed into a full bookmark, filling the camera and data note from
 * the category defaults. Pure and deterministic.
 */
export function defineBookmark(seed: BookmarkSeed): Bookmark {
  const base = DEFAULT_CAMERA_BY_CATEGORY[seed.category];
  const bookmark: Bookmark = {
    id: seed.id,
    name: seed.name,
    category: seed.category,
    continent: seed.continent,
    lat: seed.lat,
    lon: seed.lon,
    camera: { ...base, ...(seed.camera ?? {}) },
    description: seed.description,
    dataNote: seed.dataNote ?? DEFAULT_DATA_NOTE_BY_CATEGORY[seed.category],
  };
  if (seed.country !== undefined) bookmark.country = seed.country;
  if (seed.tags !== undefined) bookmark.tags = [...seed.tags];
  return bookmark;
}

/** Expands many seeds; see {@link defineBookmark}. */
export function defineBookmarks(seeds: readonly BookmarkSeed[]): Bookmark[] {
  return seeds.map(defineBookmark);
}
