/**
 * Interior plan model. Pure TypeScript (no Cesium) so the grammar and its collision helpers run in Node tests.
 *
 * All plan geometry lives in the BUILDING FRAME: metres, x along the building's long axis, y across it, z up from the
 * ground-floor slab. `origin` + `rotationRad` map that frame onto the local east-north-up frame at the footprint
 * centroid (see frame.ts). Everything produced by the grammar is fictional and generated — never a survey.
 */

export type InteriorCategory =
  | 'residential' | 'office' | 'school' | 'hotel' | 'hospital' | 'mall' | 'restaurant-cafe' | 'museum'
  | 'railway-station' | 'airport-public' | 'showroom' | 'cruise-public';

export const INTERIOR_CATEGORIES: readonly InteriorCategory[] = [
  'residential', 'office', 'school', 'hotel', 'hospital', 'mall', 'restaurant-cafe', 'museum', 'railway-station', 'airport-public', 'showroom', 'cruise-public',
];

/** Axis-aligned rectangle in the building frame (metres). */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export type RoomKind =
  | 'lobby' | 'corridor' | 'classroom' | 'office' | 'meeting' | 'flat' | 'bedroom' | 'kitchen' | 'living' | 'ward' | 'clinic' | 'pharmacy'
  | 'shop' | 'food-court' | 'dining' | 'kitchen-commercial' | 'gallery' | 'ticket-hall' | 'waiting' | 'platform-access' | 'check-in' | 'gate-lounge'
  | 'showroom-floor' | 'service-bay' | 'atrium' | 'cabin' | 'lounge' | 'library' | 'science-lab' | 'computer-lab' | 'art-room' | 'auditorium'
  | 'cafeteria' | 'administration' | 'staff-room' | 'sports-hall' | 'store' | 'washroom' | 'reception' | 'hall';

export interface Room {
  id: string;
  label: string;
  kind: RoomKind;
  rect: Rect;
}

/** A corridor is a walkable space like a room but never gets furniture; rooms open onto it. */
export interface Corridor { id: string; rect: Rect }

export interface Door {
  id: string;
  /** Door centre on a wall. */
  x: number;
  y: number;
  /** Wall axis the door sits in: 'x' → wall runs along x (door opening is a gap in y-facing wall). */
  axis: 'x' | 'y';
  widthM: number;
  /** Ids of the two spaces this door connects ('outside' and 'elevator' are valid pseudo-spaces); null when decorative. */
  links: [string, string] | null;
  /** Painted-on door that never opens; rendered closed with a small "decorative" sign. */
  decorative: boolean;
  /** Ground-floor exit to the street. */
  exterior: boolean;
}

export interface WindowSpec {
  id: string;
  x: number;
  y: number;
  axis: 'x' | 'y';
  widthM: number;
  sillM: number;
  headM: number;
}

/** A wall segment (centre line) in the building frame; door and window openings are cut from it when rendered. */
export interface WallSegment {
  id: string;
  x0: number; y0: number; x1: number; y1: number;
  exterior: boolean;
  /** Low guard wall (terrace railing, parkour block) — rendered short but still blocks movement. */
  railing?: boolean;
}

export interface Furniture {
  id: string;
  label: string;
  rect: Rect;
  heightM: number;
  colour: string;
  roomId: string;
}

export interface Light { id: string; x: number; y: number; wM: number; dM: number }

/**
 * A stair between two consecutive floors: a switchback of two straight ramps in a core rectangle. Flight A rises from
 * the corridor side (near) to the far end into a half landing; flight B rises back from the half landing to the floor
 * above at the near end. `nearX`/`farX` give the ramp extent along x; lanes are split in y.
 */
export interface Stair {
  id: string;
  fromFloor: number;
  toFloor: number;
  core: Rect;
  laneA: Rect;
  laneB: Rect;
  landing: Rect;
  nearX: number;
  farX: number;
}

export interface Elevator {
  id: string;
  shaft: Rect;
  /** Door centre on the corridor side. */
  door: { x: number; y: number; axis: 'x' | 'y' };
  /** Where the player stands to call the lift / arrives after a ride (in the corridor). */
  lobby: { x: number; y: number };
  servesFloors: number[];
}

export interface FloorPlan {
  index: number;
  /** Height of the walking surface above the ground-floor slab. */
  z: number;
  name: string;
  kind: 'floor' | 'terrace';
  rooms: Room[];
  corridors: Corridor[];
  doors: Door[];
  windows: WindowSpec[];
  walls: WallSegment[];
  furniture: Furniture[];
  lights: Light[];
  /** Stairs whose lower floor is this one. */
  stairs: Stair[];
  elevators: Elevator[];
  /** Ground-floor exit points (building frame), one per exterior door. */
  exits: { x: number; y: number; outsideX: number; outsideY: number; doorId: string }[];
}

export interface InteriorPlan {
  id: string;
  category: InteriorCategory;
  seed: number;
  hero: boolean;
  /** Footprint centroid (WGS84) when the request used lon/lat coordinates. */
  origin: { lat: number; lon: number } | null;
  /** Rotation of the building x-axis from east, counter-clockwise, radians. */
  rotationRad: number;
  /** Footprint polygon in the building frame (counter-clockwise, not closed). */
  footprint: [number, number][];
  /** Rectangle actually laid out (largest axis-aligned rectangle found inside the footprint). */
  usable: Rect;
  floorHeightM: number;
  /** Total height of the shell (roof slab top ≈ heightM of the request). */
  heightM: number;
  floors: FloorPlan[];
  /** Visible provenance note. */
  note: string;
  displayName: string;
}

/** Handcrafted room programme for hero buildings; the grammar places these deterministically instead of random rooms. */
export interface HeroRoomSpec {
  label: string;
  kind: RoomKind;
  /** Preferred width along the corridor in metres (clamped to what fits). */
  widthM?: number;
  side?: 'north' | 'south';
  /** Add a decorative (non-opening) cupboard door on the back wall. */
  decorativeDoor?: boolean;
}

export interface HeroFloorSpec {
  name?: string;
  /** When true the whole floor is one hall (auditorium, sports hall, library) instead of rooms along a corridor. */
  hall?: { label: string; kind: RoomKind };
  rooms?: HeroRoomSpec[];
}

export interface HeroLayoutSpec {
  floors: HeroFloorSpec[];
  elevator?: boolean;
  /** Add a walkable railed terrace on the roof (default true). */
  terrace?: boolean;
  corridorWidthM?: number;
  /** Which usable-rect side the entrance door is on (default: side nearest the request's entrance hint, else south). 'west' is the stair core and falls back to south. */
  entrance?: 'north' | 'south' | 'east' | 'west';
}

export interface InteriorRequest {
  /** Footprint ring as [lon, lat] pairs (default) or local metres when `footprintUnits: 'metres'`. */
  footprint: [number, number][];
  footprintUnits?: 'lonlat' | 'metres';
  heightM: number;
  /** Number of storeys; derived from heightM when omitted. */
  floors?: number;
  category: InteriorCategory;
  /** Overrides the centroid-derived seed (hero buildings, tests). */
  seed?: number;
  /** Building name for labels. */
  name?: string;
  /** Entrance hint (same units as the footprint): the exterior door goes on the wall nearest this point. */
  entrance?: [number, number];
  layout?: HeroLayoutSpec;
  /** Cap on generated storeys for performance (default 24). */
  maxFloors?: number;
}
