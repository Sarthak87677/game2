/**
 * Conversions between the building frame of an `InteriorPlan` (metres, rotated) and WGS84 lat/lon. Pure.
 */
import { enuOffsetM, offsetToLonLat } from '@/util/geo';
import type { InteriorPlan } from './types';

export interface PlanFrame { origin: { lat: number; lon: number }; rotationRad: number }

/** Building-frame point → lat/lon. */
export function planToLonLat(frame: PlanFrame, x: number, y: number): { lat: number; lon: number } {
  const c = Math.cos(frame.rotationRad), s = Math.sin(frame.rotationRad);
  const east = x * c - y * s;
  const north = x * s + y * c;
  return offsetToLonLat(frame.origin.lat, frame.origin.lon, east, north);
}

/** lat/lon → building-frame point. */
export function lonLatToPlan(frame: PlanFrame, lat: number, lon: number): { x: number; y: number } {
  const o = enuOffsetM(frame.origin.lat, frame.origin.lon, lat, lon);
  const c = Math.cos(-frame.rotationRad), s = Math.sin(-frame.rotationRad);
  return { x: o.east * c - o.north * s, y: o.east * s + o.north * c };
}

/** Heading (degrees clockwise from north) of the building +x axis, for facing the player along a corridor. */
export function planHeadingDeg(frame: PlanFrame, dx: number, dy: number): number {
  const c = Math.cos(frame.rotationRad), s = Math.sin(frame.rotationRad);
  const east = dx * c - dy * s;
  const north = dx * s + dy * c;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** Frame for a plan placed at `origin` (plans built from lon/lat footprints carry their own origin). */
export function frameFor(plan: InteriorPlan, origin?: { lat: number; lon: number }): PlanFrame {
  const o = origin ?? plan.origin;
  if (!o) throw new Error('Interior plan has no geographic origin');
  return { origin: o, rotationRad: plan.rotationRad };
}
