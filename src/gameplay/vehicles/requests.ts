import type { VehicleKind } from './catalog';

/**
 * Tiny request bus between the vehicle-related gameplay systems (showroom → vehicles). Systems never import each
 * other's classes; the showroom publishes a request and the vehicle system, if registered, fulfils it. Both ends are
 * owned by the vehicles track.
 */
export interface SpawnVehicleRequest {
  kind: VehicleKind;
  paint?: string;
  lat: number;
  lon: number;
  headingDeg: number;
  /** Put the player straight into the driver's seat (test drive). */
  enter?: boolean;
  /** Stable key so repeated requests replace instead of duplicating (e.g. a showroom's test-drive slot). */
  key?: string;
  /** Navigation target shown on the vehicle HUD while driving this vehicle. */
  destination?: { name: string; lat: number; lon: number } | null;
}

type Listener = (r: SpawnVehicleRequest) => void;
const listeners = new Set<Listener>();
const pending: SpawnVehicleRequest[] = [];

export function requestVehicle(r: SpawnVehicleRequest): void {
  if (listeners.size === 0) { pending.push(r); return; }
  for (const l of listeners) l(r);
}

export function onVehicleRequest(l: Listener): () => void {
  listeners.add(l);
  for (const r of pending.splice(0)) l(r);
  return () => { listeners.delete(l); };
}
