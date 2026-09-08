import type { Interaction } from './types';

/** Player-to-object distance (m) within which an interaction counts as "contact" (a door, a car, a lift button). */
export const CONTACT_DISTANCE_M = 6;
/** Interactions with a radius up to this are objects you stand next to; larger radii are area prompts (a jetty, a terminal). */
export const CONTACT_RADIUS_M = 12;

/**
 * Ranks an interaction for the prompt (lower wins). Two tiers: something the player is standing at (a parked car, a
 * building door, an elevator call) always outranks an area prompt such as "Board ferry" (220 m) or "Enter terminal"
 * (350 m), whatever their priorities; within a tier, priority decides, then distance. Returns null when out of range.
 */
export function interactionScore(distanceM: number, it: Pick<Interaction, 'radiusM' | 'priority'>): number | null {
  if (distanceM > it.radiusM) return null;
  const contact = distanceM <= CONTACT_DISTANCE_M && it.radiusM <= CONTACT_RADIUS_M;
  return (contact ? -1_000_000 : 0) + distanceM - (it.priority ?? 0) * 1000;
}
