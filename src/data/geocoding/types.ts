/**
 * Shared geocoding types. Networked adapters (e.g. Nominatim) implement
 * {@link GeocodingAdapter}; the offline gazetteer exposes the same result shape.
 */

/** Kind of a geocoding hit; drives icons and default camera heights. */
export type GeocodeKind = 'city' | 'capital' | 'country' | 'landmark' | 'physical' | 'region' | 'bookmark';

/** Where a result came from. */
export type GeocodeSource = 'natural-earth' | 'terra-bookmarks' | 'nominatim' | 'photon';

/** A single geocoding hit. */
export interface GeocodeResult {
  /** Stable unique id (e.g. `ne-place-tokyo-jp`, or a bookmark id). */
  id: string;
  /** Primary name. */
  name: string;
  /** Name with disambiguating context, e.g. "Paris, France" or "Sahara (desert, Africa)". */
  displayName: string;
  kind: GeocodeKind;
  lat: number;
  lon: number;
  /** A sensible camera height in metres for flying to the result. */
  heightM: number;
  source: GeocodeSource;
  /** Relevance score; higher is better. Only comparable within one search call. */
  score: number;
  /** Id of a curated bookmark at (or merged into) this result, if any. */
  bookmarkId?: string;
}

/** A proximity result returned by `OfflineGazetteer.nearest`. */
export interface NearestPlace extends GeocodeResult {
  /** Great-circle distance from the query point in kilometres. */
  distanceKm: number;
}

/** Common interface for forward (and optionally reverse) geocoders. */
export interface GeocodingAdapter {
  /** Stable adapter id, e.g. `offline-gazetteer` or `nominatim`. */
  readonly id: string;
  /** Human readable adapter name. */
  readonly name: string;
  /** True when the adapter needs network access. */
  readonly requiresNetwork: boolean;
  /** Forward geocoding: free-text query to ranked results. */
  search(query: string, limit?: number): Promise<GeocodeResult[]>;
  /** Optional reverse geocoding: coordinates to a human readable place description. */
  reverse?(lat: number, lon: number): Promise<string | null>;
}
