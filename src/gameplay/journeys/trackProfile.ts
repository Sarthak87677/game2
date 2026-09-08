/**
 * Vertical track profile: given terrain heights sampled along a corridor, returns rail heights that never cut through
 * the terrain (moving maximum lifts the track over crests) and are smoothed so that the ride does not jitter. Pure
 * TypeScript (unit-tested); the rail system feeds it terrain samples from Cesium.
 */
export interface ProfileOptions {
  /** Height of the rail above the ground/ballast in metres. */
  clearanceM?: number;
  /** Half-width (in samples) of the moving-maximum window that lifts the track over local crests. */
  crestWindow?: number;
  /** Half-width (in samples) of the smoothing window. */
  smoothWindow?: number;
  /** Constant extra lift (elevated metro viaducts). */
  elevatedM?: number;
}

export function buildTrackProfile(ground: number[], opts: ProfileOptions = {}): number[] {
  const n = ground.length;
  const clearance = opts.clearanceM ?? 0.6;
  const crest = opts.crestWindow ?? 2;
  const smooth = opts.smoothWindow ?? 3;
  const elevated = opts.elevatedM ?? 0;
  if (n === 0) return [];
  const lifted = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let k = Math.max(0, i - crest); k <= Math.min(n - 1, i + crest); k++) m = Math.max(m, ground[k]);
    lifted[i] = m;
  }
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, i - smooth); k <= Math.min(n - 1, i + smooth); k++) { sum += lifted[k]; cnt++; }
    // Never below the local ground: smoothing can only raise the track relative to the terrain.
    out[i] = Math.max(sum / cnt, ground[i]) + clearance + elevated;
  }
  return out;
}

/** Largest absolute grade (rise/run) between consecutive samples. */
export function maxGrade(heights: number[], spacingM: number): number {
  let g = 0;
  for (let i = 1; i < heights.length; i++) g = Math.max(g, Math.abs(heights[i] - heights[i - 1]) / spacingM);
  return g;
}
