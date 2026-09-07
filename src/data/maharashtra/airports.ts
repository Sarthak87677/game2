import type { Airport } from './types';

/**
 * Airports for the air journeys. DATA NOTE — positions, runway headings and lengths are approximate public reference
 * values (±300 m, ±5°, ±10 %); terminals are anchor points for the public area, not building outlines. The Delhi/Agra
 * markers exist for the Taj Mahal hop and sit outside Maharashtra.
 */
export const AIRPORTS_DATA_NOTE = 'Airport positions, runway headings/lengths and terminal anchors are approximate public reference values; flights, gates and the terminal flow are simulated.';

export const AIRPORTS: Airport[] = [
  { id: 'bom', name: 'Chhatrapati Shivaji Maharaj International Airport', iata: 'BOM', city: 'Mumbai', lat: 19.0896, lon: 72.8656, runwayHeadingDeg: 90, runwayLengthM: 3400, terminal: { lat: 19.0975, lon: 72.8745 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'pnq', name: 'Pune Airport (Lohegaon)', iata: 'PNQ', city: 'Pune', lat: 18.5822, lon: 73.9197, runwayHeadingDeg: 100, runwayLengthM: 2500, terminal: { lat: 18.5790, lon: 73.9080 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'nag', name: 'Dr. Babasaheb Ambedkar International Airport', iata: 'NAG', city: 'Nagpur', lat: 21.0922, lon: 79.0472, runwayHeadingDeg: 140, runwayLengthM: 3200, terminal: { lat: 21.0900, lon: 79.0560 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'isk', name: 'Nashik Airport (Ozar)', iata: 'ISK', city: 'Nashik', lat: 20.1191, lon: 73.9129, runwayHeadingDeg: 90, runwayLengthM: 3000, terminal: { lat: 20.1140, lon: 73.9060 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'klh', name: 'Kolhapur Airport', iata: 'KLH', city: 'Kolhapur', lat: 16.6647, lon: 74.2894, runwayHeadingDeg: 100, runwayLengthM: 1900, terminal: { lat: 16.6680, lon: 74.2830 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'ixu', name: 'Chhatrapati Sambhajinagar Airport', iata: 'IXU', city: 'Chhatrapati Sambhajinagar', lat: 19.8627, lon: 75.3981, runwayHeadingDeg: 90, runwayLengthM: 2800, terminal: { lat: 19.8600, lon: 75.3900 }, dataNote: AIRPORTS_DATA_NOTE },
  { id: 'agr', name: 'Agra Airport (Taj Mahal hop marker)', iata: 'AGR', city: 'Agra', lat: 27.1558, lon: 77.9609, runwayHeadingDeg: 50, runwayLengthM: 2700, terminal: { lat: 27.1600, lon: 77.9700 }, dataNote: AIRPORTS_DATA_NOTE, external: true },
  { id: 'del', name: 'Indira Gandhi International Airport (marker)', iata: 'DEL', city: 'Delhi', lat: 28.5562, lon: 77.1000, runwayHeadingDeg: 100, runwayLengthM: 4400, terminal: { lat: 28.5520, lon: 77.0880 }, dataNote: AIRPORTS_DATA_NOTE, external: true },
];

const BY_ID = new Map(AIRPORTS.map((a) => [a.id, a]));

export function airportById(id: string): Airport | undefined {
  return BY_ID.get(id);
}
