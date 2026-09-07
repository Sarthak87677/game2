import type { LandmarkModel } from './landmarkModels';

/**
 * Maharashtra landmark stand-ins. Every entry is a procedural interpretation at the real (approximate, ±200 m)
 * position: abstract primitives, never a scan or a licensed model. Heights are rounded public reference values.
 */
const NOTE = 'Procedural interpretation at the real position — not a surveyed model; coordinates approximate (±200 m).';

export const MAHARASHTRA_LANDMARK_MODELS: LandmarkModel[] = [
  { bookmarkId: 'mh-gateway-of-india', name: 'Gateway of India', lat: 18.9220, lon: 72.8347, heightM: 26, footprintM: 30, headingDeg: 90, archetype: 'archMonument', colour: '#a8946e', note: NOTE },
  { bookmarkId: 'mh-csmt', name: 'Chhatrapati Shivaji Maharaj Terminus', lat: 18.9398, lon: 72.8355, heightM: 45, footprintM: 170, headingDeg: 0, archetype: 'stationHall', colour: '#9c8b74', note: NOTE + ' Dome and long Gothic hall are abstracted.' },
  { bookmarkId: 'mh-bandra-worli-sea-link', name: 'Bandra–Worli Sea Link', lat: 19.0325, lon: 72.8160, heightM: 126, footprintM: 5600, headingDeg: 20, archetype: 'cableStayedBridge', colour: '#c9ced3', note: NOTE + ' Length 5.6 km and heading ≈ 20° are approximate.' },
  { bookmarkId: 'mh-haji-ali-dargah', name: 'Haji Ali Dargah', lat: 18.9827, lon: 72.8090, heightM: 26, footprintM: 30, headingDeg: 0, archetype: 'domedBuilding', colour: '#f1eee6', note: NOTE },
  { bookmarkId: 'mh-haji-ali-dargah', name: 'Haji Ali causeway', lat: 18.9829, lon: 72.8107, heightM: 1.5, footprintM: 420, headingDeg: 90, archetype: 'causeway', colour: '#b9b2a4', note: NOTE + ' The tidal causeway is drawn as a straight raised walkway.' },
  { bookmarkId: 'mh-elephanta-caves', name: 'Elephanta Caves (marker)', lat: 18.9633, lon: 72.9315, heightM: 14, footprintM: 70, headingDeg: 180, archetype: 'caveArc', colour: '#8a8072', note: NOTE + ' Marker only: a small cliff with cave openings.' },
  { bookmarkId: 'mh-wankhede-stadium', name: 'Wankhede Stadium', lat: 18.9389, lon: 72.8258, heightM: 35, footprintM: 190, headingDeg: 0, archetype: 'stadiumRing', colour: '#a4a9b0', note: NOTE },
  { bookmarkId: 'mh-dy-patil-stadium', name: 'DY Patil Stadium', lat: 19.0433, lon: 73.0264, heightM: 40, footprintM: 230, headingDeg: 0, archetype: 'stadiumRing', colour: '#b5bcc4', note: NOTE },
  { bookmarkId: 'mh-university-of-mumbai-fort', name: 'Rajabai Clock Tower', lat: 18.9299, lon: 72.8305, heightM: 85, footprintM: 12, headingDeg: 0, archetype: 'clockTower', colour: '#b09a7c', note: NOTE },
  { bookmarkId: 'mh-global-vipassana-pagoda', name: 'Global Vipassana Pagoda', lat: 19.2296, lon: 72.8006, heightM: 96, footprintM: 90, headingDeg: 0, archetype: 'stupaTemple', colour: '#d8b45a', note: NOTE },
  { bookmarkId: 'mh-shaniwar-wada', name: 'Shaniwar Wada', lat: 18.5195, lon: 73.8553, heightM: 9, footprintM: 190, headingDeg: 0, archetype: 'fortWall', colour: '#7c6a54', note: NOTE + ' Ramparts with the Delhi Gate on the south side; the palace interior is not reconstructed.' },
  { bookmarkId: 'mh-raigad-fort', name: 'Raigad Fort', lat: 18.2344, lon: 73.4402, heightM: 8, footprintM: 320, headingDeg: 0, archetype: 'fortWall', colour: '#7a7062', note: NOTE + ' Ramparts placed on the summit plateau.' },
  { bookmarkId: 'mh-sinhagad', name: 'Sinhagad Fort', lat: 18.3663, lon: 73.7559, heightM: 7, footprintM: 260, headingDeg: 0, archetype: 'fortWall', colour: '#75695a', note: NOTE },
  { bookmarkId: 'mh-pratapgad', name: 'Pratapgad Fort', lat: 17.9367, lon: 73.5793, heightM: 8, footprintM: 220, headingDeg: 0, archetype: 'fortWall', colour: '#6f6659', note: NOTE },
  { bookmarkId: 'mh-panhala-fort', name: 'Panhala Fort', lat: 16.8120, lon: 74.1100, heightM: 8, footprintM: 520, headingDeg: 0, archetype: 'fortWall', colour: '#77705f', note: NOTE },
  { bookmarkId: 'mh-daulatabad-fort', name: 'Daulatabad Fort', lat: 19.9427, lon: 75.2147, heightM: 10, footprintM: 300, headingDeg: 0, archetype: 'fortWall', colour: '#8a7e6a', note: NOTE },
  { bookmarkId: 'mh-bibi-ka-maqbara', name: 'Bibi Ka Maqbara', lat: 19.9014, lon: 75.3203, heightM: 32, footprintM: 40, headingDeg: 0, archetype: 'domedBuilding', colour: '#ece7dc', note: NOTE + ' Dome with four corner minarets.' },
  { bookmarkId: 'mh-deekshabhoomi', name: 'Deekshabhoomi', lat: 21.1287, lon: 79.0656, heightM: 36, footprintM: 60, headingDeg: 0, archetype: 'stupaTemple', colour: '#e9e3d7', note: NOTE },
  { bookmarkId: 'mh-ellora-caves', name: 'Ellora — Kailasa temple', lat: 20.0268, lon: 75.1793, heightM: 33, footprintM: 90, headingDeg: 0, archetype: 'rockCutTemple', colour: '#8f7f68', note: NOTE + ' Courtyard, screen and tower massing are abstracted.' },
  { bookmarkId: 'mh-ajanta-caves', name: 'Ajanta Caves', lat: 20.5519, lon: 75.7033, heightM: 40, footprintM: 520, headingDeg: 0, archetype: 'caveArc', colour: '#8d8171', note: NOTE + ' Horseshoe cliff with cave openings.' },
  { bookmarkId: 'mh-mahalaxmi-temple-kolhapur', name: 'Mahalaxmi Temple, Kolhapur', lat: 16.6950, lon: 74.2246, heightM: 25, footprintM: 30, headingDeg: 0, archetype: 'shikhara', colour: '#5a544c', note: NOTE },
  { bookmarkId: 'mh-trimbakeshwar', name: 'Trimbakeshwar Temple', lat: 19.9322, lon: 73.5311, heightM: 22, footprintM: 28, headingDeg: 0, archetype: 'shikhara', colour: '#4f4a44', note: NOTE },
  { bookmarkId: 'mh-siddhivinayak-temple', name: 'Siddhivinayak Temple', lat: 19.0169, lon: 72.8303, heightM: 20, footprintM: 24, headingDeg: 0, archetype: 'shikhara', colour: '#d8c27a', note: NOTE },
];
