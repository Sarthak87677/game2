import type { Station } from './types';

/**
 * Railway and metro stations used by the journeys track.
 *
 * DATA NOTE — every coordinate here is written from public reference values and is APPROXIMATE (typically within a
 * few hundred metres of the real station building). Platform counts are rounded public figures. Nothing is surveyed.
 */
export const STATIONS_DATA_NOTE = 'Station positions are approximate public reference values (±300 m); platform counts are rounded. Timetables in the game are simulated, not real.';

export const STATIONS: Station[] = [
  // Mumbai termini and suburban
  { id: 'csmt', name: 'Chhatrapati Shivaji Maharaj Terminus', code: 'CSMT', district: 'Mumbai City', lat: 18.9398, lon: 72.8355, platforms: 18 },
  { id: 'churchgate', name: 'Churchgate', code: 'CCG', district: 'Mumbai City', lat: 18.9352, lon: 72.8270, platforms: 4 },
  { id: 'mumbai-central', name: 'Mumbai Central', code: 'MMCT', district: 'Mumbai City', lat: 18.9690, lon: 72.8194, platforms: 7 },
  { id: 'byculla', name: 'Byculla', code: 'BY', district: 'Mumbai City', lat: 18.9770, lon: 72.8330, platforms: 4 },
  { id: 'dadar', name: 'Dadar', code: 'DR', district: 'Mumbai City', lat: 19.0186, lon: 72.8438, platforms: 14 },
  { id: 'bandra', name: 'Bandra', code: 'BA', district: 'Mumbai Suburban', lat: 19.0544, lon: 72.8406, platforms: 7 },
  { id: 'andheri', name: 'Andheri', code: 'ADH', district: 'Mumbai Suburban', lat: 19.1197, lon: 72.8464, platforms: 9 },
  { id: 'borivali', name: 'Borivali', code: 'BVI', district: 'Mumbai Suburban', lat: 19.2290, lon: 72.8570, platforms: 10 },
  { id: 'kurla', name: 'Kurla', code: 'CLA', district: 'Mumbai Suburban', lat: 19.0656, lon: 72.8790, platforms: 8 },
  { id: 'ghatkopar', name: 'Ghatkopar', code: 'GC', district: 'Mumbai Suburban', lat: 19.0860, lon: 72.9085, platforms: 4 },
  { id: 'thane', name: 'Thane', code: 'TNA', district: 'Thane', lat: 19.1860, lon: 72.9755, platforms: 10 },
  { id: 'dombivli', name: 'Dombivli', code: 'DI', district: 'Thane', lat: 19.2180, lon: 73.0870, platforms: 5 },
  { id: 'kalyan', name: 'Kalyan Junction', code: 'KYN', district: 'Thane', lat: 19.2350, lon: 73.1300, platforms: 8 },
  { id: 'mankhurd', name: 'Mankhurd', code: 'MNKD', district: 'Mumbai Suburban', lat: 19.0480, lon: 72.9310, platforms: 2 },
  { id: 'vashi', name: 'Vashi', code: 'VSH', district: 'Thane', lat: 19.0650, lon: 72.9990, platforms: 4 },
  { id: 'belapur', name: 'CBD Belapur', code: 'BEPR', district: 'Thane', lat: 19.0190, lon: 73.0380, platforms: 4 },
  { id: 'panvel', name: 'Panvel Junction', code: 'PNVL', district: 'Raigad', lat: 18.9900, lon: 73.1180, platforms: 7 },
  // Karjat–Lonavala ghat and Pune
  { id: 'neral', name: 'Neral Junction', code: 'NRL', district: 'Raigad', lat: 19.0250, lon: 73.3170, platforms: 3 },
  { id: 'karjat', name: 'Karjat Junction', code: 'KJT', district: 'Raigad', lat: 18.9107, lon: 73.3236, platforms: 5 },
  { id: 'lonavala', name: 'Lonavala', code: 'LNL', district: 'Pune', lat: 18.7530, lon: 73.4070, platforms: 4 },
  { id: 'shivajinagar', name: 'Shivajinagar', code: 'SVJR', district: 'Pune', lat: 18.5320, lon: 73.8500, platforms: 3 },
  { id: 'pune', name: 'Pune Junction', code: 'PUNE', district: 'Pune', lat: 18.5285, lon: 73.8745, platforms: 6 },
  // Matheran hill railway
  { id: 'matheran', name: 'Matheran', code: 'MAE', district: 'Raigad', lat: 18.9870, lon: 73.2700, platforms: 2 },
  // North-east (Mumbai–Nashik–Bhusawal–Nagpur)
  { id: 'igatpuri', name: 'Igatpuri', code: 'IGP', district: 'Nashik', lat: 19.6960, lon: 73.5620, platforms: 4 },
  { id: 'nashik-road', name: 'Nashik Road', code: 'NK', district: 'Nashik', lat: 19.9470, lon: 73.8380, platforms: 4 },
  { id: 'manmad', name: 'Manmad Junction', code: 'MMR', district: 'Nashik', lat: 20.2510, lon: 74.4390, platforms: 6 },
  { id: 'jalgaon', name: 'Jalgaon Junction', code: 'JL', district: 'Jalgaon', lat: 21.0070, lon: 75.5660, platforms: 4 },
  { id: 'bhusawal', name: 'Bhusawal Junction', code: 'BSL', district: 'Jalgaon', lat: 21.0450, lon: 75.7850, platforms: 8 },
  { id: 'akola', name: 'Akola Junction', code: 'AK', district: 'Akola', lat: 20.7060, lon: 77.0020, platforms: 6 },
  { id: 'badnera', name: 'Badnera Junction (Amravati)', code: 'BD', district: 'Amravati', lat: 20.8590, lon: 77.7360, platforms: 5 },
  { id: 'nagpur', name: 'Nagpur Junction', code: 'NGP', district: 'Nagpur', lat: 21.1520, lon: 79.0880, platforms: 8 },
  // Marathwada
  { id: 'sambhajinagar', name: 'Chhatrapati Sambhajinagar', code: 'AWB', district: 'Chhatrapati Sambhajinagar', lat: 19.8670, lon: 75.3230, platforms: 4 },
  { id: 'nanded', name: 'Hazur Sahib Nanded', code: 'NED', district: 'Nanded', lat: 19.1480, lon: 77.3200, platforms: 5 },
  // South-east and south
  { id: 'solapur', name: 'Solapur', code: 'SUR', district: 'Solapur', lat: 17.6660, lon: 75.9070, platforms: 5 },
  { id: 'satara', name: 'Satara', code: 'STR', district: 'Satara', lat: 17.6650, lon: 74.0250, platforms: 3 },
  { id: 'sangli', name: 'Sangli', code: 'SLI', district: 'Sangli', lat: 16.8570, lon: 74.5680, platforms: 3 },
  { id: 'miraj', name: 'Miraj Junction', code: 'MRJ', district: 'Sangli', lat: 16.8260, lon: 74.6430, platforms: 6 },
  { id: 'kolhapur', name: 'Chhatrapati Shahu Maharaj Terminus, Kolhapur', code: 'KOP', district: 'Kolhapur', lat: 16.7030, lon: 74.2430, platforms: 4 },
  // Konkan Railway
  { id: 'roha', name: 'Roha', code: 'ROHA', district: 'Raigad', lat: 18.4420, lon: 73.1200, platforms: 3 },
  { id: 'chiplun', name: 'Chiplun', code: 'CHI', district: 'Ratnagiri', lat: 17.5330, lon: 73.5220, platforms: 3 },
  { id: 'ratnagiri', name: 'Ratnagiri', code: 'RN', district: 'Ratnagiri', lat: 16.9980, lon: 73.3110, platforms: 3 },
  { id: 'kudal', name: 'Kudal', code: 'KUDL', district: 'Sindhudurg', lat: 16.0120, lon: 73.6870, platforms: 2 },
  { id: 'sawantwadi', name: 'Sawantwadi Road', code: 'SWV', district: 'Sindhudurg', lat: 15.9340, lon: 73.7860, platforms: 2 },
  // Mumbai Metro line 1 (Versova–Andheri–Ghatkopar), elevated
  { id: 'm1-versova', name: 'Versova (Metro)', code: 'VRS', district: 'Mumbai Suburban', lat: 19.1290, lon: 72.8210, platforms: 2 },
  { id: 'm1-dn-nagar', name: 'D N Nagar (Metro)', code: 'DNN', district: 'Mumbai Suburban', lat: 19.1250, lon: 72.8320, platforms: 2 },
  { id: 'm1-azad-nagar', name: 'Azad Nagar (Metro)', code: 'AZN', district: 'Mumbai Suburban', lat: 19.1250, lon: 72.8390, platforms: 2 },
  { id: 'm1-andheri', name: 'Andheri (Metro)', code: 'ADHM', district: 'Mumbai Suburban', lat: 19.1195, lon: 72.8480, platforms: 2 },
  { id: 'm1-weh', name: 'Western Express Highway (Metro)', code: 'WEH', district: 'Mumbai Suburban', lat: 19.1160, lon: 72.8590, platforms: 2 },
  { id: 'm1-chakala', name: 'Chakala (Metro)', code: 'CKL', district: 'Mumbai Suburban', lat: 19.1110, lon: 72.8670, platforms: 2 },
  { id: 'm1-airport-road', name: 'Airport Road (Metro)', code: 'APR', district: 'Mumbai Suburban', lat: 19.1090, lon: 72.8730, platforms: 2 },
  { id: 'm1-marol-naka', name: 'Marol Naka (Metro)', code: 'MRN', district: 'Mumbai Suburban', lat: 19.1070, lon: 72.8800, platforms: 2 },
  { id: 'm1-saki-naka', name: 'Saki Naka (Metro)', code: 'SKN', district: 'Mumbai Suburban', lat: 19.1030, lon: 72.8880, platforms: 2 },
  { id: 'm1-asalpha', name: 'Asalpha (Metro)', code: 'ASL', district: 'Mumbai Suburban', lat: 19.0970, lon: 72.8950, platforms: 2 },
  { id: 'm1-jagruti-nagar', name: 'Jagruti Nagar (Metro)', code: 'JGN', district: 'Mumbai Suburban', lat: 19.0910, lon: 72.9000, platforms: 2 },
  { id: 'm1-ghatkopar', name: 'Ghatkopar (Metro)', code: 'GCM', district: 'Mumbai Suburban', lat: 19.0863, lon: 72.9080, platforms: 2 },
];

const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export function stationById(id: string): Station | undefined {
  return BY_ID.get(id);
}
