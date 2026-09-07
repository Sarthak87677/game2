import type { Port } from './types';

/** Jetties, harbours and the cruise terminal. DATA NOTE — approximate public reference positions (±300 m). */
export const PORTS_DATA_NOTE = 'Jetty and terminal positions are approximate public reference values (±300 m); vessels, timetables and the cruise ship are original in-game designs.';

export const PORTS: Port[] = [
  { id: 'gateway-jetty', name: 'Gateway of India jetty', kind: 'jetty', lat: 18.9225, lon: 72.8352, dataNote: PORTS_DATA_NOTE },
  { id: 'mandwa', name: 'Mandwa jetty', kind: 'jetty', lat: 18.8030, lon: 72.8830, dataNote: PORTS_DATA_NOTE },
  { id: 'ferry-wharf', name: 'Ferry Wharf (Bhaucha Dhakka)', kind: 'jetty', lat: 18.9530, lon: 72.8480, dataNote: PORTS_DATA_NOTE },
  { id: 'rewas', name: 'Rewas jetty', kind: 'jetty', lat: 18.8760, lon: 72.9260, dataNote: PORTS_DATA_NOTE },
  { id: 'ballard-pier', name: 'Mumbai cruise terminal (Ballard Pier)', kind: 'cruise-terminal', lat: 18.9440, lon: 72.8420, dataNote: PORTS_DATA_NOTE },
  { id: 'ratnagiri-harbour', name: 'Ratnagiri harbour', kind: 'harbour', lat: 17.0100, lon: 73.2700, dataNote: PORTS_DATA_NOTE },
  { id: 'malvan-jetty', name: 'Malvan jetty', kind: 'jetty', lat: 16.0600, lon: 73.4600, dataNote: PORTS_DATA_NOTE },
];

const BY_ID = new Map(PORTS.map((p) => [p.id, p]));

export function portById(id: string): Port | undefined {
  return BY_ID.get(id);
}
