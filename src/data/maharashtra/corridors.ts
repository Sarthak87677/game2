import type { GeoPoint, RailCorridor } from './types';

/**
 * Rail corridors followed by the journeys track. Paths are ordered polylines with intermediate shape points so that
 * trains follow valleys and creeks rather than straight lines; the rail system samples terrain along them and lifts
 * the track to the ground at run time (the Bhor and Thal ghat sections are additionally speed-limited).
 *
 * DATA NOTE — every point is written from public reference values and is APPROXIMATE (typically ±300 m, up to ±1 km
 * on rural stretches). The alignments are simplified interpretations, not surveyed track geometry.
 */
export const CORRIDORS_DATA_NOTE = 'Track alignments are approximate, simplified interpretations of the real corridors (±300 m–1 km) and are lifted to the game terrain; speed limits and signals are simulated.';

const p = (lat: number, lon: number): GeoPoint => ({ lat, lon });

// Shared Central-line stretch CSMT → Karjat (also used by the intercity and north-east corridors up to Kalyan).
const CSMT_TO_KALYAN: GeoPoint[] = [
  p(18.9398, 72.8355), p(18.948, 72.838), p(18.958, 72.838), p(18.977, 72.833), p(18.986, 72.833), p(18.995, 72.834), p(19.008, 72.838),
  p(19.0186, 72.8438), p(19.027, 72.85), p(19.04, 72.862), p(19.0656, 72.879), p(19.077, 72.897), p(19.086, 72.9085), p(19.108, 72.927),
  p(19.142, 72.937), p(19.172, 72.956), p(19.186, 72.9755), p(19.196, 72.999), p(19.187, 73.021), p(19.19, 73.045), p(19.218, 73.087), p(19.235, 73.13),
];
const KALYAN_TO_KARJAT: GeoPoint[] = [p(19.22, 73.152), p(19.209, 73.188), p(19.164, 73.238), p(19.112, 73.264), p(19.025, 73.317), p(18.954, 73.328), p(18.9107, 73.3236)];
// Bhor Ghat: Karjat → Palasdari → Kelavli → Thakurwadi → Monkey Hill → Khandala → Lonavala.
const BHOR_GHAT: GeoPoint[] = [p(18.886, 73.345), p(18.86, 73.356), p(18.842, 73.361), p(18.819, 73.376), p(18.79, 73.381), p(18.762, 73.385), p(18.753, 73.407)];

export const CORRIDORS: RailCorridor[] = [
  {
    id: 'western-suburban', name: 'Western line (Churchgate–Borivali)', service: 'suburban', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['churchgate', 'mumbai-central', 'dadar', 'bandra', 'andheri', 'borivali'],
    path: [p(18.9352, 72.827), p(18.946, 72.824), p(18.963, 72.816), p(18.969, 72.8194), p(18.982, 72.823), p(18.996, 72.83), p(19.0186, 72.8438), p(19.041, 72.842), p(19.0544, 72.8406), p(19.069, 72.84), p(19.081, 72.841), p(19.099, 72.844), p(19.1197, 72.8464), p(19.136, 72.848), p(19.164, 72.849), p(19.187, 72.849), p(19.204, 72.852), p(19.229, 72.857)],
  },
  {
    id: 'central-suburban', name: 'Central line (CSMT–Kalyan–Karjat)', service: 'suburban', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['csmt', 'byculla', 'dadar', 'kurla', 'ghatkopar', 'thane', 'dombivli', 'kalyan', 'neral', 'karjat'],
    path: [...CSMT_TO_KALYAN, ...KALYAN_TO_KARJAT],
  },
  {
    id: 'harbour-suburban', name: 'Harbour line (CSMT–Vashi–Panvel)', service: 'suburban', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['csmt', 'kurla', 'mankhurd', 'vashi', 'belapur', 'panvel'],
    path: [p(18.9398, 72.8355), p(18.948, 72.838), p(18.958, 72.838), p(18.964, 72.842), p(18.972, 72.845), p(18.986, 72.844), p(18.994, 72.856), p(19.017, 72.858), p(19.029, 72.864), p(19.047, 72.869), p(19.0656, 72.879), p(19.068, 72.892), p(19.062, 72.901), p(19.054, 72.917), p(19.048, 72.931), p(19.056, 72.965), p(19.065, 72.999), p(19.064, 73.011), p(19.057, 73.024), p(19.033, 73.018), p(19.021, 73.021), p(19.019, 73.038), p(19.033, 73.062), p(19.012, 73.089), p(18.995, 73.105), p(18.99, 73.118)],
  },
  {
    id: 'metro-1', name: 'Mumbai Metro line 1 (Versova–Andheri–Ghatkopar)', service: 'metro', elevatedM: 12, dataNote: CORRIDORS_DATA_NOTE,
    stations: ['m1-versova', 'm1-dn-nagar', 'm1-azad-nagar', 'm1-andheri', 'm1-weh', 'm1-chakala', 'm1-airport-road', 'm1-marol-naka', 'm1-saki-naka', 'm1-asalpha', 'm1-jagruti-nagar', 'm1-ghatkopar'],
    path: [p(19.129, 72.821), p(19.125, 72.832), p(19.125, 72.839), p(19.1195, 72.848), p(19.116, 72.859), p(19.111, 72.867), p(19.109, 72.873), p(19.107, 72.88), p(19.103, 72.888), p(19.097, 72.895), p(19.091, 72.9), p(19.0863, 72.908)],
  },
  {
    id: 'mumbai-pune', name: 'Mumbai–Pune intercity (via Karjat–Lonavala ghat)', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['csmt', 'dadar', 'thane', 'kalyan', 'karjat', 'lonavala', 'shivajinagar', 'pune'],
    slowSections: [{ between: ['karjat', 'lonavala'], maxKmh: 45 }],
    path: [...CSMT_TO_KALYAN, ...KALYAN_TO_KARJAT, ...BHOR_GHAT, p(18.748, 73.455), p(18.75, 73.533), p(18.736, 73.674), p(18.69, 73.755), p(18.628, 73.803), p(18.61, 73.82), p(18.564, 73.836), p(18.532, 73.85), p(18.5285, 73.8745)],
  },
  {
    id: 'mumbai-nagpur', name: 'Mumbai–Nashik–Bhusawal–Nagpur', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['csmt', 'dadar', 'thane', 'kalyan', 'igatpuri', 'nashik-road', 'manmad', 'jalgaon', 'bhusawal', 'akola', 'badnera', 'nagpur'],
    slowSections: [{ between: ['kalyan', 'igatpuri'], maxKmh: 60 }],
    path: [...CSMT_TO_KALYAN, p(19.293, 73.207), p(19.42, 73.306), p(19.652, 73.478), p(19.678, 73.523), p(19.696, 73.562), p(19.715, 73.63), p(19.943, 73.815), p(19.947, 73.838), p(20.08, 74.11), p(20.145, 74.24), p(20.251, 74.439), p(20.314, 74.65), p(20.457, 75.01), p(20.667, 75.354), p(21.007, 75.566), p(21.045, 75.785), p(20.885, 76.205), p(20.79, 76.69), p(20.706, 77.002), p(20.73, 77.37), p(20.859, 77.736), p(20.81, 78.09), p(20.735, 78.599), p(20.8, 78.88), p(21.152, 79.088)],
  },
  {
    id: 'pune-kolhapur', name: 'Pune–Satara–Miraj–Kolhapur', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['pune', 'satara', 'sangli', 'miraj', 'kolhapur'],
    slowSections: [{ between: ['pune', 'satara'], maxKmh: 80 }],
    path: [p(18.5285, 73.8745), p(18.498, 73.94), p(18.43, 74.0), p(18.277, 74.16), p(18.1, 74.25), p(18.04, 74.19), p(17.84, 74.12), p(17.665, 74.025), p(17.59, 74.2), p(17.29, 74.18), p(17.06, 74.46), p(16.857, 74.568), p(16.826, 74.643), p(16.77, 74.45), p(16.703, 74.243)],
  },
  {
    id: 'konkan', name: 'Konkan Railway (Panvel–Roha–Ratnagiri–Kudal–Sawantwadi)', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['panvel', 'roha', 'chiplun', 'ratnagiri', 'kudal', 'sawantwadi'],
    slowSections: [{ between: ['roha', 'chiplun'], maxKmh: 90 }],
    path: [p(18.99, 73.118), p(18.74, 73.09), p(18.54, 73.14), p(18.442, 73.12), p(18.4, 73.22), p(18.24, 73.28), p(18.07, 73.33), p(17.72, 73.4), p(17.533, 73.522), p(17.19, 73.56), p(16.998, 73.311), p(16.82, 73.46), p(16.66, 73.59), p(16.5, 73.73), p(16.26, 73.72), p(16.1, 73.7), p(16.012, 73.687), p(15.934, 73.786)],
  },
  {
    id: 'neral-matheran', name: 'Neral–Matheran hill railway (heritage)', service: 'heritage', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['neral', 'matheran'],
    slowSections: [{ between: ['neral', 'matheran'], maxKmh: 20 }],
    path: [p(19.025, 73.317), p(19.018, 73.305), p(19.01, 73.295), p(19.004, 73.29), p(19.0, 73.285), p(18.996, 73.281), p(18.992, 73.276), p(18.987, 73.27)],
  },
  {
    id: 'pune-solapur', name: 'Pune–Daund–Solapur', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['pune', 'solapur'],
    path: [p(18.5285, 73.8745), p(18.498, 73.94), p(18.47, 74.07), p(18.49, 74.13), p(18.465, 74.59), p(18.3, 74.77), p(18.2, 75.05), p(18.09, 75.42), p(17.85, 75.7), p(17.666, 75.907)],
  },
  {
    id: 'manmad-nanded', name: 'Manmad–Chhatrapati Sambhajinagar–Nanded', service: 'intercity', dataNote: CORRIDORS_DATA_NOTE,
    stations: ['manmad', 'sambhajinagar', 'nanded'],
    path: [p(20.251, 74.439), p(20.06, 74.97), p(19.83, 75.1), p(19.867, 75.323), p(19.84, 75.88), p(19.6, 76.21), p(19.45, 76.44), p(19.26, 76.77), p(19.19, 77.02), p(19.148, 77.32)],
  },
];

const BY_ID = new Map(CORRIDORS.map((c) => [c.id, c]));

export function corridorById(id: string): RailCorridor | undefined {
  return BY_ID.get(id);
}

/** Corridors that call at a station. */
export function corridorsAtStation(stationId: string): RailCorridor[] {
  return CORRIDORS.filter((c) => c.stations.includes(stationId));
}
