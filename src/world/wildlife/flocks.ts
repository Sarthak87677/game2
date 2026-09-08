/**
 * Flock model (pure): a flock centre circles and drifts around an anchor in a local east-north-up frame while members
 * hold slowly varying offsets — a cheap "boids-lite" that reads as a flock at a distance without per-member
 * neighbour searches.
 */
import type { Rng } from '@/util/hash';

export interface FlockMember { ox: number; oy: number; oz: number; phase: number; freq: number }

export interface Flock {
  /** Centre in metres east/north of the anchor and metres above the ground at the anchor. */
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  turn: number;
  /** Orbit radius the flock tends to keep around the anchor. */
  orbitM: number;
  members: FlockMember[];
  time: number;
}

export function createFlock(rng: Rng, count: number, spreadM: number, altitudeM: number, orbitM: number, speed: number): Flock {
  const members: FlockMember[] = [];
  for (let i = 0; i < count; i++) members.push({ ox: rng.range(-spreadM, spreadM), oy: rng.range(-spreadM, spreadM), oz: rng.range(-spreadM * 0.3, spreadM * 0.3), phase: rng.range(0, Math.PI * 2), freq: rng.range(0.4, 1.2) });
  const a = rng.range(0, Math.PI * 2);
  return { x: Math.cos(a) * orbitM, y: Math.sin(a) * orbitM, z: altitudeM, heading: a + Math.PI / 2, speed, turn: 0, orbitM, members, time: 0 };
}

/** Advances the flock centre: gentle random turning plus a pull back toward the orbit radius. */
export function advanceFlock(f: Flock, dt: number, rng01: number): void {
  f.time += dt;
  f.turn += (rng01 - 0.5) * dt * 1.2;
  f.turn = Math.max(-0.6, Math.min(0.6, f.turn * (1 - dt * 0.3)));
  const r = Math.hypot(f.x, f.y) || 1;
  const toCentre = Math.atan2(-f.y, -f.x);
  const excess = (r - f.orbitM) / f.orbitM;
  // Steer toward the anchor when too far, away when too close.
  let dh = angleDiff(f.heading, toCentre);
  if (excess > 0.2) f.heading += Math.sign(dh) * Math.min(Math.abs(dh), dt * 1.5 * excess);
  else if (excess < -0.4) { dh = angleDiff(f.heading, toCentre + Math.PI); f.heading += Math.sign(dh) * Math.min(Math.abs(dh), dt * 1.2); }
  f.heading += f.turn * dt;
  f.x += Math.cos(f.heading) * f.speed * dt;
  f.y += Math.sin(f.heading) * f.speed * dt;
  f.z += Math.sin(f.time * 0.3) * dt * 0.8;
}

/** Position of member i (metres from the anchor) — offsets breathe with a slow sinusoid. */
export function memberPosition(f: Flock, i: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const m = f.members[i];
  const s = 1 + 0.15 * Math.sin(f.time * m.freq + m.phase);
  out.x = f.x + m.ox * s;
  out.y = f.y + m.oy * s;
  out.z = f.z + m.oz * s + Math.sin(f.time * 2 * m.freq + m.phase) * 0.6;
  return out;
}

function angleDiff(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
