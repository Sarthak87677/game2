import { haversineM, enuOffsetM, offsetToLonLat } from '@/util/geo';

/**
 * Pure, Cesium-free vehicle logic: automatic gear selection, stuck detection, wet-grip scaling, impact detection,
 * bearings and nearest-road search. Everything here is unit-tested in Node.
 */

export type Gear = 'P' | 'R' | 'N' | 'D';

export interface GearInput {
  /** Signed ground speed in m/s (negative = reversing). */
  speedMs: number;
  /** Throttle pressed this frame. */
  throttle: boolean;
  /** Reverse/brake pedal pressed this frame. */
  reverse: boolean;
  /** Handbrake held. */
  brake: boolean;
  /** Seconds the vehicle has been (nearly) stationary with no pedal input. */
  idleS: number;
}

/**
 * Automatic transmission display. Forward motion or throttle → D, reverse motion or reverse pedal while stopped → R,
 * stationary for a moment with no input → P; N only briefly while coasting to a halt.
 */
export function selectGear(prev: Gear, i: GearInput): Gear {
  const stopped = Math.abs(i.speedMs) < 0.35;
  if (i.speedMs < -0.35) return 'R';
  if (i.speedMs > 0.35) return 'D';
  if (stopped) {
    if (i.throttle) return 'D';
    if (i.reverse) return prev === 'D' && i.brake ? 'P' : 'R';
    if (i.brake || i.idleS > 1.2) return 'P';
    return prev === 'P' ? 'P' : 'N';
  }
  return prev;
}

/** Tracks "throttle held but not moving" time and reports when a reset is due (4 s by default). */
export class StuckDetector {
  private heldS = 0;
  constructor(private readonly thresholdS = 4, private readonly minSpeedMs = 0.3) {}
  /** Feed once per frame; returns true exactly when the threshold is crossed. */
  update(throttle: boolean, speedMs: number, dt: number): boolean {
    if (!throttle || Math.abs(speedMs) > this.minSpeedMs) { this.heldS = 0; return false; }
    const before = this.heldS;
    this.heldS += dt;
    return before < this.thresholdS && this.heldS >= this.thresholdS;
  }
  get seconds(): number { return this.heldS; }
  reset(): void { this.heldS = 0; }
}

/** Grip multipliers for a wet road: acceleration and steering fall with surface wetness (0..1). */
export function wetGrip(wetness: number): { accel: number; turn: number; brake: number } {
  const w = Math.max(0, Math.min(1, wetness));
  return { accel: 1 - 0.35 * w, turn: 1 - 0.25 * w, brake: 1 - 0.3 * w };
}

/**
 * Hard-impact detector: a large drop in speed within one frame (a wall, a steep bank) counts as an impact; returns the
 * damage increment 0..0.35, or 0. Ordinary braking (≤ ~12 m/s² sustained) never triggers it.
 */
export function impactDamage(prevSpeedMs: number, speedMs: number, dt: number): number {
  const drop = Math.abs(prevSpeedMs) - Math.abs(speedMs);
  if (dt <= 0 || drop < 4 || Math.abs(prevSpeedMs) < 5) return 0;
  const decel = drop / Math.max(dt, 1 / 120);
  if (decel < 45) return 0;
  return Math.min(0.35, drop / 40);
}

/** Initial bearing in degrees (0 = north, clockwise) from A to B. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const d = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * d) * Math.cos(lat2 * d);
  const x = Math.cos(lat1 * d) * Math.sin(lat2 * d) - Math.sin(lat1 * d) * Math.cos(lat2 * d) * Math.cos((lon2 - lon1) * d);
  return ((Math.atan2(y, x) / d) + 360) % 360;
}

/** Signed relative bearing (-180..180) of a target from a heading, positive = to the right. */
export function relativeBearingDeg(headingDeg: number, targetBearingDeg: number): number {
  return ((targetBearingDeg - headingDeg + 540) % 360) - 180;
}

/** Indicator lamp state at a time: 1.25 Hz blink shared by both sides so hazards flash together. */
export function indicatorLit(nowMs: number): boolean {
  return Math.floor(nowMs / 400) % 2 === 0;
}

/** Automatic headlights: on when the sun is below 2° unless the driver overrode them. */
export function headlightsOn(sunElevationDeg: number, manualOverride: boolean | null): boolean {
  return manualOverride ?? sunElevationDeg < 2;
}

export interface RoadPolyline { coords: [number, number][]; kind?: string }
export interface RoadPoint { lat: number; lon: number; headingDeg: number; distanceM: number }

const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified', 'other']);

/** Nearest point on any drivable road polyline within maxM (flat-earth projection, fine below a few km). */
export function nearestRoadPoint(lat: number, lon: number, roads: Iterable<RoadPolyline>, maxM = 80): RoadPoint | null {
  let best: RoadPoint | null = null;
  for (const r of roads) {
    if (r.kind && !DRIVABLE.has(r.kind)) continue;
    const c = r.coords;
    for (let i = 1; i < c.length; i++) {
      const a = enuOffsetM(lat, lon, c[i - 1][1], c[i - 1][0]);
      const b = enuOffsetM(lat, lon, c[i][1], c[i][0]);
      // Quick reject: both ends further than maxM along either axis.
      if (Math.min(Math.abs(a.east), Math.abs(b.east)) > maxM && Math.sign(a.east) === Math.sign(b.east)) continue;
      if (Math.min(Math.abs(a.north), Math.abs(b.north)) > maxM && Math.sign(a.north) === Math.sign(b.north)) continue;
      const dx = b.east - a.east, dy = b.north - a.north;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.east * dx - a.north * dy) / len2));
      const px = a.east + dx * t, py = a.north + dy * t;
      const d = Math.hypot(px, py);
      if (d > maxM || (best && d >= best.distanceM)) continue;
      const p = offsetToLonLat(lat, lon, px, py);
      best = { lat: p.lat, lon: p.lon, headingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, distanceM: d };
    }
  }
  return best;
}

/** A point `backM` metres behind a heading (used when no road is close enough for a reset). */
export function pointBehind(lat: number, lon: number, headingDeg: number, backM: number): { lat: number; lon: number } {
  const h = (headingDeg * Math.PI) / 180;
  return offsetToLonLat(lat, lon, -Math.sin(h) * backM, -Math.cos(h) * backM);
}

/** Converts a vehicle-frame offset (forward, left) into a lat/lon next to a vehicle. */
export function offsetFromVehicle(lat: number, lon: number, headingDeg: number, forwardM: number, leftM: number): { lat: number; lon: number } {
  const h = (headingDeg * Math.PI) / 180;
  const east = forwardM * Math.sin(h) - leftM * Math.cos(h);
  const north = forwardM * Math.cos(h) + leftM * Math.sin(h);
  return offsetToLonLat(lat, lon, east, north);
}

// ---------------------------------------------------------------------------------------------------------------------
// Closed-course time trial

export interface Checkpoint { lat: number; lon: number; name?: string }
export interface TimeTrialCourse {
  id: string;
  name: string;
  /** Start/finish line followed by the checkpoints in order; the lap ends back at the start. */
  checkpoints: Checkpoint[];
  /** Capture radius in metres. */
  radiusM: number;
  note: string;
}

export interface TimeTrialState {
  courseId: string;
  startedMs: number;
  /** Index of the next checkpoint to capture (1 = first checkpoint after the start; length = back to start). */
  next: number;
  splitsMs: number[];
  finishedMs: number | null;
}

export function startTimeTrial(course: TimeTrialCourse, nowMs: number): TimeTrialState {
  return { courseId: course.id, startedMs: nowMs, next: 1, splitsMs: [], finishedMs: null };
}

/** Advances the trial with the vehicle position; returns the new state (same object when nothing happened). */
export function advanceTimeTrial(course: TimeTrialCourse, s: TimeTrialState, lat: number, lon: number, nowMs: number): TimeTrialState {
  if (s.finishedMs !== null) return s;
  const target = course.checkpoints[s.next % course.checkpoints.length];
  if (haversineM(lat, lon, target.lat, target.lon) > course.radiusM) return s;
  const splits = [...s.splitsMs, nowMs - s.startedMs];
  const done = s.next >= course.checkpoints.length;
  return { ...s, next: s.next + 1, splitsMs: splits, finishedMs: done ? nowMs : null };
}

export function nextCheckpoint(course: TimeTrialCourse, s: TimeTrialState): Checkpoint {
  return course.checkpoints[s.next % course.checkpoints.length];
}

export function formatLapTime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const sec = (ms % 60_000) / 1000;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

const BEST_KEY = (courseId: string) => `terra-infinite.timetrial.${courseId}.best`;

export function loadBestTime(courseId: string, storage: KeyValueStorage | null): number | null {
  try {
    const raw = storage?.getItem(BEST_KEY(courseId));
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/** Stores a lap time if it beats the stored best; returns true when a new record was written. */
export function saveBestTime(courseId: string, lapMs: number, storage: KeyValueStorage | null): boolean {
  const best = loadBestTime(courseId, storage);
  if (best !== null && lapMs >= best) return false;
  try { storage?.setItem(BEST_KEY(courseId), String(Math.round(lapMs))); } catch { return false; }
  return true;
}

// Ambient traffic helpers live with the road graph (src/world/traffic/roadGraph.ts) and are re-exported for tests.
export { trafficDensity, signalGreen, laneOffsetM } from '@/world/traffic/roadGraph';
