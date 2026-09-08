/**
 * Crowd density model (pure): how many pedestrians should be simulated within the full-simulation radius for a
 * place kind and local time. Beyond the radius the population is only estimated statistically.
 */
import type { HotspotKind } from '@/data/maharashtra/living';

export type PlaceKind = HotspotKind | 'urban' | 'suburban' | 'rural' | 'none';

/** Pedestrians per hectare at the busiest time for each place kind (procedural tuning, not census data). */
export const PEAK_DENSITY_PER_HA: Record<PlaceKind, number> = {
  station: 9, market: 8, temple: 6, promenade: 4, beach: 4, campus: 4, monument: 4, lake: 2.5, park: 2.5, village: 1.2, fort: 1, urban: 2.5, suburban: 1, rural: 0.2, none: 0,
};

/** 0..1 activity factor by local solar hour: quiet at night, morning and evening peaks. */
export function timeOfDayFactor(localHour: number, kind: PlaceKind = 'urban'): number {
  const h = ((localHour % 24) + 24) % 24;
  let f: number;
  if (h < 5) f = 0.05;
  else if (h < 7) f = 0.05 + (h - 5) * 0.25;
  else if (h < 10) f = 0.55 + (h - 7) * 0.15;
  else if (h < 16) f = 0.85;
  else if (h < 20) f = 1;
  else if (h < 22) f = 1 - (h - 20) * 0.3;
  else f = 0.4 - (h - 22) * 0.15;
  if ((kind === 'promenade' || kind === 'beach' || kind === 'lake') && h >= 17 && h < 21) f = Math.min(1.25, f * 1.25);
  if (kind === 'campus') f = h >= 8 && h < 17 ? 1 : h >= 7 && h < 18 ? 0.5 : 0.05;
  if (kind === 'station') f = Math.max(f, 0.3);
  return Math.max(0, f);
}

/** Target number of simulated pedestrians within `radiusM` for the place kind and local hour, capped by `max`. */
export function targetPedestrians(kind: PlaceKind, localHour: number, radiusM: number, max: number, weatherFactor = 1): number {
  const areaHa = (Math.PI * radiusM * radiusM) / 10_000;
  const n = PEAK_DENSITY_PER_HA[kind] * timeOfDayFactor(localHour, kind) * areaHa * weatherFactor;
  return Math.max(0, Math.min(max, Math.round(n)));
}

/** Statistical estimate of people within a larger radius (not simulated). */
export function estimatedPopulation(kind: PlaceKind, localHour: number, radiusM: number): number {
  const areaHa = (Math.PI * radiusM * radiusM) / 10_000;
  return Math.round(PEAK_DENSITY_PER_HA[kind] * timeOfDayFactor(localHour, kind) * areaHa);
}

/** Rain thins crowds; storms clear them. */
export function weatherCrowdFactor(condition: string | null | undefined): number {
  switch (condition) {
    case 'storm': return 0.15;
    case 'rain': return 0.45;
    case 'fog': case 'mist': return 0.7;
    case 'dust': return 0.6;
    default: return 1;
  }
}

/** Local solar hour for a UTC date and longitude. */
export function localSolarHour(date: Date, lon: number): number {
  return (((date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15) % 24) + 24) % 24;
}
