/** Pure scoring helpers for photography, checklists and courses (unit-tested, Cesium-free). */

/** Initial bearing in degrees from point 1 to point 2 (0 = north, clockwise). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180, Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Absolute difference between two headings in degrees (0..180). */
export function headingDiffDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export interface PhotoAttempt {
  distM: number;
  standRadiusM: number;
  headingDiffDeg: number;
  toleranceDeg: number;
  points: number;
  goldenHour: boolean;
  sunElevationDeg: number;
  /** Camera frustum test result when available (null = unknown). */
  inFrustum: boolean | null;
}

export interface PhotoResult { ok: boolean; score: number; reason: string; golden: boolean }

/**
 * A shot scores when the player stands within the challenge radius and faces the subject within the tolerance;
 * the score falls off with the aiming error and doubles… well, ×1.5 at golden hour when the challenge asks for it.
 */
export function scorePhoto(a: PhotoAttempt): PhotoResult {
  if (a.distM > a.standRadiusM) return { ok: false, score: 0, reason: `Too far from the subject (${Math.round(a.distM)} m, get within ${a.standRadiusM} m)`, golden: false };
  if (a.inFrustum === false || a.headingDiffDeg > a.toleranceDeg) return { ok: false, score: 0, reason: 'Turn to face the subject', golden: false };
  const aim = 1 - (a.headingDiffDeg / a.toleranceDeg) * 0.5; // 1.0 dead-on … 0.5 at the edge
  const golden = a.goldenHour && a.sunElevationDeg > -6 && a.sunElevationDeg < 10;
  const score = Math.max(1, Math.round(a.points * aim * (golden ? 1.5 : 1)));
  return { ok: true, score, reason: golden ? 'Golden-hour shot!' : 'Nice shot', golden };
}

/** Which checklist items (in order) are newly reached by a position; returns ids to tick. */
export function reachedItems(items: { id: string; lat: number; lon: number; radiusM: number }[], done: Set<string>, lat: number, lon: number, distance: (a: number, b: number, c: number, d: number) => number): string[] {
  const out: string[] = [];
  for (const it of items) if (!done.has(it.id) && distance(lat, lon, it.lat, it.lon) <= it.radiusM) out.push(it.id);
  return out;
}
