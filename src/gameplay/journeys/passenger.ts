/**
 * Shared passenger-mode plumbing: seat placement relative to a moving body, status line, time compression and the
 * walk-mode exit. Journeys call `seat()` every frame while the player is aboard.
 */
import { Cartesian3, Cartographic, Math as CMath } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { useTerraStore } from '@/state/store';
import { localToWorld } from './bodies';

export interface SeatSpec { forward: number; left: number; up: number; /** Look direction relative to the vehicle heading, degrees (clockwise). */ lookDeg: number; label: string }

const scratch = new Cartesian3();

export class PassengerRig {
  constructor(private readonly engine: TerraEngine) {}

  /** Switches to passenger mode (the journey owns the camera from now on). */
  enter(): void {
    if (this.engine.modes.getMode() !== 'passenger') this.engine.modes.setMode('passenger');
  }

  /** Places the camera in a seat of a body posed at `position` with `headingRad`, `pitchRad` and `rollRad`. */
  seat(position: Cartesian3, headingRad: number, spec: SeatSpec, pitchRad = 0, rollRad = 0): void {
    const eye = localToWorld(position, headingRad, spec.forward, spec.left, spec.up, scratch, pitchRad, rollRad);
    this.engine.modes.setPassengerPose(eye, headingRad + CMath.toRadians(spec.lookDeg));
  }

  aboard(): boolean { return this.engine.modes.getMode() === 'passenger'; }

  /** Leaves the vehicle: the player becomes a walker at lat/lon facing headingDeg. */
  exit(lat: number, lon: number, headingDeg: number, heightM?: number): void {
    const modes = this.engine.modes;
    modes.setMode('walk');
    modes.setBody(lat, lon, headingDeg, heightM);
    modes.setView('first');
    setStatus(null);
  }

  /** Lat/lon/height of a body position (for snapshots and interactions). */
  static carto(position: Cartesian3): { lat: number; lon: number; heightM: number } {
    const c = Cartographic.fromCartesian(position);
    return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), heightM: c.height };
  }
}

export function setStatus(status: string | null): void {
  const g = useTerraStore.getState().gameplay;
  if (g.status !== status) useTerraStore.getState().setGameplay({ status });
}

/** Simulation seconds per real second for a journey: its base compression times the [ ] speed multiplier. */
export function timeScale(engine: TerraEngine, base: number): number {
  return base * Math.max(0.1, Math.min(50, engine.modes.getSpeed()));
}

export function scaleLabel(scale: number): string {
  return Math.abs(scale - 1) < 0.05 ? '' : ` · ×${scale >= 10 ? Math.round(scale) : scale.toFixed(1)}`;
}
