/**
 * Showcase presets: 19 curated areas used for demos, QA and e2e checks. Each
 * extends a {@link Bookmark} with the biome the classifier is expected to
 * report, a walking-mode start point and a short guided camera tour.
 *
 * DATA NOTE — all coordinates are APPROXIMATE (written from memory of
 * well-known published values and rounded; ground spots and tour waypoints
 * are within a few hundred metres of the intended spot). Nothing here is
 * measured by this project; the app labels these values as "inferred".
 */
import { defineBookmark, type BookmarkSeed } from './defaults';
import type { ShowcaseArea, TourWaypoint } from './types';

interface ShowcaseSeed extends BookmarkSeed {
  expectedBiome: string;
  groundSpot: { lat: number; lon: number };
  tourPath?: TourWaypoint[];
}

/** Compact tour waypoint constructor: lat, lon, height (m), heading (°), pitch (°), duration (s). */
function wp(lat: number, lon: number, heightM: number, headingDeg: number, pitchDeg: number, durationS: number): TourWaypoint {
  return { lat, lon, heightM, headingDeg, pitchDeg, durationS };
}

function defineShowcase(seed: ShowcaseSeed): ShowcaseArea {
  const { expectedBiome, groundSpot, tourPath, ...bookmarkSeed } = seed;
  const area: ShowcaseArea = { ...defineBookmark(bookmarkSeed), expectedBiome, groundSpot: { ...groundSpot } };
  if (tourPath) area.tourPath = tourPath.map((w) => ({ ...w }));
  return area;
}

/** The 19 showcase areas, in presentation order. */
export const SHOWCASE_AREAS: ShowcaseArea[] = [
  defineShowcase({
    id: 'showcase-new-york', name: 'New York — Manhattan & Central Park', category: 'city', continent: 'North America', country: 'United States',
    lat: 40.7580, lon: -73.9855, camera: { heightM: 2500, headingDeg: 20, pitchDeg: -35 },
    description: 'Midtown Manhattan’s skyscraper grid, the Statue of Liberty and the green rectangle of Central Park.',
    tags: ['nyc', 'manhattan', 'central park', 'new york'], expectedBiome: 'urban-temperate',
    groundSpot: { lat: 40.7729, lon: -73.9734 }, // The Mall, Central Park (approx)
    tourPath: [
      wp(40.6892, -74.0445, 800, 30, -30, 8), // Statue of Liberty
      wp(40.7075, -74.0113, 1500, 0, -35, 8), // Lower Manhattan
      wp(40.7484, -73.9857, 900, 45, -30, 8), // Empire State Building
      wp(40.7812, -73.9665, 1800, 0, -45, 10), // Central Park
    ],
  }),
  defineShowcase({
    id: 'showcase-mumbai', name: 'Mumbai', category: 'city', continent: 'Asia', country: 'India',
    lat: 19.0760, lon: 72.8777, camera: { heightM: 4000, headingDeg: 200, pitchDeg: -35 },
    description: 'India’s largest city: a dense peninsula of towers, chawls and mills between Back Bay and the harbour.',
    tags: ['bombay', 'india', 'maharashtra'], expectedBiome: 'urban-tropical-monsoon',
    groundSpot: { lat: 18.9440, lon: 72.8230 }, // Marine Drive promenade (approx)
    tourPath: [
      wp(18.9220, 72.8347, 700, 90, -30, 8), // Gateway of India
      wp(18.9440, 72.8230, 1500, 20, -35, 8), // Marine Drive
      wp(19.0380, 72.8170, 1200, 0, -30, 8), // Bandra–Worli Sea Link (approx)
      wp(19.0430, 72.8570, 1500, 0, -40, 8), // Dharavi (approx)
    ],
  }),
  defineShowcase({
    id: 'showcase-punjab-farmland', name: 'Rural farmland near Ludhiana, Punjab', category: 'rural', continent: 'Asia', country: 'India',
    lat: 30.8500, lon: 75.7000, camera: { heightM: 2500, headingDeg: 0, pitchDeg: -35 }, // approx: fields between Ludhiana and Jagraon
    description: 'Flat, canal-irrigated wheat and rice fields dotted with villages on the Punjab plain west of Ludhiana.',
    dataNote: 'Terrain and rivers are measured; field patterns, crops, canals and villages are procedural unless OpenStreetMap detail is available online.',
    tags: ['punjab', 'india', 'farmland', 'village', 'ludhiana'], expectedBiome: 'cropland-irrigated-subtropical',
    groundSpot: { lat: 30.8500, lon: 75.7000 },
    tourPath: [
      wp(30.9300, 75.8700, 4000, 250, -35, 8), // Ludhiana city edge
      wp(30.8500, 75.7000, 2000, 270, -35, 10), // fields
      wp(30.8000, 75.6000, 1200, 300, -30, 8), // village (approx)
    ],
  }),
  defineShowcase({
    id: 'showcase-everest', name: 'Himalayas — Everest region', category: 'mountain', continent: 'Asia', country: 'Nepal',
    lat: 27.9881, lon: 86.9250, camera: { heightM: 12000, headingDeg: 340, pitchDeg: -30 },
    description: 'The Khumbu: Everest, Lhotse and Nuptse above the Khumbu glacier and the Sherpa villages of Namche and Gorak Shep.',
    tags: ['everest', 'himalaya', 'himalayas', 'khumbu', 'nepal'], expectedBiome: 'alpine-glacial',
    groundSpot: { lat: 28.0026, lon: 86.8528 }, // Everest Base Camp, south side (approx)
    tourPath: [
      wp(27.8069, 86.7140, 6000, 20, -30, 8), // Namche Bazaar (approx)
      wp(28.0026, 86.8528, 7000, 60, -30, 8), // Base Camp
      wp(27.9881, 86.9250, 15000, 340, -35, 12), // summit
    ],
  }),
  defineShowcase({
    id: 'showcase-antarctica', name: 'Antarctica — South Pole & Ross Ice Shelf', category: 'polar', continent: 'Antarctica',
    lat: -90.0, lon: 0.0, camera: { heightM: 60000, headingDeg: 0, pitchDeg: -45 },
    description: 'From the Amundsen–Scott station on the polar plateau across the Transantarctic Mountains to the Ross Ice Shelf and McMurdo.',
    tags: ['south pole', 'ross ice shelf', 'mcmurdo', 'antarctica', 'amundsen scott'], expectedBiome: 'polar-ice-sheet',
    groundSpot: { lat: -89.9975, lon: 139.2728 }, // Amundsen–Scott station (approx)
    tourPath: [
      wp(-89.9975, 139.2728, 3000, 0, -35, 8), // South Pole station
      wp(-81.5000, -175.0000, 80000, 0, -50, 12), // Ross Ice Shelf (approx)
      wp(-77.8460, 166.6680, 15000, 180, -35, 10), // McMurdo Station
    ],
  }),
  defineShowcase({
    id: 'showcase-amazon', name: 'Amazon rainforest near Manaus', category: 'nature', continent: 'South America', country: 'Brazil',
    lat: -2.6000, lon: -60.2000, camera: { heightM: 12000, headingDeg: 0, pitchDeg: -35 }, // approx
    description: 'Unbroken lowland rainforest canopy north of Manaus, and the Meeting of Waters where the Rio Negro joins the Solimões.',
    tags: ['amazon', 'amazonia', 'rainforest', 'manaus', 'brazil'], expectedBiome: 'tropical-rainforest',
    groundSpot: { lat: -2.6000, lon: -60.2000 },
    tourPath: [
      wp(-3.1190, -60.0217, 4000, 0, -35, 8), // Manaus
      wp(-3.1400, -59.9000, 6000, 90, -40, 8), // Meeting of Waters (approx)
      wp(-2.6000, -60.2000, 8000, 0, -35, 10), // canopy
    ],
  }),
  defineShowcase({
    id: 'showcase-sahara', name: 'Sahara — Erg Chebbi', category: 'desert', continent: 'Africa', country: 'Morocco',
    lat: 31.1500, lon: -3.9800, camera: { heightM: 6000, headingDeg: 45, pitchDeg: -35 }, // approx
    description: 'Wind-sculpted Saharan dunes up to 150 m high rising abruptly from the stony hamada near Merzouga.',
    tags: ['sahara', 'erg chebbi', 'merzouga', 'dunes', 'morocco'], expectedBiome: 'hot-desert-sand',
    groundSpot: { lat: 31.1300, lon: -4.0000 }, // dune edge near Merzouga (approx)
    tourPath: [
      wp(31.1000, -4.0100, 3000, 90, -30, 8), // Merzouga village (approx)
      wp(31.1500, -3.9800, 1500, 45, -25, 10), // dunes
      wp(31.2000, -3.9500, 8000, 0, -45, 8),
    ],
  }),
  defineShowcase({
    id: 'showcase-alps', name: 'Alps — Zermatt & the Matterhorn', category: 'mountain', continent: 'Europe', country: 'Switzerland',
    lat: 46.0207, lon: 7.7491, camera: { heightM: 5000, headingDeg: 200, pitchDeg: -25 },
    description: 'The car-free village of Zermatt beneath the Matterhorn’s pyramid, with glaciers, larch forest and alpine meadows.',
    tags: ['alps', 'matterhorn', 'zermatt', 'switzerland'], expectedBiome: 'alpine',
    groundSpot: { lat: 46.0207, lon: 7.7491 }, // Zermatt village centre
    tourPath: [
      wp(46.0207, 7.7491, 3000, 200, -30, 8), // Zermatt
      wp(45.9836, 7.7847, 5000, 250, -25, 8), // Gornergrat (approx)
      wp(45.9766, 7.6585, 8000, 200, -25, 12), // Matterhorn
    ],
  }),
  defineShowcase({
    id: 'showcase-tokyo', name: 'Tokyo', category: 'city', continent: 'Asia', country: 'Japan',
    lat: 35.6762, lon: 139.6503, camera: { heightM: 3500, headingDeg: 0, pitchDeg: -35 },
    description: 'The world’s largest metropolis: Shibuya, Shinjuku, the Imperial Palace and Tokyo Bay.',
    tags: ['japan', 'shibuya', 'shinjuku'], expectedBiome: 'urban-humid-subtropical',
    groundSpot: { lat: 35.6595, lon: 139.7005 }, // Shibuya Crossing
    tourPath: [
      wp(35.6586, 139.7454, 900, 300, -30, 8), // Tokyo Tower
      wp(35.6595, 139.7005, 1200, 0, -35, 8), // Shibuya
      wp(35.6896, 139.6917, 1500, 0, -35, 8), // Shinjuku
      wp(35.7148, 139.7967, 900, 0, -30, 8), // Sensō-ji, Asakusa
    ],
  }),
  defineShowcase({
    id: 'showcase-london', name: 'London', category: 'city', continent: 'Europe', country: 'United Kingdom',
    lat: 51.5074, lon: -0.1278, camera: { heightM: 3000, headingDeg: 90, pitchDeg: -35 },
    description: 'The Thames from Westminster past St Paul’s and the City to Tower Bridge.',
    tags: ['uk', 'england', 'thames', 'westminster'], expectedBiome: 'urban-oceanic',
    groundSpot: { lat: 51.5008, lon: -0.1218 }, // Westminster Bridge
    tourPath: [
      wp(51.5007, -0.1246, 800, 60, -30, 8), // Big Ben
      wp(51.5014, -0.1419, 900, 0, -30, 8), // Buckingham Palace
      wp(51.5138, -0.0984, 900, 90, -30, 8), // St Paul's
      wp(51.5055, -0.0754, 800, 200, -30, 8), // Tower Bridge
    ],
  }),
  defineShowcase({
    id: 'showcase-paris', name: 'Paris', category: 'city', continent: 'Europe', country: 'France',
    lat: 48.8566, lon: 2.3522, camera: { heightM: 3000, headingDeg: 300, pitchDeg: -35 },
    description: 'Haussmann boulevards, the Seine and its islands, the Eiffel Tower and the Louvre.',
    tags: ['france', 'seine', 'eiffel'], expectedBiome: 'urban-oceanic',
    groundSpot: { lat: 48.8620, lon: 2.2880 }, // Trocadéro esplanade (approx)
    tourPath: [
      wp(48.8584, 2.2945, 700, 30, -30, 8), // Eiffel Tower
      wp(48.8738, 2.2950, 700, 120, -30, 8), // Arc de Triomphe
      wp(48.8606, 2.3376, 900, 90, -30, 8), // Louvre
      wp(48.8530, 2.3499, 700, 270, -30, 8), // Notre-Dame
    ],
  }),
  defineShowcase({
    id: 'showcase-dubai', name: 'Dubai', category: 'city', continent: 'Asia', country: 'United Arab Emirates',
    lat: 25.2048, lon: 55.2708, camera: { heightM: 4000, headingDeg: 315, pitchDeg: -35 },
    description: 'Desert coast city of super-tall towers, artificial islands and the old creek.',
    tags: ['uae', 'burj khalifa', 'palm jumeirah'], expectedBiome: 'urban-hot-desert',
    groundSpot: { lat: 25.1950, lon: 55.2790 }, // Dubai Fountain promenade (approx)
    tourPath: [
      wp(25.1972, 55.2744, 900, 315, -30, 8), // Burj Khalifa
      wp(25.1412, 55.1853, 800, 270, -30, 8), // Burj Al Arab
      wp(25.1124, 55.1390, 4000, 0, -40, 10), // Palm Jumeirah
    ],
  }),
  defineShowcase({
    id: 'showcase-cape-town', name: 'Cape Town', category: 'city', continent: 'Africa', country: 'South Africa',
    lat: -33.9249, lon: 18.4241, camera: { heightM: 4000, headingDeg: 180, pitchDeg: -35 },
    description: 'City bowl beneath Table Mountain, the Atlantic seaboard and the Cape Peninsula.',
    tags: ['south africa', 'table mountain'], expectedBiome: 'urban-mediterranean',
    groundSpot: { lat: -33.9036, lon: 18.4208 }, // V&A Waterfront (approx)
    tourPath: [
      wp(-33.9036, 18.4208, 1500, 180, -35, 8), // Waterfront
      wp(-33.9628, 18.4098, 5000, 180, -30, 8), // Table Mountain
      wp(-33.9510, 18.3775, 1500, 90, -30, 8), // Camps Bay (approx)
      wp(-34.3568, 18.4740, 4000, 180, -30, 10), // Cape of Good Hope
    ],
  }),
  defineShowcase({
    id: 'showcase-sydney', name: 'Sydney', category: 'city', continent: 'Oceania', country: 'Australia',
    lat: -33.8688, lon: 151.2093, camera: { heightM: 3500, headingDeg: 0, pitchDeg: -35 },
    description: 'Harbour city of sandstone headlands, the Opera House, the Harbour Bridge and Bondi Beach.',
    tags: ['australia', 'nsw', 'opera house'], expectedBiome: 'urban-humid-subtropical',
    groundSpot: { lat: -33.8610, lon: 151.2107 }, // Circular Quay (approx)
    tourPath: [
      wp(-33.8568, 151.2153, 700, 300, -30, 8), // Opera House
      wp(-33.8523, 151.2108, 900, 180, -30, 8), // Harbour Bridge
      wp(-33.8908, 151.2743, 1200, 90, -30, 8), // Bondi
    ],
  }),
  defineShowcase({
    id: 'showcase-singapore', name: 'Singapore', category: 'city', continent: 'Asia', country: 'Singapore',
    lat: 1.2868, lon: 103.8545, camera: { heightM: 2500, headingDeg: 45, pitchDeg: -35 },
    description: 'Equatorial city-state around Marina Bay: towers, gardens, the port and Sentosa.',
    tags: ['marina bay', 'sentosa'], expectedBiome: 'urban-tropical',
    groundSpot: { lat: 1.2834, lon: 103.8607 }, // Marina Bay promenade
    tourPath: [
      wp(1.2834, 103.8607, 1200, 45, -35, 8), // Marina Bay
      wp(1.2816, 103.8636, 700, 0, -30, 8), // Gardens by the Bay
      wp(1.2494, 103.8303, 2500, 180, -35, 8), // Sentosa
    ],
  }),
  defineShowcase({
    id: 'showcase-sao-paulo', name: 'São Paulo', category: 'city', continent: 'South America', country: 'Brazil',
    lat: -23.5505, lon: -46.6333, camera: { heightM: 4000, headingDeg: 0, pitchDeg: -35 },
    description: 'The largest city in the Americas: an endless skyline from Avenida Paulista to Ibirapuera.',
    tags: ['brazil', 'sampa', 'paulista'], expectedBiome: 'urban-humid-subtropical',
    groundSpot: { lat: -23.5614, lon: -46.6559 }, // Avenida Paulista (approx)
    tourPath: [
      wp(-23.5511, -46.6336, 1200, 0, -35, 8), // Sé Cathedral (approx)
      wp(-23.5614, -46.6559, 1000, 300, -30, 8), // Paulista
      wp(-23.5874, -46.6576, 1800, 0, -40, 8), // Ibirapuera Park
    ],
  }),
  defineShowcase({
    id: 'showcase-grand-canyon', name: 'Grand Canyon', category: 'nature', continent: 'North America', country: 'United States',
    lat: 36.0619, lon: -112.1076, camera: { heightM: 6000, headingDeg: 0, pitchDeg: -30 },
    description: 'Mile-deep layered gorge of the Colorado River seen from the South Rim.',
    tags: ['arizona', 'colorado river', 'south rim'], expectedBiome: 'arid-canyon',
    groundSpot: { lat: 36.0619, lon: -112.1076 }, // Mather Point
    tourPath: [
      wp(36.0440, -111.8262, 5000, 300, -30, 8), // Desert View (approx)
      wp(36.0619, -112.1076, 4000, 0, -30, 8), // Mather Point
      wp(36.1050, -112.0950, 3000, 0, -45, 8), // Phantom Ranch / inner gorge (approx)
      wp(36.0575, -112.1440, 6000, 20, -30, 8), // Bright Angel (approx)
    ],
  }),
  defineShowcase({
    id: 'showcase-tristan-da-cunha', name: 'Tristan da Cunha', category: 'island', continent: 'Ocean', country: 'United Kingdom',
    lat: -37.1052, lon: -12.2777, camera: { heightM: 12000, headingDeg: 0, pitchDeg: -35 },
    description: 'The most remote inhabited island: a 2,000 m volcanic cone in the South Atlantic with one village.',
    tags: ['south atlantic', 'edinburgh of the seven seas', 'remote island'], expectedBiome: 'oceanic-island-grassland',
    groundSpot: { lat: -37.0675, lon: -12.3105 }, // Edinburgh of the Seven Seas (approx)
    tourPath: [
      wp(-37.1052, -12.2777, 20000, 0, -45, 8), // island overview
      wp(-37.0675, -12.3105, 1500, 160, -30, 8), // settlement
      wp(-37.0925, -12.2865, 4000, 180, -30, 8), // Queen Mary's Peak (approx)
    ],
  }),
  defineShowcase({
    id: 'showcase-great-ocean-road', name: 'Great Ocean Road — Twelve Apostles', category: 'ocean', continent: 'Oceania', country: 'Australia',
    lat: -38.6662, lon: 143.1044, camera: { heightM: 2500, headingDeg: 250, pitchDeg: -30 },
    description: 'Limestone sea stacks, cliffs and surf along Victoria’s Shipwreck Coast.',
    tags: ['great ocean road', 'twelve apostles', 'victoria', 'australia', 'coast'], expectedBiome: 'coastal-cliffs',
    groundSpot: { lat: -38.6650, lon: 143.1040 }, // clifftop viewing platform (approx)
    tourPath: [
      wp(-38.6662, 143.1044, 1500, 250, -30, 8), // Twelve Apostles
      wp(-38.6480, 143.0670, 1200, 200, -30, 8), // Loch Ard Gorge (approx)
      wp(-38.6320, 143.0080, 1200, 220, -30, 8), // London Arch (approx)
      wp(-38.8570, 143.5130, 4000, 180, -35, 8), // Cape Otway
    ],
  }),
];
