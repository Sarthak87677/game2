import type { LandmarkArchetype } from '@/world/landmarks/landmarkShapes';

/**
 * Procedural landmark stand-ins. Coordinates and heights are measured (public reference values, ±0.001°); the geometry
 * is an abstract procedural interpretation built from primitives — never a scan or licensed model.
 */
export interface LandmarkModel {
  bookmarkId?: string;
  name: string;
  lat: number;
  lon: number;
  /** Real height in metres (to the tip where applicable). */
  heightM: number;
  /** Characteristic footprint or span in metres. */
  footprintM: number;
  headingDeg: number;
  archetype: LandmarkArchetype;
  colour: string;
  note: string;
}

const NOTE = 'Procedural interpretation at the real position and height — not a surveyed model.';

export const LANDMARK_MODELS: LandmarkModel[] = [
  { name: 'Eiffel Tower', lat: 48.8584, lon: 2.2945, heightM: 330, footprintM: 125, headingDeg: 0, archetype: 'latticeTower', colour: '#5e4f42', note: NOTE },
  { name: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, heightM: 93, footprintM: 30, headingDeg: 0, archetype: 'statueOnPedestal', colour: '#79a68f', note: NOTE },
  { name: 'Elizabeth Tower (Big Ben)', lat: 51.5007, lon: -0.1246, heightM: 96, footprintM: 12, headingDeg: 0, archetype: 'clockTower', colour: '#c9b99a', note: NOTE },
  { name: 'Taj Mahal', lat: 27.1751, lon: 78.0421, heightM: 73, footprintM: 57, headingDeg: 0, archetype: 'domedBuilding', colour: '#f1ece4', note: NOTE },
  { name: 'Great Pyramid of Giza', lat: 29.9792, lon: 31.1342, heightM: 139, footprintM: 230, headingDeg: 0, archetype: 'pyramid', colour: '#c9b58a', note: NOTE },
  { name: 'Burj Khalifa', lat: 25.1972, lon: 55.2744, heightM: 828, footprintM: 110, headingDeg: 0, archetype: 'skyscraperTapered', colour: '#b8c4cf', note: NOTE },
  { name: 'Sydney Opera House', lat: -33.8568, lon: 151.2153, heightM: 65, footprintM: 120, headingDeg: 20, archetype: 'shellRoof', colour: '#f0ede6', note: NOTE },
  { name: 'Christ the Redeemer', lat: -22.9519, lon: -43.2105, heightM: 38, footprintM: 28, headingDeg: 0, archetype: 'statueOnPedestal', colour: '#d8d5cc', note: NOTE },
  { name: 'Colosseum', lat: 41.8902, lon: 12.4922, heightM: 48, footprintM: 188, headingDeg: 0, archetype: 'classicalTemple', colour: '#d3c2a3', note: NOTE },
  { name: 'Parthenon', lat: 37.9715, lon: 23.7267, heightM: 14, footprintM: 70, headingDeg: 0, archetype: 'classicalTemple', colour: '#e6dccb', note: NOTE },
  { name: 'Golden Gate Bridge', lat: 37.8199, lon: -122.4783, heightM: 227, footprintM: 1970, headingDeg: 17, archetype: 'suspensionBridge', colour: '#c0362c', note: NOTE },
  { name: 'Tower Bridge', lat: 51.5055, lon: -0.0754, heightM: 65, footprintM: 244, headingDeg: 0, archetype: 'suspensionBridge', colour: '#9fb3c8', note: NOTE },
  { name: 'Brandenburg Gate', lat: 52.5163, lon: 13.3777, heightM: 26, footprintM: 66, headingDeg: 0, archetype: 'archMonument', colour: '#d8cbb0', note: NOTE },
  { name: 'Arc de Triomphe', lat: 48.8738, lon: 2.295, heightM: 50, footprintM: 45, headingDeg: 30, archetype: 'archMonument', colour: '#d9cdb6', note: NOTE },
  { name: 'Washington Monument', lat: 38.8895, lon: -77.0353, heightM: 169, footprintM: 17, headingDeg: 0, archetype: 'obelisk', colour: '#e8e4dc', note: NOTE },
  { name: 'Space Needle', lat: 47.6205, lon: -122.3493, heightM: 184, footprintM: 42, headingDeg: 0, archetype: 'observationTower', colour: '#d9d9d9', note: NOTE },
  { name: 'CN Tower', lat: 43.6426, lon: -79.3871, heightM: 553, footprintM: 66, headingDeg: 0, archetype: 'observationTower', colour: '#d5d8dc', note: NOTE },
  { name: 'Tokyo Tower', lat: 35.6586, lon: 139.7454, heightM: 333, footprintM: 95, headingDeg: 0, archetype: 'latticeTower', colour: '#e8542c', note: NOTE },
  { name: 'Petronas Towers', lat: 3.1579, lon: 101.7116, heightM: 452, footprintM: 100, headingDeg: 0, archetype: 'twinTowers', colour: '#c8ced6', note: NOTE },
  { name: 'Empire State Building', lat: 40.7484, lon: -73.9857, heightM: 443, footprintM: 130, headingDeg: 29, archetype: 'skyscraperTapered', colour: '#b6b0a4', note: NOTE },
  { name: 'Angkor Wat', lat: 13.4125, lon: 103.867, heightM: 65, footprintM: 180, headingDeg: 0, archetype: 'stupaTemple', colour: '#8f8674', note: NOTE },
  { name: 'Borobudur', lat: -7.6079, lon: 110.2038, heightM: 35, footprintM: 123, headingDeg: 0, archetype: 'steppedPyramid', colour: '#7f7a70', note: NOTE },
  { name: "St Basil's Cathedral", lat: 55.7525, lon: 37.623, heightM: 65, footprintM: 40, headingDeg: 0, archetype: 'domedBuilding', colour: '#c46a5a', note: NOTE },
  { name: 'Sagrada Família', lat: 41.4036, lon: 2.1744, heightM: 172, footprintM: 90, headingDeg: 45, archetype: 'twinTowers', colour: '#c9b79a', note: NOTE },
  { name: 'Leaning Tower of Pisa', lat: 43.723, lon: 10.3966, heightM: 57, footprintM: 16, headingDeg: 0, archetype: 'observationTower', colour: '#e9e2d4', note: NOTE },
  { name: 'Stonehenge', lat: 51.1789, lon: -1.8262, heightM: 4.1, footprintM: 33, headingDeg: 0, archetype: 'stoneCircle', colour: '#9a978f', note: NOTE },
  { name: 'Gateway Arch', lat: 38.6247, lon: -90.1848, heightM: 192, footprintM: 192, headingDeg: 0, archetype: 'gatewayArch', colour: '#cfd3d6', note: NOTE },
  { name: 'Marina Bay Sands', lat: 1.2834, lon: 103.8607, heightM: 200, footprintM: 340, headingDeg: 0, archetype: 'suspensionBridge', colour: '#bcc7d0', note: NOTE + ' Three towers and the sky park are approximated by a bridge-like structure.' },
  { name: 'Machu Picchu', lat: -13.1631, lon: -72.545, heightM: 60, footprintM: 300, headingDeg: 0, archetype: 'terraces', colour: '#7f8b62', note: NOTE },
  { name: 'Chichén Itzá (El Castillo)', lat: 20.6843, lon: -88.5678, heightM: 30, footprintM: 55, headingDeg: 0, archetype: 'steppedPyramid', colour: '#b9ab8c', note: NOTE },
  { name: 'Moai of Ahu Tongariki', lat: -27.1258, lon: -109.2769, heightM: 6, footprintM: 100, headingDeg: 0, archetype: 'stoneCircle', colour: '#8a8378', note: NOTE + ' Standing stones stand in for the moai row.' },
  { name: 'Lotus Temple', lat: 28.5535, lon: 77.2588, heightM: 34, footprintM: 70, headingDeg: 0, archetype: 'shellRoof', colour: '#f2f2ee', note: NOTE },
  { name: 'Hagia Sophia', lat: 41.0086, lon: 28.9802, heightM: 55, footprintM: 82, headingDeg: 0, archetype: 'domedBuilding', colour: '#c7a48a', note: NOTE },
  { name: 'Shanghai Tower', lat: 31.2336, lon: 121.5055, heightM: 632, footprintM: 90, headingDeg: 0, archetype: 'skyscraperTapered', colour: '#a9bccf', note: NOTE },
  { name: 'Sydney Harbour Bridge', lat: -33.8523, lon: 151.2108, heightM: 134, footprintM: 1149, headingDeg: 20, archetype: 'gatewayArch', colour: '#6d7378', note: NOTE },
  { name: 'Table Mountain Cableway (upper station)', lat: -33.9576, lon: 18.4032, heightM: 12, footprintM: 30, headingDeg: 0, archetype: 'genericMonument', colour: '#9a9a96', note: NOTE },
];
