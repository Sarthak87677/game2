import type { GeoPoint } from './types';

export interface Showroom extends GeoPoint {
  id: string;
  /** Fictional showroom name (no real dealer or brand). */
  name: string;
  city: string;
  district: string;
  /** Heading (degrees) the glass front faces — normally towards the road. */
  headingDeg: number;
  /** 'curated' entries are approximate positions written from public reference values; 'osm' entries come from `shop=car` nodes when online. */
  source: 'curated' | 'osm';
  dataNote: string;
}

export const SHOWROOM_NOTE = 'Approximate position of a car-dealership cluster (public reference values, ±300 m). Original showroom interior — not the dealer\'s real interior, name or brand.';

/**
 * Curated showroom positions for the Maharashtra slice. Positions are APPROXIMATE areas known for car dealerships,
 * not specific businesses; the showroom building, its name, stock and interior are original procedural content.
 */
export const MAHARASHTRA_SHOWROOMS: Showroom[] = [
  { id: 'worli', name: 'Seaface Motors (fictional)', city: 'Mumbai', district: 'Mumbai City', lat: 19.0090, lon: 72.8170, headingDeg: 270, source: 'curated', dataNote: SHOWROOM_NOTE },
  { id: 'andheri', name: 'Western Express Auto (fictional)', city: 'Mumbai', district: 'Mumbai Suburban', lat: 19.1197, lon: 72.8468, headingDeg: 90, source: 'curated', dataNote: SHOWROOM_NOTE },
  { id: 'pune-baner', name: 'Baner Road Cars (fictional)', city: 'Pune', district: 'Pune', lat: 18.5590, lon: 73.7868, headingDeg: 180, source: 'curated', dataNote: SHOWROOM_NOTE },
  { id: 'nagpur-wardha-rd', name: 'Wardha Road Motors (fictional)', city: 'Nagpur', district: 'Nagpur', lat: 21.1150, lon: 79.0560, headingDeg: 120, source: 'curated', dataNote: SHOWROOM_NOTE },
  { id: 'kolhapur-tararani', name: 'Tararani Chowk Autos (fictional)', city: 'Kolhapur', district: 'Kolhapur', lat: 16.7130, lon: 74.2440, headingDeg: 0, source: 'curated', dataNote: SHOWROOM_NOTE },
];

export function showroomById(id: string): Showroom | undefined {
  return MAHARASHTRA_SHOWROOMS.find((s) => s.id === id);
}
