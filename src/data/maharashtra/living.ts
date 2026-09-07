/**
 * Living-world and activity data for the Maharashtra slice (crowd hotspots, photography challenges, landmark
 * collection, tours, checklists, boat courses, museums, cleanup parks, the campus basketball court).
 *
 * DATA NOTE — every coordinate here is written from public reference values and is APPROXIMATE (typically within a
 * few hundred metres). Nothing was surveyed. Stalls, sign boards, exhibits, litter, the court and the tours are
 * original procedural / fictional content and are labelled as such wherever they are shown.
 */
import type { TourKeyframe } from '@/modes/ModeController';
import type { GeoPoint } from './types';

export const APPROX_NOTE = 'Approximate public reference position (not surveyed).';
export const PROCEDURAL_NOTE = 'Procedural / fictional in-game content — not a reproduction of the real place.';

/** Bounding box used to decide when the Maharashtra presets (monsoon, regional crowds) apply. */
export const MAHARASHTRA_BBOX = { south: 15.6, north: 22.1, west: 72.6, east: 80.9 };

export function inMaharashtra(lat: number, lon: number): boolean {
  return lat >= MAHARASHTRA_BBOX.south && lat <= MAHARASHTRA_BBOX.north && lon >= MAHARASHTRA_BBOX.west && lon <= MAHARASHTRA_BBOX.east;
}

export type RegionId = 'Mumbai' | 'Pune' | 'Kolhapur' | 'Ajanta–Ellora' | 'Konkan' | 'Nagpur' | 'Mahabaleshwar' | 'Lonavala';

export type HotspotKind = 'station' | 'market' | 'campus' | 'temple' | 'promenade' | 'park' | 'fort' | 'beach' | 'village' | 'monument' | 'lake';

/** A place where people gather. Crowds are spawned around it with kind-specific density and clothing palettes. */
export interface CrowdHotspot extends GeoPoint {
  id: string;
  name: string;
  region: RegionId;
  kind: HotspotKind;
  /** Radius (m) within which the hotspot influences density and stall placement. */
  radiusM: number;
  /** Number of procedural food/market stalls to place around the anchor (0 = none). */
  stalls: number;
  dataNote: string;
}

const H = (id: string, name: string, region: RegionId, kind: HotspotKind, lat: number, lon: number, radiusM: number, stalls: number): CrowdHotspot => ({ id, name, region, kind, lat, lon, radiusM, stalls, dataNote: APPROX_NOTE });

export const CROWD_HOTSPOTS: CrowdHotspot[] = [
  H('csmt-forecourt', 'CSMT forecourt', 'Mumbai', 'station', 18.9400, 72.8353, 220, 6),
  H('gateway-apollo-bunder', 'Apollo Bunder promenade', 'Mumbai', 'promenade', 18.9218, 72.8340, 260, 5),
  H('marine-drive', 'Marine Drive promenade', 'Mumbai', 'promenade', 18.9432, 72.8236, 400, 3),
  H('chowpatty', 'Girgaon Chowpatty', 'Mumbai', 'beach', 18.9547, 72.8135, 300, 6),
  H('dadar-station', 'Dadar station area', 'Mumbai', 'station', 19.0176, 72.8433, 250, 5),
  H('crawford-market', 'Old market lanes near CSMT', 'Mumbai', 'market', 18.9460, 72.8340, 220, 8),
  H('pune-station', 'Pune Junction forecourt', 'Pune', 'station', 18.5285, 73.8743, 220, 5),
  H('shaniwar-wada', 'Shaniwar Wada gate', 'Pune', 'monument', 18.5195, 73.8553, 220, 4),
  H('tulshibaug', 'Old-town market lanes, Pune', 'Pune', 'market', 18.5165, 73.8560, 200, 8),
  H('lonavala-bazaar', 'Lonavala bazaar', 'Lonavala', 'market', 18.7546, 73.4062, 220, 6),
  H('mahalaxmi-lanes', 'Mahalaxmi temple lanes', 'Kolhapur', 'temple', 16.6950, 74.2246, 240, 8),
  H('rankala', 'Rankala lake front', 'Kolhapur', 'lake', 16.6910, 74.2135, 320, 5),
  H('kolhapur-station', 'Kolhapur station forecourt', 'Kolhapur', 'station', 16.7050, 74.2340, 200, 4),
  H('sgis-campus', 'School-inspired campus, Atigre', 'Kolhapur', 'campus', 16.7335, 74.4015, 260, 1),
  H('atigre-village', 'Atigre village lanes', 'Kolhapur', 'village', 16.7360, 74.3930, 350, 2),
  H('deekshabhoomi', 'Deekshabhoomi grounds', 'Nagpur', 'monument', 21.1287, 79.0656, 260, 4),
  H('futala', 'Futala lake front', 'Nagpur', 'lake', 21.1550, 79.0470, 300, 5),
  H('mahabaleshwar-bazaar', 'Mahabaleshwar main bazaar', 'Mahabaleshwar', 'market', 17.9237, 73.6586, 240, 6),
  H('venna-lake', 'Venna lake', 'Mahabaleshwar', 'lake', 17.9224, 73.6702, 260, 3),
  H('ganpatipule-beach', 'Ganpatipule beach front', 'Konkan', 'beach', 17.1461, 73.2653, 320, 5),
  H('ganpatipule-village', 'Ganpatipule village', 'Konkan', 'village', 17.1490, 73.2700, 350, 2),
  H('ajanta-approach', 'Ajanta caves approach', 'Ajanta–Ellora', 'monument', 20.5519, 75.7033, 260, 3),
  H('ellora-approach', 'Ellora caves approach', 'Ajanta–Ellora', 'monument', 20.0268, 75.1790, 260, 3),
];

/** Generic Marathi/English sign-board texts used on procedural stalls (generic words, no brands). */
export const STALL_SIGNS: { marathi: string; english: string }[] = [
  { marathi: 'चहा', english: 'Tea' },
  { marathi: 'वडा पाव', english: 'Vada pav' },
  { marathi: 'फळे', english: 'Fruit' },
  { marathi: 'नारळ पाणी', english: 'Coconut water' },
  { marathi: 'भेळ', english: 'Bhel' },
  { marathi: 'उसाचा रस', english: 'Sugarcane juice' },
  { marathi: 'फुले', english: 'Flowers' },
  { marathi: 'पोहे', english: 'Poha' },
  { marathi: 'कुल्फी', english: 'Kulfi' },
  { marathi: 'भाजी', english: 'Vegetables' },
];

/** Photography challenge: stand within `standRadiusM`, face the subject within `toleranceDeg`, press P. */
export interface PhotoChallenge extends GeoPoint {
  id: string;
  region: RegionId;
  title: string;
  hint: string;
  standRadiusM: number;
  toleranceDeg: number;
  /** Base points; a golden-hour bonus applies when `goldenHour` is set and the sun is low. */
  points: number;
  goldenHour?: boolean;
  dataNote: string;
}

const P = (id: string, region: RegionId, title: string, hint: string, lat: number, lon: number, standRadiusM: number, points: number, goldenHour = false): PhotoChallenge => ({ id, region, title, hint, lat, lon, standRadiusM, toleranceDeg: 40, points, goldenHour, dataNote: APPROX_NOTE });

export const PHOTO_CHALLENGES: PhotoChallenge[] = [
  P('photo-gateway', 'Mumbai', 'The Gateway arch', 'Frame the basalt arch from Apollo Bunder.', 18.9220, 72.8347, 260, 10),
  P('photo-csmt', 'Mumbai', 'CSMT façade', 'The Victorian-Gothic terminus from the forecourt.', 18.9398, 72.8355, 240, 10),
  P('photo-marine-drive', 'Mumbai', 'Marine Drive curve', 'The bay-side promenade — best after sunset.', 18.9380, 72.8215, 500, 10, true),
  P('photo-haji-ali', 'Mumbai', 'Sea causeway from Worli', 'The causeway across the bay from the sea face.', 18.9827, 72.8090, 700, 12, true),
  P('photo-shaniwar', 'Pune', 'Delhi Gate, Shaniwar Wada', 'The great gate of the Peshwa fortification.', 18.5195, 73.8553, 240, 10),
  P('photo-sinhagad', 'Pune', 'Sinhagad ridge', 'The fort hill from its approach road.', 18.3663, 73.7559, 1200, 12, true),
  P('photo-mahalaxmi', 'Kolhapur', 'Temple spire', 'The shikhara above the old-town lanes.', 16.6950, 74.2246, 220, 10),
  P('photo-rankala', 'Kolhapur', 'Rankala sunset', 'Across the lake at golden hour.', 16.6910, 74.2135, 500, 12, true),
  P('photo-panhala', 'Kolhapur', 'Panhala walls', 'Fort ramparts above the plain.', 16.8120, 74.1090, 900, 12),
  P('photo-kailasa', 'Ajanta–Ellora', 'Rock-cut temple, Ellora', 'The monolithic temple from the courtyard approach.', 20.0268, 75.1790, 300, 15),
  P('photo-ajanta-gorge', 'Ajanta–Ellora', 'Ajanta horseshoe gorge', 'The cave terraces along the river bend.', 20.5519, 75.7033, 600, 15),
  P('photo-ganpatipule', 'Konkan', 'Ganpatipule shore', 'Surf, sand and coconut palms.', 17.1461, 73.2653, 400, 10, true),
  P('photo-sindhudurg', 'Konkan', 'Sea fort from the shore', 'The island fort across the water.', 16.0410, 73.4590, 1200, 15),
  P('photo-deekshabhoomi', 'Nagpur', 'Deekshabhoomi dome', 'The great stupa from the grounds.', 21.1287, 79.0656, 260, 10),
  P('photo-wilson-point', 'Mahabaleshwar', 'Sunrise plateau', 'Wilson Point at dawn.', 17.9310, 73.6720, 500, 12, true),
  P('photo-venna', 'Mahabaleshwar', 'Venna lake', 'Boats on the hill-station lake.', 17.9224, 73.6702, 350, 10),
  P('photo-campus-court', 'Kolhapur', 'Campus court', 'The basketball court on the school-inspired campus.', 16.7340, 74.4020, 120, 8),
];

/** Landmarks that are collected when the player comes within `radiusM` on foot (or in a vehicle). */
export interface CollectibleLandmark extends GeoPoint {
  id: string;
  name: string;
  region: RegionId;
  radiusM: number;
  /** Two or three sentences of generic, educational context. */
  about: string;
  dataNote: string;
}

const L = (id: string, name: string, region: RegionId, lat: number, lon: number, about: string, radiusM = 160): CollectibleLandmark => ({ id, name, region, lat, lon, radiusM, about, dataNote: APPROX_NOTE });

export const COLLECTIBLE_LANDMARKS: CollectibleLandmark[] = [
  L('lm-gateway', 'Gateway of India', 'Mumbai', 18.9220, 72.8347, 'A basalt arch on the Apollo Bunder waterfront, completed in the 1920s, facing the harbour and the ferry jetties.'),
  L('lm-csmt', 'Chhatrapati Shivaji Maharaj Terminus', 'Mumbai', 18.9398, 72.8355, 'A Victorian-Gothic railway terminus from the 1880s, still one of the busiest stations in the country.', 220),
  L('lm-marine-drive', 'Marine Drive', 'Mumbai', 18.9432, 72.8236, 'A curved sea-front boulevard along Back Bay lined with Art Deco buildings; its evening lights are nicknamed the Queen’s Necklace.', 300),
  L('lm-chowpatty', 'Girgaon Chowpatty', 'Mumbai', 18.9547, 72.8135, 'A city beach at the northern end of Marine Drive, known for evening snack stalls.', 260),
  L('lm-shaniwar', 'Shaniwar Wada', 'Pune', 18.5195, 73.8553, 'The 18th-century seat of the Peshwas; the surviving walls and gates enclose a garden.', 200),
  L('lm-aga-khan', 'Aga Khan Palace', 'Pune', 18.5525, 73.9016, 'A palace from the 1890s set in lawns, later a place of confinement during the freedom movement.'),
  L('lm-sinhagad', 'Sinhagad', 'Pune', 18.3663, 73.7559, 'A hill fort on a spur of the Sahyadri south-west of Pune, a popular trek.', 400),
  L('lm-karla', 'Karla caves', 'Lonavala', 18.7830, 73.4700, 'Rock-cut Buddhist chaitya halls dating to around the 1st century BCE, above the Lonavala–Pune road.', 300),
  L('lm-lonavala', 'Lonavala', 'Lonavala', 18.7546, 73.4062, 'A hill station on the Bhor Ghat between Mumbai and Pune, green and misty in the monsoon.', 300),
  L('lm-mahalaxmi', 'Mahalaxmi Temple, Kolhapur', 'Kolhapur', 16.6950, 74.2246, 'A major temple in Kolhapur’s old town surrounded by market lanes.', 150),
  L('lm-rankala', 'Rankala lake', 'Kolhapur', 16.6910, 74.2135, 'A lake on the edge of Kolhapur’s old town with an evening promenade.', 300),
  L('lm-new-palace', 'New Palace, Kolhapur', 'Kolhapur', 16.7134, 74.2381, 'A late-19th-century palace in a garden setting, partly open as a museum.'),
  L('lm-panhala', 'Panhala fort', 'Kolhapur', 16.8120, 74.1090, 'A large hill fort north-west of Kolhapur with long ramparts and views over the plain.', 500),
  L('lm-campus', 'School-inspired campus, Atigre', 'Kolhapur', 16.7335, 74.4015, 'An original procedural campus inspired by a school’s public map position near Atigre.', 200),
  L('lm-ajanta', 'Ajanta caves', 'Ajanta–Ellora', 20.5519, 75.7033, 'Rock-cut Buddhist monasteries and halls in a horseshoe gorge, famous for their painted interiors.', 350),
  L('lm-ellora', 'Ellora caves', 'Ajanta–Ellora', 20.0268, 75.1790, 'A cliff of rock-cut monuments from three traditions, including a monolithic temple carved from the top down.', 350),
  L('lm-bibi', 'Bibi Ka Maqbara', 'Ajanta–Ellora', 19.9014, 75.3203, 'A 17th-century garden mausoleum near Aurangabad (Chhatrapati Sambhajinagar).', 220),
  L('lm-daulatabad', 'Daulatabad fort', 'Ajanta–Ellora', 19.9426, 75.2171, 'A conical hill fort with concentric walls and a rock-cut moat.', 450),
  L('lm-ganpatipule', 'Ganpatipule beach', 'Konkan', 17.1461, 73.2653, 'A long Konkan beach backed by coconut palms and a hill-side temple.', 300),
  L('lm-sindhudurg', 'Sindhudurg fort', 'Konkan', 16.0410, 73.4590, 'A 17th-century sea fort built on an island off Malvan.', 500),
  L('lm-alibaug', 'Alibaug beach', 'Konkan', 18.6414, 72.8722, 'A beach town across the harbour from Mumbai, reached by ferry.', 350),
  L('lm-murud', 'Murud-Janjira', 'Konkan', 18.2999, 72.9644, 'An island sea fort off the Konkan coast, reached by sail boat.', 500),
  L('lm-deekshabhoomi', 'Deekshabhoomi', 'Nagpur', 21.1287, 79.0656, 'A large stupa and grounds in Nagpur, a place of pilgrimage.', 220),
  L('lm-zero-mile', 'Zero Mile, Nagpur', 'Nagpur', 21.1497, 79.0806, 'A survey marker from the colonial Great Trigonometrical Survey near the centre of the country.', 120),
  L('lm-futala', 'Futala lake', 'Nagpur', 21.1550, 79.0470, 'A lake on the west of Nagpur with a lit promenade.', 300),
  L('lm-wilson-point', 'Wilson Point', 'Mahabaleshwar', 17.9310, 73.6720, 'The highest point of the Mahabaleshwar plateau, visited for sunrise.', 300),
  L('lm-venna', 'Venna lake', 'Mahabaleshwar', 17.9224, 73.6702, 'A hill-station lake with boats and horse rides along the shore.', 260),
  L('lm-pratapgad', 'Pratapgad fort', 'Mahabaleshwar', 17.9350, 73.5790, 'A 17th-century hill fort in the Sahyadri west of Mahabaleshwar.', 400),
];

/** A cinematic tour (heritage or scenic). Keyframe heights are metres above ground. */
export interface CinematicTour {
  id: string;
  name: string;
  region: RegionId;
  kind: 'heritage' | 'scenic';
  description: string;
  keyframes: TourKeyframe[];
  dataNote: string;
}

const K = (lat: number, lon: number, heightM: number, headingDeg: number, pitchDeg: number, durationS = 8): TourKeyframe => ({ lat, lon, heightM, headingDeg, pitchDeg, durationS });

export const CINEMATIC_TOURS: CinematicTour[] = [
  { id: 'tour-mumbai', name: 'Mumbai heritage', region: 'Mumbai', kind: 'heritage', description: 'Gateway, Fort district, CSMT and Marine Drive.', dataNote: APPROX_NOTE, keyframes: [K(18.9190, 72.8390, 260, 300, -28), K(18.9300, 72.8330, 320, 350, -32), K(18.9380, 72.8400, 300, 250, -30), K(18.9330, 72.8180, 380, 20, -26), K(18.9560, 72.8120, 420, 150, -30)] },
  { id: 'tour-pune', name: 'Pune heritage', region: 'Pune', kind: 'heritage', description: 'Shaniwar Wada, the old town and the Aga Khan Palace.', dataNote: APPROX_NOTE, keyframes: [K(18.5160, 73.8600, 280, 320, -30), K(18.5220, 73.8520, 260, 120, -32), K(18.5500, 73.8960, 300, 60, -30), K(18.5300, 73.8740, 340, 200, -28)] },
  { id: 'tour-kolhapur', name: 'Kolhapur heritage', region: 'Kolhapur', kind: 'heritage', description: 'Mahalaxmi lanes, Rankala lake, New Palace and Panhala.', dataNote: APPROX_NOTE, keyframes: [K(16.6920, 74.2280, 240, 300, -30), K(16.6880, 74.2180, 300, 340, -26), K(16.7100, 74.2350, 280, 30, -30), K(16.8050, 74.1150, 500, 320, -24)] },
  { id: 'tour-ajanta-ellora', name: 'Ajanta–Ellora', region: 'Ajanta–Ellora', kind: 'heritage', description: 'The Ellora cliff, Daulatabad and the Ajanta gorge.', dataNote: APPROX_NOTE, keyframes: [K(20.0230, 75.1830, 320, 300, -26, 10), K(19.9400, 75.2230, 500, 280, -28), K(20.5480, 75.7080, 420, 320, -28, 10), K(20.5560, 75.6980, 260, 140, -24)] },
  { id: 'tour-konkan', name: 'Konkan coast', region: 'Konkan', kind: 'heritage', description: 'Alibaug, Murud-Janjira, Ganpatipule and Sindhudurg.', dataNote: APPROX_NOTE, keyframes: [K(18.6400, 72.8650, 420, 250, -26), K(18.3000, 72.9700, 520, 260, -26, 10), K(17.1480, 73.2600, 380, 90, -26), K(16.0400, 73.4650, 520, 260, -26, 10)] },
  { id: 'tour-mahabaleshwar', name: 'Mahabaleshwar plateau', region: 'Mahabaleshwar', kind: 'scenic', description: 'Wilson Point, Venna lake, Arthur’s Seat and Pratapgad.', dataNote: APPROX_NOTE, keyframes: [K(17.9300, 73.6760, 380, 260, -24), K(17.9230, 73.6660, 260, 60, -30), K(17.9620, 73.6400, 600, 300, -22, 10), K(17.9320, 73.5850, 520, 280, -26)] },
  { id: 'tour-ghats', name: 'Bhor Ghat and Lonavala', region: 'Lonavala', kind: 'scenic', description: 'Rail and road climb through the Western Ghats.', dataNote: APPROX_NOTE, keyframes: [K(18.8600, 73.3500, 700, 120, -28, 10), K(18.7550, 73.4000, 500, 200, -26), K(18.7300, 73.3950, 420, 260, -28), K(18.7850, 73.4680, 360, 40, -28)] },
  { id: 'tour-konkan-coast-scenic', name: 'Konkan shoreline', region: 'Konkan', kind: 'scenic', description: 'Low flight along beaches, creeks and coconut groves.', dataNote: APPROX_NOTE, keyframes: [K(17.1300, 73.2580, 260, 350, -18), K(17.1600, 73.2660, 220, 10, -20), K(17.2000, 73.2700, 300, 20, -22), K(17.0300, 73.2900, 400, 200, -24, 10)] },
];

/** A checklist of things to notice along a journey; items tick when the player passes within `radiusM`. */
export interface JourneyChecklist {
  id: string;
  name: string;
  kind: 'rail' | 'road';
  description: string;
  items: { id: string; label: string; lat: number; lon: number; radiusM: number }[];
  dataNote: string;
}

const C = (id: string, label: string, lat: number, lon: number, radiusM = 1500) => ({ id, label, lat, lon, radiusM });

export const JOURNEY_CHECKLISTS: JourneyChecklist[] = [
  { id: 'rail-mumbai-pune', name: 'Mumbai–Pune by rail', kind: 'rail', description: 'Suburbs, creek, ghats and the Deccan plateau.', dataNote: APPROX_NOTE, items: [C('csmt', 'Depart from CSMT', 18.9398, 72.8355, 600), C('dadar', 'Pass Dadar', 19.0176, 72.8433), C('thane', 'Cross Thane creek', 19.1860, 72.9757, 2500), C('kalyan', 'Kalyan junction', 19.2350, 73.1300), C('karjat', 'Karjat — foot of the ghat', 18.9100, 73.3230, 2000), C('lonavala', 'Lonavala hill station', 18.7546, 73.4062, 2000), C('pune', 'Arrive at Pune Junction', 18.5285, 73.8743, 800)] },
  { id: 'road-konkan', name: 'Mumbai–Goa road trip (NH66)', kind: 'road', description: 'Creeks, ghats and beaches along the Konkan coast.', dataNote: APPROX_NOTE, items: [C('panvel', 'Panvel', 18.9894, 73.1175, 2500), C('mahad', 'Mahad', 18.0830, 73.4170, 2500), C('chiplun', 'Chiplun on the Vashishti', 17.5320, 73.5150, 2500), C('ratnagiri', 'Ratnagiri', 16.9902, 73.3120, 3000), C('kankavli', 'Kankavli', 16.2660, 73.7120, 2500), C('sawantwadi', 'Sawantwadi', 15.9040, 73.8220, 2500)] },
  { id: 'road-kolhapur-mahabaleshwar', name: 'Kolhapur–Mahabaleshwar drive', kind: 'road', description: 'Sugar-cane plains, Satara and the climb to the plateau.', dataNote: APPROX_NOTE, items: [C('kolhapur', 'Leave Kolhapur', 16.7050, 74.2340, 2500), C('karad', 'Karad', 17.2890, 74.1810, 3000), C('satara', 'Satara', 17.6805, 74.0183, 3000), C('wai', 'Wai on the Krishna', 17.9520, 73.8900, 2500), C('panchgani', 'Panchgani tableland', 17.9240, 73.8000, 2500), C('mahabaleshwar', 'Mahabaleshwar', 17.9237, 73.6586, 2000)] },
];

/** Boat checkpoint course: checkpoints count in any mode when passed within `radiusM` in order. */
export interface BoatCourse {
  id: string;
  name: string;
  region: RegionId;
  checkpoints: { id: string; label: string; lat: number; lon: number; radiusM: number }[];
  dataNote: string;
}

export const BOAT_COURSES: BoatCourse[] = [
  { id: 'boat-harbour', name: 'Harbour crossing to Elephanta', region: 'Mumbai', dataNote: APPROX_NOTE, checkpoints: [C('jetty', 'Leave the Gateway jetty', 18.9215, 72.8365, 250), C('mid', 'Mid-harbour buoy (fictional)', 18.9450, 72.8700, 500), C('elephanta', 'Elephanta island jetty', 18.9633, 72.9315, 400)] },
  { id: 'boat-konkan', name: 'Ganpatipule shoreline run', region: 'Konkan', dataNote: APPROX_NOTE, checkpoints: [C('start', 'Beach launch', 17.1440, 73.2620, 250), C('north', 'North headland buoy (fictional)', 17.1650, 73.2600, 400), C('south', 'South cove buoy (fictional)', 17.1250, 73.2620, 400), C('finish', 'Back to the beach', 17.1440, 73.2620, 250)] },
];

/** Museum with fictional, educational exhibits shown as info overlays. */
export interface MuseumSpot extends GeoPoint {
  id: string;
  name: string;
  region: RegionId;
  radiusM: number;
  exhibits: { id: string; title: string; text: string }[];
  dataNote: string;
}

const MUSEUM_NOTE = 'Approximate position. Exhibits are fictional, generic educational text — the real museum’s collection is not reproduced.';

export const MUSEUMS: MuseumSpot[] = [
  { id: 'museum-mumbai', name: 'City museum, Fort district', region: 'Mumbai', lat: 18.9269, lon: 72.8326, radiusM: 140, dataNote: MUSEUM_NOTE, exhibits: [
    { id: 'textiles', title: 'Textiles of the Deccan', text: 'Hand-woven silks with metallic-thread borders were traded from weaving towns across the region; motifs include peacocks, lotus and vines.' },
    { id: 'harbour', title: 'The harbour city', text: 'Seven islands were joined by reclamation over two centuries into a single peninsula whose docks made it a trading gateway.' },
    { id: 'monsoon', title: 'Monsoon on the coast', text: 'From June to September the south-west monsoon brings most of the year’s rain; the Western Ghats catch the moisture and turn green.' },
  ] },
  { id: 'museum-pune', name: 'Everyday-objects museum, old town', region: 'Pune', lat: 18.5104, lon: 73.8544, radiusM: 120, dataNote: MUSEUM_NOTE, exhibits: [
    { id: 'lamps', title: 'Oil lamps', text: 'Brass and clay lamps of many shapes lit homes and temples; some were made for festivals, others for daily use.' },
    { id: 'doors', title: 'Carved doorways', text: 'Wooden door frames from old houses carry carved borders and small guardian figures.' },
    { id: 'music', title: 'Musical instruments', text: 'Stringed, wind and percussion instruments used in folk and classical music of the region.' },
  ] },
  { id: 'museum-kolhapur', name: 'Palace museum', region: 'Kolhapur', lat: 16.7134, lon: 74.2381, radiusM: 160, dataNote: MUSEUM_NOTE, exhibits: [
    { id: 'wrestling', title: 'Wrestling tradition', text: 'Traditional earthen-pit wrestling has long been practised in the city, with training grounds called talims.' },
    { id: 'footwear', title: 'Leather footwear', text: 'Hand-stitched leather sandals made in the region are known for their braided straps.' },
    { id: 'gardens', title: 'Palace gardens', text: 'The palace stands in a garden with a small lake that attracts water birds.' },
  ] },
  { id: 'museum-nagpur', name: 'Regional museum', region: 'Nagpur', lat: 21.1450, lon: 79.0800, radiusM: 140, dataNote: MUSEUM_NOTE, exhibits: [
    { id: 'oranges', title: 'Orange orchards', text: 'The city is known for its oranges, grown in orchards on the surrounding plateau and harvested in winter.' },
    { id: 'forests', title: 'Central forests', text: 'Teak and bamboo forests to the east are home to deer, wild boar and, in reserves, tigers.' },
    { id: 'zero', title: 'The centre point', text: 'A survey pillar in the city marked a reference point for colonial-era distance measurement.' },
  ] },
];

/** Parks with litter to collect (fictional objects, deterministic placement). */
export interface CleanupPark extends GeoPoint {
  id: string;
  name: string;
  region: RegionId;
  radiusM: number;
  litterCount: number;
  dataNote: string;
}

export const CLEANUP_PARKS: CleanupPark[] = [
  { id: 'cleanup-marine-drive', name: 'Marine Drive promenade', region: 'Mumbai', lat: 18.9432, lon: 72.8236, radiusM: 60, litterCount: 10, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
  { id: 'cleanup-shivaji-park', name: 'Shivaji Park', region: 'Mumbai', lat: 19.0280, lon: 72.8380, radiusM: 90, litterCount: 12, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
  { id: 'cleanup-campus', name: 'Campus lawn', region: 'Kolhapur', lat: 16.7330, lon: 74.4008, radiusM: 50, litterCount: 8, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
  { id: 'cleanup-rankala', name: 'Rankala lake front', region: 'Kolhapur', lat: 16.6910, lon: 74.2135, radiusM: 80, litterCount: 10, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
  { id: 'cleanup-futala', name: 'Futala lake front', region: 'Nagpur', lat: 21.1550, lon: 79.0470, radiusM: 80, litterCount: 10, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
  { id: 'cleanup-ganpatipule', name: 'Ganpatipule beach', region: 'Konkan', lat: 17.1461, lon: 73.2653, radiusM: 90, litterCount: 12, dataNote: `${APPROX_NOTE} ${PROCEDURAL_NOTE}` },
];

/** The campus basketball court (procedural; placed ~60 m north-east of the campus spawn). */
export interface BasketballCourt extends GeoPoint {
  id: string;
  name: string;
  /** Court orientation (degrees, direction from the free-throw spot to the hoop). */
  headingDeg: number;
  /** Hoop position relative to the court centre along `headingDeg`, metres. */
  hoopOffsetM: number;
  dataNote: string;
}

export const BASKETBALL_COURT: BasketballCourt = { id: 'court-campus', name: 'Campus basketball court', lat: 16.7340, lon: 74.4020, headingDeg: 20, hoopOffsetM: 12, dataNote: `${PROCEDURAL_NOTE} Position approximate.` };

/** Regions and the ambient soundscape kind used for each. */
export type AmbienceKind = 'city' | 'village' | 'forest' | 'station' | 'coast' | 'hills';

export const REGIONS: RegionId[] = ['Mumbai', 'Pune', 'Kolhapur', 'Ajanta–Ellora', 'Konkan', 'Nagpur', 'Mahabaleshwar', 'Lonavala'];
