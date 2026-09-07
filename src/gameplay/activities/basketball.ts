/**
 * Basketball throw model (pure): a projectile launched from shoulder height toward a hoop 3.05 m up. The shot is
 * "made" when the ball passes the rim height on the way down inside the ring, laterally within the ring radius.
 * Power and lateral error come from a seeded random so the game is fair but not trivial; aim error comes from how
 * accurately the player faces the hoop.
 */
import { Rng, mixSeed } from '@/util/hash';

export const HOOP_HEIGHT_M = 3.05;
export const RIM_RADIUS_M = 0.23;
export const RELEASE_HEIGHT_M = 2.0;
const G = 9.81;
const LAUNCH_ANGLE = (52 * Math.PI) / 180;

export interface ThrowInput {
  /** Horizontal distance from the player to the hoop centre (m). */
  distM: number;
  /** Angle between the player's heading and the bearing to the hoop (deg). */
  aimErrorDeg: number;
  /** Deterministic seed (throw counter). */
  seed: number;
}

export interface ThrowResult {
  made: boolean;
  /** Launch speed (m/s), forward distance where the ball reaches rim height on the way down (m), lateral miss (m). */
  speed: number;
  landingM: number;
  lateralM: number;
  /** Flight time until rim height on the way down (s). */
  flightS: number;
  reason: string;
}

/** Speed that lands the ball exactly on the rim centre for the launch angle. */
export function idealSpeed(distM: number): number {
  const h = HOOP_HEIGHT_M - RELEASE_HEIGHT_M;
  const c = Math.cos(LAUNCH_ANGLE), t = Math.tan(LAUNCH_ANGLE);
  const denom = 2 * c * c * (distM * t - h);
  return denom > 0 ? Math.sqrt((G * distM * distM) / denom) : 6;
}

/** Ball position along the arc at time t (x forward from the player, z above ground). */
export function ballAt(speed: number, t: number, lateralM: number, flightS: number): { x: number; y: number; z: number } {
  const vx = speed * Math.cos(LAUNCH_ANGLE), vz = speed * Math.sin(LAUNCH_ANGLE);
  return { x: vx * t, y: lateralM * Math.min(1, t / Math.max(0.01, flightS)), z: RELEASE_HEIGHT_M + vz * t - 0.5 * G * t * t };
}

export function simulateThrow(input: ThrowInput): ThrowResult {
  const rng = new Rng(mixSeed(input.seed, Math.round(input.distM * 100)));
  const d = Math.max(1.5, input.distM);
  // Power error shrinks with practice… no: it is a fixed ±7% band; distance makes it matter more.
  const speed = idealSpeed(d) * (1 + (rng.next() - 0.5) * 0.14);
  const vx = speed * Math.cos(LAUNCH_ANGLE), vz = speed * Math.sin(LAUNCH_ANGLE);
  const h = HOOP_HEIGHT_M - RELEASE_HEIGHT_M;
  // Time when z returns to hoop height on the way down: solve vz t - g t²/2 = h.
  const disc = vz * vz - 2 * G * h;
  const flightS = disc > 0 ? (vz + Math.sqrt(disc)) / G : (2 * vz) / G;
  const landingM = vx * flightS;
  const aimRad = (input.aimErrorDeg * Math.PI) / 180;
  const lateralM = Math.tan(aimRad) * d + (rng.next() - 0.5) * 0.12;
  const made = Math.abs(landingM - d) <= RIM_RADIUS_M * 0.9 && Math.abs(lateralM) <= RIM_RADIUS_M * 0.9;
  let reason = made ? 'Swish!' : Math.abs(lateralM) > RIM_RADIUS_M ? (lateralM > 0 ? 'Wide right' : 'Wide left') : landingM > d ? 'Too strong — off the back' : 'Short — front of the rim';
  if (!made && Math.abs(landingM - d) <= RIM_RADIUS_M * 1.6 && Math.abs(lateralM) <= RIM_RADIUS_M * 1.6) reason = 'Rattled out';
  return { made, speed, landingM, lateralM, flightS, reason };
}
