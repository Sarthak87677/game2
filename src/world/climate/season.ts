/** Season and phenology helpers (hemisphere-aware). Pure functions. */

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter' | 'wet' | 'dry';

export interface SeasonInfo {
  season: SeasonName;
  hemisphere: 'N' | 'S';
  dayOfYear: number;
  /** 0..1 leaf-on fraction for deciduous vegetation. */
  leafOnFraction: number;
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

/** Month index (0-11) shifted by six months for the southern hemisphere so seasonal windows can be shared. */
export function hemisphereMonth(date: Date, lat: number): number {
  const m = date.getUTCMonth();
  return lat < 0 ? (m + 6) % 12 : m;
}

/**
 * Season for a date and latitude. Uses astronomical-ish boundaries (equinox/solstice months). Within the tropics
 * (|lat| < 15°) seasons are reported as wet/dry using the monthly precipitation profile when provided.
 */
export function seasonFor(date: Date, lat: number, monthlyPrecipMm?: number[]): SeasonInfo {
  const hemisphere: 'N' | 'S' = lat < 0 ? 'S' : 'N';
  const doy = dayOfYear(date);
  const hm = hemisphereMonth(date, lat);
  let season: SeasonName;
  const seasonalRain = monthlyPrecipMm && monthlyPrecipMm.length === 12 ? Math.max(...monthlyPrecipMm) / Math.max(1, Math.min(...monthlyPrecipMm)) : 0;
  if (Math.abs(lat) < 23.5 && monthlyPrecipMm && monthlyPrecipMm.length === 12 && (Math.abs(lat) < 12 || seasonalRain > 3)) {
    const mean = monthlyPrecipMm.reduce((a, b) => a + b, 0) / 12;
    season = (monthlyPrecipMm[date.getUTCMonth()] ?? mean) >= mean ? 'wet' : 'dry';
  } else if (hm >= 2 && hm <= 4) season = 'spring';
  else if (hm >= 5 && hm <= 7) season = 'summer';
  else if (hm >= 8 && hm <= 10) season = 'autumn';
  else season = 'winter';
  // Leaf-on: ramps up through spring, full in summer, drops through autumn, off in winter.
  const t = (hm + (date.getUTCDate() - 1) / 31) / 12; // 0..1 hemisphere-year
  let leafOnFraction: number;
  if (t < 0.17) leafOnFraction = 0.05;
  else if (t < 0.42) leafOnFraction = 0.05 + ((t - 0.17) / 0.25) * 0.95;
  else if (t < 0.7) leafOnFraction = 1;
  else if (t < 0.92) leafOnFraction = 1 - ((t - 0.7) / 0.22) * 0.95;
  else leafOnFraction = 0.05;
  return { season, hemisphere, dayOfYear: doy, leafOnFraction };
}

export interface PhenologyInput { date: Date; lat: number; tempC?: number[]; precipMm?: number[] }
export interface Phenology { leafOn: number; flowering: number; fruiting: number; snowLikely: boolean; season: SeasonName }

/**
 * Generic phenology windows: flowering in spring, fruiting in late summer/autumn, both year-round but modulated by
 * the wet season in the tropics. Temperature (when provided) suppresses leaf-on in months below ~5 °C.
 */
export function phenology(i: PhenologyInput): Phenology {
  const s = seasonFor(i.date, i.lat, i.precipMm);
  const hm = hemisphereMonth(i.date, i.lat);
  const m = i.date.getUTCMonth();
  const temp = i.tempC?.[m];
  const tropical = Math.abs(i.lat) < 18;
  let leafOn = s.leafOnFraction;
  let flowering = hm === 2 ? 0.4 : hm === 3 ? 1 : hm === 4 ? 0.8 : hm === 5 ? 0.3 : 0;
  let fruiting = hm === 6 ? 0.3 : hm === 7 ? 0.7 : hm === 8 ? 1 : hm === 9 ? 0.8 : hm === 10 ? 0.3 : 0;
  if (tropical) {
    leafOn = 1;
    const wet = s.season === 'wet' ? 1 : 0.5;
    flowering = 0.35 * wet + 0.15;
    fruiting = 0.4 * (s.season === 'dry' ? 1 : 0.7) + 0.2;
  }
  if (temp !== undefined) {
    if (temp < -2) leafOn = Math.min(leafOn, 0.05);
    else if (temp < 5) leafOn = Math.min(leafOn, 0.35);
    if (temp < 4) { flowering = 0; fruiting = Math.min(fruiting, 0.2); }
  }
  return { leafOn, flowering, fruiting, snowLikely: temp !== undefined ? temp < 0 : s.season === 'winter' && Math.abs(i.lat) > 45, season: s.season };
}
