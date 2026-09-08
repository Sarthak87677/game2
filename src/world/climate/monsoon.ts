/**
 * Maharashtra seasonal preset (pure, Cesium-free). The south-west monsoon (June–September) brings heavy rain,
 * thunder and hill fog and turns the Deccan green; February–May is the hot dry season when grass and scrub brown.
 * These are generic climatological phases derived from public descriptions of the regional climate — a simulation
 * preset, never presented as observed weather.
 */
import type { WeatherCondition } from '@/engine/environment';
import { MAHARASHTRA_BBOX } from '@/data/maharashtra/living';
import { hash2 } from '@/util/hash';

export type MonsoonPhase = 'winter' | 'dry' | 'pre-monsoon' | 'monsoon' | 'retreat';

export interface SeasonPreset {
  phase: MonsoonPhase;
  label: string;
  /** 0..1 vegetation greenness expected for the phase (informational; drives ground wetness/tint choices). */
  greenness: number;
  /** 0..1 dry-season browning applied to the ground material's season tint. */
  browning: number;
  /** Probabilities used to pick the weather condition for a 6-hour block. */
  rainChance: number;
  stormChance: number;
  fogChance: number;
  dustChance: number;
  /** Typical wind (m/s). */
  windMs: number;
  /** Short note for the UI. */
  note: string;
}

const PHASES: Record<MonsoonPhase, Omit<SeasonPreset, 'phase'>> = {
  winter: { label: 'Winter (Nov–Jan): clear, cool mornings', greenness: 0.45, browning: 0.15, rainChance: 0.04, stormChance: 0.01, fogChance: 0.12, dustChance: 0, windMs: 3, note: 'Post-monsoon greens fade slowly; clear skies and misty dawns.' },
  dry: { label: 'Hot dry season (Feb–May): browning', greenness: 0.12, browning: 0.7, rainChance: 0.03, stormChance: 0.03, fogChance: 0.02, dustChance: 0.12, windMs: 5, note: 'Grass and scrub brown, haze and dust; pre-monsoon showers late May.' },
  'pre-monsoon': { label: 'Pre-monsoon (late May–early June): building clouds', greenness: 0.15, browning: 0.6, rainChance: 0.3, stormChance: 0.2, fogChance: 0.03, dustChance: 0.05, windMs: 8, note: 'Humid, thundery afternoons before the monsoon arrives.' },
  monsoon: { label: 'Monsoon (June–September): heavy rain', greenness: 1, browning: 0, rainChance: 0.75, stormChance: 0.2, fogChance: 0.2, dustChance: 0, windMs: 9, note: 'South-west monsoon: heavy rain, thunder, hill fog; everything turns green.' },
  retreat: { label: 'Retreating monsoon (October): showers', greenness: 0.85, browning: 0.05, rainChance: 0.3, stormChance: 0.1, fogChance: 0.08, dustChance: 0, windMs: 4, note: 'Showers thin out; lush green landscape.' },
};

/** Phase for a UTC month index (0-11) and day of month. */
export function monsoonPhase(month: number, day = 15): MonsoonPhase {
  if (month >= 10 || month === 0) return 'winter';
  if (month <= 3) return 'dry';
  if (month === 4) return day >= 25 ? 'pre-monsoon' : 'dry';
  if (month === 5) return day < 8 ? 'pre-monsoon' : 'monsoon';
  if (month <= 8) return 'monsoon';
  return 'retreat';
}

/** True when the point lies inside the Maharashtra bounding box used for regional presets. */
export function inMonsoonRegion(lat: number, lon: number): boolean {
  return lat >= MAHARASHTRA_BBOX.south && lat <= MAHARASHTRA_BBOX.north && lon >= MAHARASHTRA_BBOX.west && lon <= MAHARASHTRA_BBOX.east;
}

/** Seasonal preset for a date at a point, or null outside the region. */
export function seasonPreset(date: Date, lat: number, lon: number): SeasonPreset | null {
  if (!inMonsoonRegion(lat, lon)) return null;
  const phase = monsoonPhase(date.getUTCMonth(), date.getUTCDate());
  return { phase, ...PHASES[phase] };
}

export interface SeasonWeatherPick {
  condition: WeatherCondition;
  windMs: number;
  /** Deterministic key of the 6-hour block and 0.5° cell this pick belongs to. */
  blockKey: string;
}

/**
 * Picks a weather condition for a 6-hour block deterministically from the phase probabilities. Hill stations
 * (elevation above ~600 m) get extra fog in the monsoon; the coast gets slightly more rain.
 */
export function pickSeasonWeather(preset: SeasonPreset, date: Date, lat: number, lon: number, elevationM = 0): SeasonWeatherPick {
  const block = Math.floor(date.getTime() / 3_600_000 / 6);
  const cx = Math.round(lat * 2), cy = Math.round(lon * 2);
  const r = hash2(cx, cy, block);
  const r2 = hash2(cy, cx, block + 7);
  const hill = elevationM > 600 ? 1 : 0;
  const fog = preset.fogChance * (1 + hill * 1.5);
  let condition: WeatherCondition = 'clear';
  if (r < preset.stormChance) condition = 'storm';
  else if (r < preset.stormChance + preset.rainChance) condition = 'rain';
  else if (r < preset.stormChance + preset.rainChance + fog) condition = r2 < 0.5 ? 'fog' : 'mist';
  else if (r < preset.stormChance + preset.rainChance + fog + preset.dustChance) condition = 'dust';
  else if (preset.phase === 'monsoon' || preset.phase === 'retreat' || preset.phase === 'pre-monsoon') condition = r2 < 0.7 ? 'overcast' : 'partly_cloudy';
  else condition = r2 < 0.3 ? 'partly_cloudy' : 'clear';
  const windMs = preset.windMs * (0.7 + r2 * 0.6) + (condition === 'storm' ? 8 : 0);
  return { condition, windMs, blockKey: `${preset.phase}:${block}:${cx},${cy}:${hill}` };
}
