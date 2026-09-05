import type { SpawnPoint } from '@/gameplay/types';

const CAMPUS_NOTE = 'Original, fictionalised campus reconstruction inspired by the school’s public map position; interiors are generated, not surveyed.';
const OSM_NOTE = 'Terrain is measured; buildings come from OpenStreetMap when online, otherwise they are procedural. Landmarks are labelled stand-ins.';

/**
 * Player spawn points. All coordinates are approximate public reference values (±300 m); the campus point is the
 * public map position of the school near Atigre, Kolhapur — the campus itself is an original reconstruction.
 */
export const MAHARASHTRA_SPAWNS: SpawnPoint[] = [
  { id: 'sgis-campus', name: 'SGIS-inspired campus, Atigre (Kolhapur)', region: 'Kolhapur', lat: 16.7335, lon: 74.4015, headingDeg: 20, description: 'Landscaped entrance of the school-inspired hero campus.', dataNote: CAMPUS_NOTE, approximate: true },
  { id: 'gateway-of-india', name: 'Gateway of India, Mumbai', region: 'Mumbai', lat: 18.9218, lon: 72.8340, headingDeg: 90, description: 'Apollo Bunder waterfront by the basalt arch and the ferry jetties.', dataNote: OSM_NOTE, approximate: true },
  { id: 'marine-drive', name: 'Marine Drive, Mumbai', region: 'Mumbai', lat: 18.9432, lon: 72.8236, headingDeg: 340, description: 'The promenade along Back Bay.', dataNote: OSM_NOTE, approximate: true },
  { id: 'csmt', name: 'Chhatrapati Shivaji Maharaj Terminus', region: 'Mumbai', lat: 18.9400, lon: 72.8353, headingDeg: 180, description: 'Forecourt of the Victorian-Gothic terminus.', dataNote: OSM_NOTE, approximate: true },
  { id: 'shaniwar-wada', name: 'Shaniwar Wada, Pune', region: 'Pune', lat: 18.5195, lon: 73.8553, headingDeg: 0, description: 'Delhi Gate of the Peshwa fortification.', dataNote: OSM_NOTE, approximate: true },
  { id: 'mahalaxmi-kolhapur', name: 'Mahalaxmi Temple area, Kolhapur', region: 'Kolhapur', lat: 16.6950, lon: 74.2246, headingDeg: 90, description: 'Old-town lanes around the temple.', dataNote: OSM_NOTE, approximate: true },
  { id: 'deekshabhoomi', name: 'Deekshabhoomi, Nagpur', region: 'Nagpur', lat: 21.1287, lon: 79.0656, headingDeg: 0, description: 'Grounds of the stupa.', dataNote: OSM_NOTE, approximate: true },
  { id: 'mahabaleshwar', name: 'Mahabaleshwar', region: 'Satara', lat: 17.9237, lon: 73.6586, headingDeg: 270, description: 'Hill-station plateau in the Western Ghats.', dataNote: OSM_NOTE, approximate: true },
  { id: 'ganpatipule', name: 'Ganpatipule beach', region: 'Ratnagiri', lat: 17.1461, lon: 73.2653, headingDeg: 270, description: 'Konkan coast beach.', dataNote: OSM_NOTE, approximate: true },
  { id: 'taj-mahal', name: 'Taj Mahal, Agra (external hero destination)', region: 'Agra, Uttar Pradesh', lat: 27.1731, lon: 78.0421, headingDeg: 0, description: 'Great Gate approach to the charbagh garden.', dataNote: 'Hero stand-in at the real position; gardens and interior are an approximate original reconstruction.', approximate: true },
];

export function spawnById(id: string): SpawnPoint | undefined {
  return MAHARASHTRA_SPAWNS.find((s) => s.id === id);
}
