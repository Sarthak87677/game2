/**
 * Deterministic climate estimator for any point on Earth.
 *
 * Method (two stages):
 *
 *  (a) Physical baseline. Monthly sea-level temperature is a latitude-dependent annual mean plus a
 *      cosine seasonal cycle whose amplitude grows with |latitude| and with continentality
 *      (a function of distance to the coast) and whose phase lags the solstice more at marine sites.
 *      Elevation is applied locally with a fixed lapse rate of 6.5 °C/km. Monthly precipitation is a
 *      latitude-band baseline (ITCZ wet belt, subtropical dry belts, mid-latitude moderate, polar dry)
 *      with a simple seasonal shape (summer-wet tropics, winter-wet subtropics) and a continentality
 *      dryness factor.
 *
 *  (b) Residual correction. For the K nearest anchor stations we compute the anomaly
 *      "observed − baseline evaluated at the anchor's own latitude/elevation" and interpolate those
 *      anomalies to the query point with inverse-distance weighting (great-circle distance, power 2)
 *      multiplied by a per-anchor fade so that corrections vanish beyond roughly 1500 km. Temperature
 *      anomalies are interpolated at sea-level equivalent so elevation is handled by the lapse rate
 *      locally (Leh at 3500 m comes out cold, Kathmandu at 1400 m mild).
 *
 * Because the baseline for an anchor is evaluated with the *query's* continentality, a query placed
 * exactly on an anchor reproduces the anchor's values regardless of the distance-to-coast input.
 *
 * All values derived here are estimates; the app labels them as "inferred".
 */
import { CLIMATE_ANCHORS, type ClimateAnchor } from './anchors';
import { classifyKoppen, type KoppenClass } from './koppen';

/** Input for {@link estimateClimate}. */
export interface ClimateInput {
  /** Latitude in degrees, positive north. */
  lat: number;
  /** Longitude in degrees, positive east. */
  lon: number;
  /** Elevation above sea level in metres. */
  elevationM: number;
  /** Distance to the nearest coastline in km. Defaults to {@link DEFAULT_DISTANCE_TO_COAST_KM}. */
  distanceToCoastKm?: number;
}

/** Result of {@link estimateClimate}. */
export interface ClimateEstimate {
  /** 12 monthly mean temperatures (°C), January first. */
  tempC: number[];
  /** 12 monthly precipitation totals (mm), January first, never negative. */
  precipMm: number[];
  /** Köppen-Geiger class derived from the estimated normals. */
  koppen: KoppenClass;
  /** Mean annual temperature (°C). */
  annualMeanTempC: number;
  /** Total annual precipitation (mm). */
  annualPrecipMm: number;
  /** 0..1, decreasing with the distance to the nearest anchor stations. */
  confidence: number;
  /** Ids of the anchors used for the residual correction, nearest first. */
  nearestAnchorIds: string[];
}

/** An anchor together with its great-circle distance from a query point. */
export interface AnchorDistance {
  anchor: ClimateAnchor;
  distanceKm: number;
}

/** Environmental lapse rate used for elevation adjustment (°C per km). */
export const LAPSE_RATE_C_PER_KM = 6.5;
/** Continentality assumed when the caller does not know the distance to the coast (km). */
export const DEFAULT_DISTANCE_TO_COAST_KM = 300;
/** Number of nearest anchors blended into the residual correction. */
export const ANCHOR_NEIGHBOURS = 6;
/** Distance at which an anchor's correction has faded to one half (km). */
export const CORRECTION_FADE_KM = 1500;
/** Mean Earth radius (km). */
export const EARTH_RADIUS_KM = 6371;
/** Day-of-year of the middle of each month (non-leap year). */
export const MID_MONTH_DOY: readonly number[] = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

const DEG = Math.PI / 180;
const YEAR_DAYS = 365.25;

/** Approximate zonal-mean sea-level annual temperature (°C) by |latitude|. */
const ZONAL_MEAN_TEMP: ReadonlyArray<readonly [number, number]> = [
  [0, 26.5], [10, 26.5], [20, 25], [30, 20], [40, 14], [50, 7], [60, 1], [70, -7], [80, -15], [90, -20],
];

/** Approximate zonal-mean annual precipitation (mm) by |latitude| for a moderately maritime site. */
const ZONAL_PRECIP: ReadonlyArray<readonly [number, number]> = [
  [0, 1900], [5, 1900], [10, 1500], [15, 1000], [20, 600], [25, 350], [30, 400], [35, 600], [40, 700],
  [45, 800], [50, 800], [55, 700], [60, 600], [65, 450], [70, 300], [75, 200], [80, 130], [90, 80],
];

/**
 * Seasonal precipitation asymmetry by |latitude|: positive = summer-wet (monsoon / ITCZ),
 * negative = winter-wet (Mediterranean belt), zero = evenly spread.
 */
const PRECIP_SEASONALITY: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [5, 0.35], [10, 0.6], [15, 0.7], [20, 0.6], [25, 0.3], [30, -0.15], [35, -0.35], [40, -0.3],
  [45, -0.15], [50, 0], [90, 0],
];

function interpolateTable(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return table[table.length - 1][1];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Great-circle distance between two points using the haversine formula.
 * @returns Distance in kilometres.
 */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Continentality index in 0..1 derived from the distance to the coast (0 = fully maritime).
 * Saturates around 2000 km inland.
 */
export function continentality(distanceToCoastKm: number = DEFAULT_DISTANCE_TO_COAST_KM): number {
  const d = Math.max(0, Number.isFinite(distanceToCoastKm) ? distanceToCoastKm : DEFAULT_DISTANCE_TO_COAST_KM);
  return 1 - Math.exp(-d / 700);
}

/**
 * Physical baseline: monthly mean temperature at sea level (°C) for a latitude and continentality,
 * before any anchor correction. Hemisphere-aware (the warm season is shifted by half a year south
 * of the equator).
 *
 * @param lat Latitude in degrees.
 * @param distanceToCoastKm Distance to the coast in km (see {@link continentality}).
 */
export function baselineSeaLevelTempC(lat: number, distanceToCoastKm: number = DEFAULT_DISTANCE_TO_COAST_KM): number[] {
  const absLat = Math.min(90, Math.abs(lat));
  const mean = interpolateTable(ZONAL_MEAN_TEMP, absLat);
  const c = continentality(distanceToCoastKm);
  const marineAmp = 0.1 * absLat;
  const continentalAmp = 0.45 * absLat;
  const amplitude = marineAmp + (continentalAmp - marineAmp) * c;
  // Warm-season peak lags the solstice: ~day 200 (late July) inland, ~day 225 (mid August) at sea.
  let peakDoy = 200 + 25 * (1 - c);
  if (lat < 0) peakDoy += YEAR_DAYS / 2;
  return MID_MONTH_DOY.map((doy) => mean + amplitude * Math.cos(((doy - peakDoy) / YEAR_DAYS) * 2 * Math.PI));
}

/**
 * Physical baseline: monthly mean temperature (°C) including the lapse-rate elevation adjustment.
 */
export function baselineTempC(lat: number, elevationM: number, distanceToCoastKm: number = DEFAULT_DISTANCE_TO_COAST_KM): number[] {
  const lapse = (LAPSE_RATE_C_PER_KM * elevationM) / 1000;
  return baselineSeaLevelTempC(lat, distanceToCoastKm).map((t) => t - lapse);
}

/**
 * Physical baseline: monthly precipitation (mm) from latitude bands with a simple seasonal shape and
 * a continentality dryness factor. Hemisphere-aware.
 */
export function baselinePrecipMm(lat: number, distanceToCoastKm: number = DEFAULT_DISTANCE_TO_COAST_KM): number[] {
  const absLat = Math.min(90, Math.abs(lat));
  const c = continentality(distanceToCoastKm);
  const annual = interpolateTable(ZONAL_PRECIP, absLat) * (1 - 0.5 * c);
  const seasonality = interpolateTable(PRECIP_SEASONALITY, absLat);
  let peakDoy = 200;
  if (lat < 0) peakDoy += YEAR_DAYS / 2;
  const shape = MID_MONTH_DOY.map((doy) => 1 + seasonality * Math.cos(((doy - peakDoy) / YEAR_DAYS) * 2 * Math.PI));
  const norm = shape.reduce((a, b) => a + b, 0) / 12;
  return shape.map((f) => (annual / 12) * (f / norm));
}

/**
 * Returns the `k` anchors nearest to a point, nearest first.
 */
export function nearestAnchors(lat: number, lon: number, k: number = ANCHOR_NEIGHBOURS): AnchorDistance[] {
  const all: AnchorDistance[] = CLIMATE_ANCHORS.map((anchor) => ({
    anchor,
    distanceKm: greatCircleKm(lat, lon, anchor.lat, anchor.lon),
  }));
  all.sort((p, q) => p.distanceKm - q.distanceKm || (p.anchor.id < q.anchor.id ? -1 : 1));
  return all.slice(0, Math.max(0, Math.min(k, all.length)));
}

/**
 * Confidence (0..1) that the estimate is well constrained by anchors: 1 on top of a station,
 * falling to roughly 0.2 about 1000 km from the nearest station.
 */
export function anchorConfidence(neighbours: readonly AnchorDistance[]): number {
  if (neighbours.length === 0) return 0;
  const d1 = neighbours[0].distanceKm;
  const top3 = neighbours.slice(0, 3);
  const d3 = top3.reduce((s, n) => s + n.distanceKm, 0) / top3.length;
  const conf = 0.7 * Math.exp(-d1 / 600) + 0.3 * Math.exp(-d3 / 1200);
  return Math.round(clamp(conf, 0, 1) * 1000) / 1000;
}

/**
 * Estimates the monthly climate normals of a point.
 *
 * @param input Location, elevation and optional distance to the coast.
 * @returns Deterministic estimate (same input always yields the same output).
 * @throws RangeError for non-finite coordinates.
 */
export function estimateClimate(input: ClimateInput): ClimateEstimate {
  const { lat, lon } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
    throw new RangeError(`estimateClimate: invalid coordinates (${lat}, ${lon})`);
  }
  const elevationM = Number.isFinite(input.elevationM) ? input.elevationM : 0;
  const coast = input.distanceToCoastKm ?? DEFAULT_DISTANCE_TO_COAST_KM;

  const baseT = baselineSeaLevelTempC(lat, coast);
  const baseP = baselinePrecipMm(lat, coast);

  const neighbours = nearestAnchors(lat, lon, ANCHOR_NEIGHBOURS);
  const corrT = new Array<number>(12).fill(0);
  const corrP = new Array<number>(12).fill(0);
  let weightSum = 0;
  for (const { anchor, distanceKm } of neighbours) {
    const d = Math.max(1, distanceKm);
    const w = 1 / (d * d);
    const fade = 1 / (1 + (d / CORRECTION_FADE_KM) ** 4);
    const anchorBaseT = baselineSeaLevelTempC(anchor.lat, coast);
    const anchorBaseP = baselinePrecipMm(anchor.lat, coast);
    const seaLevelShift = (LAPSE_RATE_C_PER_KM * anchor.elevationM) / 1000;
    for (let m = 0; m < 12; m++) {
      corrT[m] += w * fade * (anchor.tempC[m] + seaLevelShift - anchorBaseT[m]);
      corrP[m] += w * fade * (anchor.precipMm[m] - anchorBaseP[m]);
    }
    weightSum += w;
  }

  const lapse = (LAPSE_RATE_C_PER_KM * elevationM) / 1000;
  const tempC: number[] = [];
  const precipMm: number[] = [];
  for (let m = 0; m < 12; m++) {
    const dT = weightSum > 0 ? corrT[m] / weightSum : 0;
    const dP = weightSum > 0 ? corrP[m] / weightSum : 0;
    tempC.push(round1(baseT[m] + dT - lapse));
    precipMm.push(round1(Math.max(0, baseP[m] + dP)));
  }

  const annualMeanTempC = round1(tempC.reduce((s, t) => s + t, 0) / 12);
  const annualPrecipMm = round1(precipMm.reduce((s, p) => s + p, 0));

  return {
    tempC,
    precipMm,
    koppen: classifyKoppen(tempC, precipMm, lat),
    annualMeanTempC,
    annualPrecipMm,
    confidence: anchorConfidence(neighbours),
    nearestAnchorIds: neighbours.map((n) => n.anchor.id),
  };
}
