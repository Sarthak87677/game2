/**
 * Simulated timetables. Everything here is FICTIONAL: train numbers, names, headways and departure times are generated
 * deterministically from the corridor/station so the departure board is stable within a session, and they are labelled
 * "simulated timetable" wherever they are shown. Pure TypeScript (unit-tested).
 */
import type { RailCorridor } from '@/data/maharashtra/types';

export interface Departure {
  /** Fictional five-digit service number. */
  trainNo: string;
  /** Service name ("Local", "Metro", or a fictional express name). */
  name: string;
  corridorId: string;
  /** +1 runs towards the last station of the corridor, −1 towards the first. */
  direction: 1 | -1;
  originId: string;
  destinationId: string;
  /** Ordered station ids from the boarding station (exclusive) to the destination (inclusive). */
  stops: string[];
  /** Simulated minutes until departure from the boarding station. */
  departsInMin: number;
  platform: number;
}

const EXPRESS_NAMES = ['Sahyadri Express', 'Bhima Express', 'Konkan Coast Mail', 'Vidarbha Link', 'Krishna Express', 'Godavari Express', 'Panchganga Express', 'Tapi Express', 'Ghat Passenger', 'Malabar Coast Express'];

/** Small deterministic hash → [0, 1). */
export function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function headwayMinutes(service: RailCorridor['service']): number {
  switch (service) {
    case 'suburban': return 6;
    case 'metro': return 4;
    case 'heritage': return 90;
    default: return 35;
  }
}

export function serviceLabel(corridor: RailCorridor, direction: 1 | -1): { name: string; trainNo: string } {
  const r = hash01(`${corridor.id}:${direction}`);
  if (corridor.service === 'suburban') return { name: 'Local', trainNo: `${direction > 0 ? '9' : '8'}${Math.floor(r * 9000 + 1000)}` };
  if (corridor.service === 'metro') return { name: 'Metro', trainNo: `M${Math.floor(r * 90 + 10)}` };
  if (corridor.service === 'heritage') return { name: 'Hill Railway', trainNo: `${Math.floor(r * 900 + 100)}` };
  return { name: EXPRESS_NAMES[Math.floor(r * EXPRESS_NAMES.length)], trainNo: `1${Math.floor(r * 9000 + 1000)}` };
}

/**
 * Next departures from `stationId` on every corridor in `corridors` within `horizonMin` simulated minutes, sorted by
 * departure. `nowMin` is the simulated clock (minutes since midnight or any monotonic minute counter).
 */
/** One departure per service (corridor + direction) in time order, then the rest — used for the ticket buttons. */
export function ticketChoices(deps: Departure[], max = 4): Departure[] {
  const seen = new Set<string>();
  const first: Departure[] = [], rest: Departure[] = [];
  for (const d of deps) { const k = `${d.corridorId}:${d.direction}`; if (seen.has(k)) rest.push(d); else { seen.add(k); first.push(d); } }
  return [...first, ...rest].slice(0, max);
}

export function nextDepartures(stationId: string, corridors: RailCorridor[], nowMin: number, horizonMin = 60, maxCount = 8): Departure[] {
  const out: Departure[] = [];
  for (const c of corridors) {
    const idx = c.stations.indexOf(stationId);
    if (idx < 0) continue;
    const headway = headwayMinutes(c.service);
    for (const direction of [1, -1] as const) {
      const last = direction > 0 ? c.stations.length - 1 : 0;
      if (idx === last) continue;
      const stops = direction > 0 ? c.stations.slice(idx + 1) : c.stations.slice(0, idx).reverse();
      const offset = Math.floor(hash01(`${c.id}:${direction}:${stationId}`, 7) * headway);
      const { name, trainNo } = serviceLabel(c, direction);
      const platform = 1 + Math.floor(hash01(`${c.id}:${direction}:platform`) * 4);
      let t = offset - (nowMin % headway);
      while (t < 1) t += headway;
      let k = 0;
      for (; t <= horizonMin; t += headway, k++) {
        out.push({ trainNo: c.service === 'intercity' || c.service === 'heritage' ? trainNo : `${trainNo}${k}`.slice(0, 5), name, corridorId: c.id, direction, originId: stationId, destinationId: stops[stops.length - 1], stops, departsInMin: t, platform });
      }
    }
  }
  out.sort((a, b) => a.departsInMin - b.departsInMin || a.corridorId.localeCompare(b.corridorId));
  // Round-robin across services so frequent locals do not crowd out the intercity departures.
  const groups = new Map<string, Departure[]>();
  for (const d of out) { const k = `${d.corridorId}:${d.direction}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(d); }
  const picked: Departure[] = [];
  for (let round = 0; picked.length < maxCount; round++) {
    let any = false;
    for (const g of groups.values()) { if (g[round]) { picked.push(g[round]); any = true; if (picked.length >= maxCount) break; } }
    if (!any) break;
  }
  picked.sort((a, b) => a.departsInMin - b.departsInMin || a.corridorId.localeCompare(b.corridorId));
  return picked;
}
