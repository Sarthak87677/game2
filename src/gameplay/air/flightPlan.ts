/**
 * A complete flight as a function of simulated time: taxi out → take-off roll → climb → great-circle cruise →
 * descent → landing roll → taxi in. Pure TypeScript (unit-tested). Altitudes are metres above the ellipsoid built
 * from the two airport ground heights plus a smooth climb/cruise/descent profile.
 */
import type { Airport } from '@/data/maharashtra/types';
import { bearingDeg, clamp, destinationPoint, distanceM, greatCircleInterpolate, Polyline, type PathSample } from '@/gameplay/journeys/geo';

export type FlightPhase = 'taxi-out' | 'takeoff' | 'climb' | 'cruise' | 'descent' | 'landing' | 'taxi-in' | 'arrived';

export interface FlightState {
  lat: number; lon: number; altM: number; headingDeg: number; pitchDeg: number; rollDeg: number;
  speedMs: number; phase: FlightPhase; gearDown: boolean;
  /** Fraction of the whole plan completed (0..1). */
  progress: number;
  /** Simulated seconds remaining. */
  remainingS: number;
}

export interface FlightPlanOptions { originGroundM: number; destGroundM: number }

const TAXI_MS = 14;
const ROTATE_MS = 78;
const CLIMB_MS = 120;
const APPROACH_MS = 75;
const ROLL_OUT_MS = 12;

/** Runway threshold (start of the roll) and far end for a runway centred on the airport point. */
export function runwayEnds(a: Airport): { start: { lat: number; lon: number }; end: { lat: number; lon: number } } {
  return { start: destinationPoint(a, a.runwayHeadingDeg + 180, a.runwayLengthM / 2), end: destinationPoint(a, a.runwayHeadingDeg, a.runwayLengthM / 2) };
}

/** Picks the runway direction that points most towards (departure) or comes most from (arrival) the other airport. */
export function runwayHeadingTowards(a: Airport, other: { lat: number; lon: number }, arrival: boolean): number {
  const want = arrival ? bearingDeg(other, a) : bearingDeg(a, other);
  const h1 = a.runwayHeadingDeg, h2 = (a.runwayHeadingDeg + 180) % 360;
  const diff = (h: number) => Math.abs(((h - want + 540) % 360) - 180);
  return diff(h1) <= diff(h2) ? h1 : h2;
}

export class FlightPlan {
  readonly ground: Polyline;      // taxi out: terminal → runway threshold
  readonly air: Polyline;         // threshold → ... → destination threshold (includes the take-off roll and landing roll)
  readonly taxiIn: Polyline;      // destination runway exit → terminal
  readonly cruiseAltM: number;
  readonly rollM: number;
  readonly landingRollM: number;
  readonly climbM: number;
  readonly descentM: number;
  readonly totalS: number;
  private readonly taxiOutS: number;
  private readonly airS: number;
  private readonly taxiInS: number;
  private t = 0;
  private readonly sample: PathSample = { lat: 0, lon: 0, headingDeg: 0, segment: 0, heightM: 0 };
  private lastHeading = NaN;
  private readonly speedTable: { s: number; t: number }[] = [];

  constructor(readonly origin: Airport, readonly dest: Airport, readonly opts: FlightPlanOptions) {
    const depHdg = runwayHeadingTowards(origin, dest, false);
    const arrHdg = runwayHeadingTowards(dest, origin, true);
    const depStart = destinationPoint(origin, depHdg + 180, origin.runwayLengthM / 2);
    const arrThreshold = destinationPoint(dest, arrHdg + 180, dest.runwayLengthM / 2);
    const arrEnd = destinationPoint(dest, arrHdg, dest.runwayLengthM * 0.45);
    this.ground = new Polyline([origin.terminal, destinationPoint(depStart, depHdg + 90, 120), depStart]);
    this.rollM = Math.min(origin.runwayLengthM * 0.7, 1700);
    this.landingRollM = Math.min(dest.runwayLengthM * 0.8, 1600);
    const liftOff = destinationPoint(depStart, depHdg, this.rollM);
    const climbOut = destinationPoint(liftOff, depHdg, 2500);
    const approachFix = destinationPoint(arrThreshold, arrHdg + 180, 9000);
    const gcLen = distanceM(climbOut, approachFix);
    const mid: { lat: number; lon: number }[] = [];
    const n = Math.max(2, Math.ceil(gcLen / 4000));
    for (let k = 1; k < n; k++) mid.push(greatCircleInterpolate(climbOut, approachFix, k / n));
    this.air = new Polyline([depStart, liftOff, climbOut, ...mid, approachFix, arrThreshold, arrEnd]);
    this.taxiIn = new Polyline([arrEnd, destinationPoint(arrEnd, arrHdg + 90, 150), dest.terminal]);
    const airDist = this.air.lengthM - this.rollM - this.landingRollM;
    this.cruiseAltM = clamp(airDist * 0.045, 1500, 10500);
    this.climbM = Math.min(airDist * 0.4, this.cruiseAltM / 0.06);
    this.descentM = Math.min(airDist * 0.4, this.cruiseAltM / 0.05);
    this.taxiOutS = this.ground.lengthM / TAXI_MS;
    // Integrate the speed profile along the air path once to get a time table.
    let s = 0, t = 0;
    this.speedTable.push({ s: 0, t: 0 });
    const step = 25;
    while (s < this.air.lengthM) { const v = this.airSpeedAt(s); s = Math.min(this.air.lengthM, s + step); t += step / Math.max(3, v); this.speedTable.push({ s, t }); }
    this.airS = t;
    this.taxiInS = this.taxiIn.lengthM / TAXI_MS;
    this.totalS = this.taxiOutS + this.airS + this.taxiInS;
  }

  /** Speed (m/s) at arc length s of the air path. */
  airSpeedAt(s: number): number {
    const L = this.air.lengthM;
    if (s < this.rollM) return 3 + (ROTATE_MS - 3) * Math.sqrt(s / this.rollM);
    const sAir = s - this.rollM;
    const airDist = L - this.rollM - this.landingRollM;
    if (sAir < this.climbM) { const f = sAir / this.climbM; return CLIMB_MS + (this.cruiseSpeed() - CLIMB_MS) * f; }
    if (sAir < airDist - this.descentM) return this.cruiseSpeed();
    if (sAir < airDist) { const f = (sAir - (airDist - this.descentM)) / this.descentM; return this.cruiseSpeed() + (APPROACH_MS - this.cruiseSpeed()) * f; }
    const roll = (sAir - airDist) / this.landingRollM;
    return APPROACH_MS + (ROLL_OUT_MS - APPROACH_MS) * Math.min(1, roll * 1.2);
  }

  cruiseSpeed(): number { return this.cruiseAltM > 6000 ? 235 : this.cruiseAltM > 3000 ? 190 : 150; }

  /** Altitude profile above the interpolated airport ground at air arc length s. */
  profileAltM(s: number): number {
    const L = this.air.lengthM;
    const sAir = s - this.rollM;
    const airDist = L - this.rollM - this.landingRollM;
    if (sAir <= 0 || sAir >= airDist) return 0;
    const smooth = (x: number) => x * x * (3 - 2 * x);
    if (sAir < this.climbM) return this.cruiseAltM * smooth(sAir / this.climbM);
    if (sAir > airDist - this.descentM) return this.cruiseAltM * smooth((airDist - sAir) / this.descentM);
    return this.cruiseAltM;
  }

  private sFromT(tAir: number): number {
    const tab = this.speedTable;
    if (tAir <= 0) return 0;
    if (tAir >= this.airS) return this.air.lengthM;
    let lo = 0, hi = tab.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].t <= tAir) lo = m; else hi = m; }
    const a = tab[lo], b = tab[hi];
    const f = b.t > a.t ? (tAir - a.t) / (b.t - a.t) : 0;
    return a.s + (b.s - a.s) * f;
  }

  /** Jumps the clock (fast travel / skip). */
  setTime(t: number): void { this.t = clamp(t, 0, this.totalS); }
  get time(): number { return this.t; }
  /** Time at which the aircraft has landed and rolled out (start of taxi-in). */
  get landedTime(): number { return this.taxiOutS + this.airS; }

  /** Advances by simulated seconds and returns the current state (allocation-free after the first call). */
  advance(dt: number, out: FlightState): FlightState {
    this.t = clamp(this.t + dt, 0, this.totalS);
    return this.stateAt(this.t, out, dt);
  }

  stateAt(t: number, out: FlightState, dt = 0): FlightState {
    const groundOf = (f: number) => this.opts.originGroundM + (this.opts.destGroundM - this.opts.originGroundM) * f;
    out.progress = this.totalS > 0 ? t / this.totalS : 1;
    out.remainingS = Math.max(0, this.totalS - t);
    out.rollDeg = 0;
    if (t < this.taxiOutS) {
      this.ground.sample(t * TAXI_MS, this.sample);
      Object.assign(out, { lat: this.sample.lat, lon: this.sample.lon, altM: this.opts.originGroundM, headingDeg: this.sample.headingDeg, pitchDeg: 0, speedMs: TAXI_MS, phase: 'taxi-out', gearDown: true });
    } else if (t < this.taxiOutS + this.airS) {
      const s = this.sFromT(t - this.taxiOutS);
      this.air.sample(s, this.sample);
      const L = this.air.lengthM;
      const sAir = s - this.rollM;
      const airDist = L - this.rollM - this.landingRollM;
      const alt = groundOf(s / L) + this.profileAltM(s);
      const v = this.airSpeedAt(s);
      let phase: FlightPhase; let pitch = 0;
      if (sAir < 0) { phase = 'takeoff'; pitch = s > this.rollM * 0.85 ? 8 : 0; }
      else if (sAir < this.climbM) { phase = 'climb'; pitch = 9 * (1 - Math.max(0, sAir / this.climbM - 0.8) * 5); }
      else if (sAir < airDist - this.descentM) { phase = 'cruise'; pitch = 1.5; }
      else if (sAir < airDist) { phase = 'descent'; pitch = -3.5; }
      else { phase = 'landing'; pitch = sAir < airDist + 150 ? 4 : 0; }
      const gearDown = sAir < 300 || sAir > airDist - 12_000;
      // Bank with the heading rate (visual only).
      if (dt > 0 && Number.isFinite(this.lastHeading) && phase !== 'takeoff' && phase !== 'landing') {
        const dh = ((this.sample.headingDeg - this.lastHeading + 540) % 360) - 180;
        out.rollDeg = clamp((dh / dt) * 4, -25, 25);
      }
      this.lastHeading = this.sample.headingDeg;
      Object.assign(out, { lat: this.sample.lat, lon: this.sample.lon, altM: alt, headingDeg: this.sample.headingDeg, pitchDeg: pitch, speedMs: v, phase, gearDown });
    } else if (t < this.totalS) {
      this.taxiIn.sample((t - this.taxiOutS - this.airS) * TAXI_MS, this.sample);
      Object.assign(out, { lat: this.sample.lat, lon: this.sample.lon, altM: this.opts.destGroundM, headingDeg: this.sample.headingDeg, pitchDeg: 0, speedMs: TAXI_MS, phase: 'taxi-in', gearDown: true });
    } else {
      const p = this.taxiIn.points[this.taxiIn.points.length - 1];
      Object.assign(out, { lat: p.lat, lon: p.lon, altM: this.opts.destGroundM, headingDeg: this.sample.headingDeg, pitchDeg: 0, speedMs: 0, phase: 'arrived', gearDown: true });
    }
    return out;
  }
}

export function emptyFlightState(): FlightState {
  return { lat: 0, lon: 0, altM: 0, headingDeg: 0, pitchDeg: 0, rollDeg: 0, speedMs: 0, phase: 'taxi-out', gearDown: true, progress: 0, remainingS: 0 };
}

/** Real-time compression so that a Mumbai–Pune hop lasts about three minutes (longer hops scale sub-linearly). */
export function defaultCompression(plan: FlightPlan): number {
  const km = plan.air.lengthM / 1000;
  const targetRealS = 110 + km * 0.55;
  return Math.max(1, plan.totalS / targetRealS);
}
