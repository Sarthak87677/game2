/**
 * Maharashtra data model. Everything here is plain TypeScript (no Cesium) so it can be unit-tested in Node.
 *
 * DATA NOTE — coordinates in this module are written from public reference values and are APPROXIMATE (typically
 * within a few hundred metres). Nothing is surveyed by this project; the UI labels them as approximate.
 */
export interface GeoPoint { lat: number; lon: number }

export type DestinationKind =
  | 'city' | 'town' | 'hill-station' | 'coast' | 'fort' | 'monument' | 'temple' | 'museum' | 'stadium' | 'station' | 'airport' | 'port'
  | 'campus' | 'showroom' | 'park' | 'dam' | 'waterfall' | 'nature' | 'village';

export interface Destination extends GeoPoint {
  id: string;
  name: string;
  kind: DestinationKind;
  district: string;
  /** Short description for the UI. */
  description: string;
  /** What is measured vs generated here. */
  dataNote: string;
  /** Preferred camera height (m above ground) when flying there from orbit. */
  overviewHeightM: number;
  /** Optional ground spawn near the destination (defaults to the destination itself). */
  spawn?: GeoPoint & { headingDeg: number };
  tags?: string[];
  /** Outside Maharashtra (e.g. Taj Mahal hero destination). */
  external?: boolean;
}

export interface Station extends GeoPoint {
  id: string;
  name: string;
  /** Official station code where known (e.g. CSMT, PUNE). */
  code: string;
  district: string;
  platforms: number;
}

export interface RailCorridor {
  id: string;
  name: string;
  /** Ordered station ids along the corridor. */
  stations: string[];
  /** Ordered polyline (approximate) followed by trains, including intermediate shape points. */
  path: GeoPoint[];
  /** Service style used for train models and speed limits. */
  service: 'suburban' | 'metro' | 'intercity' | 'heritage';
}

export interface Airport extends GeoPoint {
  id: string;
  name: string;
  iata: string;
  city: string;
  /** Runway heading in degrees (one direction) and length in metres, approximate. */
  runwayHeadingDeg: number;
  runwayLengthM: number;
  /** Terminal public-area anchor point. */
  terminal: GeoPoint;
}

export interface Port extends GeoPoint {
  id: string;
  name: string;
  kind: 'jetty' | 'harbour' | 'marina' | 'cruise-terminal';
}

export interface WaterRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  path: GeoPoint[];
  vessel: 'ferry' | 'speedboat' | 'cruise';
}
