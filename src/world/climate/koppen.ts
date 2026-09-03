/**
 * Köppen-Geiger climate classification.
 *
 * Implements the decision rules of Peel, Finlayson & McMahon (2007), "Updated world map of the
 * Köppen-Geiger climate classification", Hydrol. Earth Syst. Sci. 11, 1633-1644 (Table 1), with one
 * deliberate deviation:
 *
 *   - The C/D (temperate/continental) boundary uses the CLASSICAL Köppen threshold of -3 °C for the
 *     coldest month instead of Peel's 0 °C. The -3 °C value is the one Köppen originally proposed
 *     (persistent winter snow cover boundary) and is still used by many European atlases; it also
 *     keeps oceanic-continental transition cities (e.g. Vienna, Budapest, New York) on the temperate
 *     side, which matches the popular usage of their classes. See {@link C_D_BOUNDARY_C}.
 *
 * Everything else follows Peel et al.:
 *   - B (arid) is evaluated first, then A, C, D and finally E ("Not (B)" prefix in Peel's table).
 *   - Summer / winter are the warmer / cooler six-month halves (Apr-Sep vs Oct-Mar); latitude is used
 *     only to break ties (equatorial stations with a flat annual cycle).
 *   - Precipitation threshold P_th = 2 * MAT (+28 if >= 70 % of rain falls in summer, +14 if neither
 *     half holds 70 %); BW if MAP < 5 * P_th, BS if MAP < 10 * P_th; h/k split at MAT = 18 °C.
 *   - A if Tcold >= 18 °C: Af (Pdry >= 60), Am (Pdry >= 100 - MAP/25), otherwise Aw/As
 *     (As is the variant with the dry season in the summer half - Peel folds it into Aw, the classical
 *     scheme keeps it, and this implementation keeps it too).
 *   - C / D seasonality: s if Psdry < 40 and Psdry < Pwwet/3; w if Pwdry < Pswet/10; f otherwise.
 *   - a: Thot >= 22; b: not a and >= 4 months >= 10 °C; c: not a/b and 1-3 months >= 10 °C;
 *     d (D only): not a/b and Tcold < -38 °C.
 *   - E if Thot < 10 °C; EF if Thot < 0 °C (classical "all months below freezing"), ET otherwise.
 *
 * The module is pure and dependency-free so it can run in workers, Node and the browser alike.
 */

/** All 31 Köppen-Geiger classes produced by {@link classifyKoppen}. */
export type KoppenClass =
  | 'Af' | 'Am' | 'Aw' | 'As'
  | 'BWh' | 'BWk' | 'BSh' | 'BSk'
  | 'Csa' | 'Csb' | 'Csc'
  | 'Cwa' | 'Cwb' | 'Cwc'
  | 'Cfa' | 'Cfb' | 'Cfc'
  | 'Dsa' | 'Dsb' | 'Dsc' | 'Dsd'
  | 'Dwa' | 'Dwb' | 'Dwc' | 'Dwd'
  | 'Dfa' | 'Dfb' | 'Dfc' | 'Dfd'
  | 'ET' | 'EF';

/** Main Köppen group letter. */
export type KoppenGroup = 'A' | 'B' | 'C' | 'D' | 'E';

/** Ordered list of every Köppen class (useful for UI legends and validation). */
export const KOPPEN_CLASSES: readonly KoppenClass[] = [
  'Af', 'Am', 'Aw', 'As',
  'BWh', 'BWk', 'BSh', 'BSk',
  'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc',
  'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd',
  'ET', 'EF',
];

/**
 * Coldest-month temperature separating C (temperate) from D (continental) climates.
 * Classical Köppen value; Peel et al. (2007) use 0 °C. See module documentation.
 */
export const C_D_BOUNDARY_C = -3;

/** Warmest-month temperature below which a climate is polar (E). */
export const POLAR_THRESHOLD_C = 10;

/** Warmest-month temperature below which a polar climate is an ice cap (EF). */
export const ICE_CAP_THRESHOLD_C = 0;

/** Coldest-month temperature at or above which a climate is tropical (A). */
export const TROPICAL_THRESHOLD_C = 18;

/** Mean annual temperature separating hot (h) from cold (k) arid climates. */
export const ARID_HOT_THRESHOLD_C = 18;

const APR_SEP = [3, 4, 5, 6, 7, 8] as const;
const OCT_MAR = [9, 10, 11, 0, 1, 2] as const;

/** Type guard for {@link KoppenClass}. */
export function isKoppenClass(value: unknown): value is KoppenClass {
  return typeof value === 'string' && (KOPPEN_CLASSES as readonly string[]).includes(value);
}

/** Returns the main group letter (A, B, C, D or E) of a class. */
export function koppenGroup(k: KoppenClass): KoppenGroup {
  return k.charAt(0) as KoppenGroup;
}

/**
 * Intermediate statistics used by the classifier; exposed for tests, debugging and tooltips.
 */
export interface KoppenStats {
  /** Mean annual temperature (°C). */
  mat: number;
  /** Mean annual precipitation (mm). */
  map: number;
  /** Warmest month temperature (°C). */
  thot: number;
  /** Coldest month temperature (°C). */
  tcold: number;
  /** Driest month precipitation (mm). */
  pdry: number;
  /** Number of months with mean temperature >= 10 °C. */
  tmon10: number;
  /** Indices (0-11) of the six summer months. */
  summerMonths: readonly number[];
  /** Indices (0-11) of the six winter months. */
  winterMonths: readonly number[];
  /** Driest summer month precipitation (mm). */
  psdry: number;
  /** Wettest summer month precipitation (mm). */
  pswet: number;
  /** Driest winter month precipitation (mm). */
  pwdry: number;
  /** Wettest winter month precipitation (mm). */
  pwwet: number;
  /** Fraction of annual precipitation falling in the summer half (0..1). */
  summerFraction: number;
  /** Arid threshold P_th (mm). */
  pthreshold: number;
}

function assertTwelve(values: readonly number[], label: string): void {
  if (values.length !== 12) {
    throw new RangeError(`${label} must contain exactly 12 monthly values (got ${values.length})`);
  }
  for (const v of values) {
    if (!Number.isFinite(v)) throw new RangeError(`${label} contains a non-finite value`);
  }
}

/**
 * Computes the summary statistics used by the classifier.
 *
 * @param tempC 12 monthly mean temperatures (°C), January first.
 * @param precipMm 12 monthly precipitation totals (mm), January first.
 * @param latitude Latitude in degrees; only used to break ties when both half-years are equally warm.
 */
export function koppenStats(tempC: readonly number[], precipMm: readonly number[], latitude: number): KoppenStats {
  assertTwelve(tempC, 'tempC');
  assertTwelve(precipMm, 'precipMm');
  const sum = (arr: readonly number[]): number => arr.reduce((a, b) => a + b, 0);
  const mat = sum(tempC) / 12;
  const map = sum(precipMm);
  const thot = Math.max(...tempC);
  const tcold = Math.min(...tempC);
  const pdry = Math.min(...precipMm);
  const tmon10 = tempC.filter((t) => t >= 10).length;

  const tAprSep = sum(APR_SEP.map((m) => tempC[m]));
  const tOctMar = sum(OCT_MAR.map((m) => tempC[m]));
  let summerIsAprSep: boolean;
  if (Math.abs(tAprSep - tOctMar) < 1e-9) summerIsAprSep = latitude >= 0;
  else summerIsAprSep = tAprSep > tOctMar;
  const summerMonths = summerIsAprSep ? APR_SEP : OCT_MAR;
  const winterMonths = summerIsAprSep ? OCT_MAR : APR_SEP;

  const ps = summerMonths.map((m) => precipMm[m]);
  const pw = winterMonths.map((m) => precipMm[m]);
  const psum = sum(ps);
  const summerFraction = map > 0 ? psum / map : 0.5;

  let pthreshold: number;
  if (summerFraction >= 0.7) pthreshold = 2 * mat + 28;
  else if (summerFraction <= 0.3) pthreshold = 2 * mat;
  else pthreshold = 2 * mat + 14;

  return {
    mat, map, thot, tcold, pdry, tmon10,
    summerMonths, winterMonths,
    psdry: Math.min(...ps), pswet: Math.max(...ps),
    pwdry: Math.min(...pw), pwwet: Math.max(...pw),
    summerFraction, pthreshold,
  };
}

/**
 * Classifies a monthly climate normal into a Köppen-Geiger class.
 *
 * @param tempC 12 monthly mean temperatures (°C), January first.
 * @param precipMm 12 monthly precipitation totals (mm), January first.
 * @param latitude Latitude in degrees (positive north). Used for hemisphere tie-breaks only.
 * @returns The Köppen-Geiger class, e.g. `"Cfb"`.
 * @throws RangeError if either array does not contain 12 finite values.
 */
export function classifyKoppen(tempC: readonly number[], precipMm: readonly number[], latitude: number): KoppenClass {
  const s = koppenStats(tempC, precipMm, latitude);

  // --- B: arid climates are tested first (Peel et al. 2007, "Not (B)" prefix on every other group).
  if (s.pthreshold > 0 && s.map < 10 * s.pthreshold) {
    const w = s.map < 5 * s.pthreshold;
    const hot = s.mat >= ARID_HOT_THRESHOLD_C;
    if (w) return hot ? 'BWh' : 'BWk';
    return hot ? 'BSh' : 'BSk';
  }

  // --- E: polar. Peel tests E last, but E and A/C/D are mutually exclusive on Thot so order is moot.
  if (s.thot < POLAR_THRESHOLD_C) {
    return s.thot < ICE_CAP_THRESHOLD_C ? 'EF' : 'ET';
  }

  // --- A: tropical.
  if (s.tcold >= TROPICAL_THRESHOLD_C) {
    if (s.pdry >= 60) return 'Af';
    if (s.pdry >= 100 - s.map / 25) return 'Am';
    // Aw vs As: As when the driest month falls in the summer half (classical Köppen).
    const driestIdx = precipMm.indexOf(s.pdry);
    return s.summerMonths.includes(driestIdx) ? 'As' : 'Aw';
  }

  // --- C / D share the seasonality and heat-summer suffixes.
  let seasonality: 's' | 'w' | 'f';
  if (s.psdry < 40 && s.psdry < s.pwwet / 3) seasonality = 's';
  else if (s.pwdry < s.pswet / 10) seasonality = 'w';
  else seasonality = 'f';

  const isD = s.tcold <= C_D_BOUNDARY_C;
  let heat: 'a' | 'b' | 'c' | 'd';
  if (s.thot >= 22) heat = 'a';
  else if (s.tmon10 >= 4) heat = 'b';
  else if (isD && s.tcold < -38) heat = 'd';
  else heat = 'c';

  return `${isD ? 'D' : 'C'}${seasonality}${heat}` as KoppenClass;
}
