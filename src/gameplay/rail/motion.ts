/**
 * One-dimensional train motion along a track: accelerate towards the local speed limit, brake smoothly to a stop
 * target (station, red signal or end of line), never exceed the limit. Pure TypeScript (unit-tested).
 */
export interface MotionParams { accelMs2: number; brakeMs2: number }

export const SERVICE_MOTION: Record<'suburban' | 'metro' | 'intercity' | 'heritage', MotionParams & { maxMs: number }> = {
  suburban: { accelMs2: 0.9, brakeMs2: 1.0, maxMs: 80 / 3.6 },
  metro: { accelMs2: 1.0, brakeMs2: 1.1, maxMs: 80 / 3.6 },
  intercity: { accelMs2: 0.5, brakeMs2: 0.7, maxMs: 110 / 3.6 },
  heritage: { accelMs2: 0.3, brakeMs2: 0.5, maxMs: 20 / 3.6 },
};

/**
 * Advances (s, v) by dt seconds. `stopS` is the arc length where the train must be stationary (or null). Returns the
 * new state and whether the stop has been reached (within 0.5 m and nearly stationary).
 */
export function advanceTrain(s: number, v: number, direction: 1 | -1, dt: number, limitMs: number, stopS: number | null, p: MotionParams): { s: number; v: number; stopped: boolean } {
  let target = limitMs;
  let dist = Infinity;
  if (stopS !== null) {
    dist = Math.max(0, (stopS - s) * direction);
    // v² = 2·a·d braking curve, with a small crawl speed so the train actually reaches the mark.
    target = Math.min(target, Math.sqrt(2 * p.brakeMs2 * dist) + (dist > 0.5 ? 0.3 : 0));
  }
  if (target > v) v = Math.min(target, v + p.accelMs2 * dt);
  else v = Math.max(target, v - p.brakeMs2 * dt);
  let step = v * dt;
  if (stopS !== null && step > dist) { step = dist; v = 0; }
  s += step * direction;
  const stopped = stopS !== null && Math.abs(stopS - s) < 0.5 && v < 0.35;
  if (stopped) { s = stopS; v = 0; }
  return { s, v, stopped };
}

/** Piecewise speed limits along the track: the lowest limit whose [fromS, toS] contains s wins. */
export function limitAt(s: number, base: number, sections: { fromS: number; toS: number; ms: number }[]): number {
  let lim = base;
  for (const sec of sections) if (s >= sec.fromS && s <= sec.toS) lim = Math.min(lim, sec.ms);
  return lim;
}
