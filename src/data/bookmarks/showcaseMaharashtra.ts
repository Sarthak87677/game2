/**
 * Five Maharashtra showcase areas with guided tours: Mumbai waterfront, Pune old city, Kolhapur, the Konkan coast and
 * the Western Ghats. Appended to `SHOWCASE_AREAS`.
 *
 * DATA NOTE — all coordinates are APPROXIMATE public reference values written from memory (a few hundred metres).
 * Nothing is surveyed by this project; landmark bodies seen on the tours are procedural stand-ins.
 */
import { defineBookmark, type BookmarkSeed } from './defaults';
import type { ShowcaseArea, TourWaypoint } from './types';

interface ShowcaseSeed extends BookmarkSeed { expectedBiome: string; groundSpot: { lat: number; lon: number }; tourPath: TourWaypoint[] }

function wp(lat: number, lon: number, heightM: number, headingDeg: number, pitchDeg: number, durationS: number): TourWaypoint {
  return { lat, lon, heightM, headingDeg, pitchDeg, durationS };
}

function defineShowcase(seed: ShowcaseSeed): ShowcaseArea {
  const { expectedBiome, groundSpot, tourPath, ...bookmarkSeed } = seed;
  return { ...defineBookmark(bookmarkSeed), expectedBiome, groundSpot: { ...groundSpot }, tourPath: tourPath.map((w) => ({ ...w })) };
}

const NOTE = 'Terrain and coastlines are measured; buildings come from OpenStreetMap when online, otherwise procedural; landmark bodies are procedural stand-ins and climate is inferred.';

export const MAHARASHTRA_SHOWCASE_AREAS: ShowcaseArea[] = [
  defineShowcase({
    id: 'showcase-maharashtra-mumbai-waterfront', name: 'Mumbai waterfront — Gateway to Sea Link', category: 'city', continent: 'Asia', country: 'India',
    lat: 18.9400, lon: 72.8300, camera: { heightM: 2500, headingDeg: 340, pitchDeg: -35 },
    description: 'From the Gateway of India past CSMT and Marine Drive to Haji Ali and the Bandra–Worli Sea Link.',
    tags: ['mumbai', 'gateway of india', 'csmt', 'marine drive', 'sea link', 'maharashtra'], expectedBiome: 'urban-tropical-monsoon', dataNote: NOTE,
    groundSpot: { lat: 18.9218, lon: 72.8340 }, // Apollo Bunder (approx)
    tourPath: [
      wp(18.9190, 72.8347, 220, 0, -20, 8), // Gateway of India from the harbour side
      wp(18.9360, 72.8355, 300, 0, -25, 8), // CSMT
      wp(18.9380, 72.8215, 500, 340, -25, 8), // Marine Drive from the south
      wp(18.9790, 72.8090, 400, 0, -25, 8), // Haji Ali
      wp(19.0250, 72.8170, 700, 20, -25, 10), // Bandra–Worli Sea Link
    ],
  }),
  defineShowcase({
    id: 'showcase-maharashtra-pune-old-city', name: 'Pune old city — Shaniwar Wada and the Peths', category: 'city', continent: 'Asia', country: 'India',
    lat: 18.5195, lon: 73.8553, camera: { heightM: 1800, headingDeg: 0, pitchDeg: -35 },
    description: 'The Peshwa fort, Lal Mahal and the market peths, with Parvati Hill and Sinhagad on the skyline.',
    tags: ['pune', 'shaniwar wada', 'peth', 'peshwa', 'maharashtra'], expectedBiome: 'urban-tropical-savanna', dataNote: NOTE,
    groundSpot: { lat: 18.5195, lon: 73.8553 }, // Delhi Gate (approx)
    tourPath: [
      wp(18.5170, 73.8553, 260, 0, -25, 8), // Shaniwar Wada
      wp(18.5164, 73.8561, 220, 90, -25, 6), // Dagdusheth temple lane
      wp(18.4970, 73.8460, 500, 0, -30, 8), // Parvati Hill
      wp(18.3663, 73.7559, 1200, 300, -25, 10), // Sinhagad
    ],
  }),
  defineShowcase({
    id: 'showcase-maharashtra-kolhapur', name: 'Kolhapur — Mahalaxmi temple to Panhala', category: 'city', continent: 'Asia', country: 'India',
    lat: 16.7050, lon: 74.2433, camera: { heightM: 2000, headingDeg: 300, pitchDeg: -35 },
    description: 'Old-town lanes around the Mahalaxmi temple, Rankala lake, the New Palace and the Panhala hill fort.',
    tags: ['kolhapur', 'mahalaxmi', 'rankala', 'panhala', 'sgis', 'maharashtra'], expectedBiome: 'urban-tropical-savanna', dataNote: NOTE,
    groundSpot: { lat: 16.6950, lon: 74.2246 }, // temple lanes (approx)
    tourPath: [
      wp(16.6930, 74.2246, 250, 0, -25, 8), // Mahalaxmi temple
      wp(16.6900, 74.2170, 500, 270, -30, 8), // Rankala lake
      wp(16.7150, 74.2380, 350, 0, -25, 6), // New Palace
      wp(16.7335, 74.4015, 400, 20, -30, 8), // SGIS-inspired campus, Atigre
      wp(16.8120, 74.1100, 1200, 320, -30, 10), // Panhala
    ],
  }),
  defineShowcase({
    id: 'showcase-maharashtra-konkan-coast', name: 'Konkan coast — Ganpatipule to Sindhudurg', category: 'nature', continent: 'Asia', country: 'India',
    lat: 16.6000, lon: 73.3500, camera: { heightM: 12000, headingDeg: 180, pitchDeg: -40 },
    description: 'Beaches, sea forts and headlands of the Konkan from Ganpatipule south to the island fort of Sindhudurg.',
    tags: ['konkan', 'ganpatipule', 'ratnagiri', 'malvan', 'sindhudurg', 'beach', 'maharashtra'], expectedBiome: 'tropical-coast', dataNote: NOTE,
    groundSpot: { lat: 17.1461, lon: 73.2653 }, // Ganpatipule beach (approx)
    tourPath: [
      wp(17.1480, 73.2650, 600, 250, -30, 8), // Ganpatipule
      wp(17.2930, 73.2220, 800, 200, -30, 8), // Jaigad
      wp(16.9902, 73.3120, 2000, 250, -35, 8), // Ratnagiri
      wp(16.0500, 73.4650, 900, 250, -30, 10), // Sindhudurg fort
    ],
  }),
  defineShowcase({
    id: 'showcase-maharashtra-western-ghats', name: 'Western Ghats — Mahabaleshwar, Kaas and Koyna', category: 'mountain', continent: 'Asia', country: 'India',
    lat: 17.9237, lon: 73.6586, camera: { heightM: 8000, headingDeg: 200, pitchDeg: -35 },
    description: 'The Sahyadri crest from Pratapgad and Mahabaleshwar over the Kaas flower plateau to the Koyna reservoir.',
    tags: ['western ghats', 'sahyadri', 'mahabaleshwar', 'kaas', 'koyna', 'pratapgad', 'maharashtra'], expectedBiome: 'tropical-montane-forest', dataNote: NOTE,
    groundSpot: { lat: 17.9237, lon: 73.6586 }, // Mahabaleshwar plateau (approx)
    tourPath: [
      wp(17.9367, 73.5793, 1500, 90, -30, 8), // Pratapgad
      wp(17.9237, 73.6586, 2500, 200, -35, 8), // Mahabaleshwar
      wp(17.7200, 73.8225, 1500, 180, -35, 8), // Kaas plateau
      wp(17.4017, 73.7500, 3000, 200, -35, 10), // Koyna dam
    ],
  }),
];
