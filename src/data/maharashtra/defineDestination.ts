import type { Destination, DestinationKind } from './types';

/**
 * Bounding box of Maharashtra (approximate, generous by ~0.1°). Every non-`external` destination must fall inside it;
 * the unit tests enforce this.
 */
export const MAHARASHTRA_BBOX = { south: 15.55, north: 22.15, west: 72.55, east: 80.95 } as const;

export function insideMaharashtra(lat: number, lon: number): boolean {
  return lat >= MAHARASHTRA_BBOX.south && lat <= MAHARASHTRA_BBOX.north && lon >= MAHARASHTRA_BBOX.west && lon <= MAHARASHTRA_BBOX.east;
}

/** Overview camera height (m above ground) per kind when nothing more specific is given. */
export const OVERVIEW_HEIGHT_BY_KIND: Readonly<Record<DestinationKind, number>> = {
  city: 3000, town: 1800, 'hill-station': 2500, coast: 1500, fort: 900, monument: 500, temple: 500, museum: 450, stadium: 600,
  station: 500, airport: 1800, port: 800, campus: 700, showroom: 400, park: 3000, dam: 1500, waterfall: 900, nature: 2500, village: 1200,
};

/**
 * Default provenance note per kind. Every note says what is measured and what is approximate/procedural, because
 * nothing in this module is surveyed by the project: coordinates are public reference values written from memory.
 */
export const DATA_NOTE_BY_KIND: Readonly<Record<DestinationKind, string>> = {
  city: 'Approximate centre coordinates from public reference values (±500 m). Terrain is measured; buildings come from OpenStreetMap when online, otherwise they are procedural.',
  town: 'Approximate centre coordinates from public reference values (±500 m). Terrain is measured; buildings come from OpenStreetMap when online, otherwise they are procedural.',
  'hill-station': 'Approximate coordinates (±500 m). Terrain is measured; vegetation and buildings are inferred or procedural.',
  coast: 'Approximate coordinates (±500 m). Coastline and terrain are measured; beach, surf and buildings are inferred or procedural.',
  fort: 'Approximate coordinates (±300 m). Terrain is measured; any fort walls shown are a procedural stand-in, not a survey.',
  monument: 'Approximate coordinates (±200 m). Terrain is measured; the monument body is a procedural stand-in labelled as such.',
  temple: 'Approximate coordinates (±200 m). Terrain is measured; the temple body is a procedural stand-in, not a model of the real shrine.',
  museum: 'Approximate coordinates (±200 m). Terrain is measured; the building comes from OpenStreetMap when online, otherwise procedural. No collection content is reproduced.',
  stadium: 'Approximate coordinates (±200 m). Terrain is measured; the stadium body is a procedural stand-in.',
  station: 'Approximate coordinates (±200 m). Terrain is measured; the station building is a procedural stand-in and timetables in the game are fictional.',
  airport: 'Approximate coordinates (±500 m). Terrain is measured; runway and terminal shapes are approximate procedural stand-ins and flights in the game are fictional.',
  port: 'Approximate coordinates (±300 m). Coastline is measured; jetties are procedural and vessels in the game are fictional.',
  campus: 'Approximate coordinates (±300 m). Terrain is measured; any campus shown is an original, fictionalised procedural reconstruction, not a survey.',
  showroom: 'Approximate coordinates (±300 m). Terrain is measured; the showroom is a fictional procedural building and no real dealership or brand is represented.',
  park: 'Approximate coordinates (±1 km). Terrain is measured; forest cover and wildlife are inferred and procedural.',
  dam: 'Approximate coordinates (±500 m). Terrain and reservoir outline are measured where OpenStreetMap is available; the dam body is an approximate procedural shape.',
  waterfall: 'Approximate coordinates (±300 m). Terrain is measured; water flow is a procedural effect.',
  nature: 'Approximate coordinates (±1 km). Terrain is measured; vegetation, wildlife and colours are inferred.',
  village: 'Approximate coordinates (±500 m). Terrain is measured; village buildings are procedural unless OpenStreetMap detail is available online.',
};

export interface DestinationSeed {
  id: string;
  name: string;
  kind: DestinationKind;
  district: string;
  lat: number;
  lon: number;
  description: string;
  tags?: string[];
  overviewHeightM?: number;
  dataNote?: string;
  spawn?: Destination['spawn'];
  external?: boolean;
}

/** Expands a compact seed into a full {@link Destination}, filling the note and overview height from the kind. */
export function defineDestination(seed: DestinationSeed): Destination {
  const d: Destination = {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    district: seed.district,
    lat: seed.lat,
    lon: seed.lon,
    description: seed.description,
    dataNote: seed.dataNote ?? DATA_NOTE_BY_KIND[seed.kind],
    overviewHeightM: seed.overviewHeightM ?? OVERVIEW_HEIGHT_BY_KIND[seed.kind],
    tags: [...(seed.tags ?? []), seed.kind, seed.district.toLowerCase(), 'maharashtra'].map((t) => t.toLowerCase().trim()).filter((t, i, a) => t.length > 0 && a.indexOf(t) === i),
  };
  if (seed.spawn) d.spawn = { ...seed.spawn };
  if (seed.external) { d.external = true; d.tags = d.tags?.filter((t) => t !== 'maharashtra'); }
  return d;
}

export function defineDestinations(seeds: readonly DestinationSeed[]): Destination[] {
  return seeds.map(defineDestination);
}
