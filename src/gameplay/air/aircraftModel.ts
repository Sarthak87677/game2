/**
 * An original, generic twin-engine narrow-body built from primitives: fuselage, nose/tail cones, swept wings, engines,
 * stabilisers and retractable gear. The cabin (floor, seats, window panels) is separate so the passenger camera reads
 * as "inside". Local frame: +x forward, +y left, +z up, origin at the fuselage centre line.
 */
import { Cartesian3, type Viewer } from 'cesium';
import { BodyModel, type BodyPart } from '@/gameplay/journeys/bodies';

const WHITE = '#e9ecef', BELLY = '#b9c0c8', DARK = '#2b3138', ACCENT = '#1f6fb2';

function airframeParts(): BodyPart[] {
  const L = 36, R = 1.9;
  const parts: BodyPart[] = [
    { kind: 'cylinder', radius: R, length: L * 0.62, at: [0, 0, 0], axis: 'x', color: WHITE },
    { kind: 'cylinder', radius: R, topRadius: 0.35, length: L * 0.2, at: [L * 0.41, 0, 0], axis: 'x', color: WHITE },
    { kind: 'cylinder', radius: 0.4, topRadius: R, length: L * 0.2, at: [-L * 0.41, 0, 0.35], axis: 'x', color: WHITE },
    { kind: 'box', size: [5.2, 4.2, 0.7], at: [-1.5, 0, -1.7], color: BELLY },
    { kind: 'box', size: [2.2, 1.2, 0.5], at: [0, 0, -1.75], color: BELLY },
    // Cockpit windows.
    { kind: 'box', size: [1.6, 3.7, 0.5], at: [L * 0.36, 0, 0.7], color: DARK },
  ];
  for (const side of [1, -1]) {
    parts.push({ kind: 'box', size: [5.2, 16, 0.32], at: [-2.2, side * 9, -1.0], color: WHITE, yawDeg: -side * 22 });
    parts.push({ kind: 'box', size: [1.6, 3.4, 0.2], at: [-2.4, side * 15.8, -0.75], color: WHITE, yawDeg: -side * 22 });
    parts.push({ kind: 'cylinder', radius: 1.05, length: 4.6, at: [0.8, side * 6.2, -2.3], axis: 'x', color: BELLY });
    parts.push({ kind: 'cylinder', radius: 0.5, length: 1.2, at: [-1.9, side * 6.2, -2.3], axis: 'x', color: DARK });
    parts.push({ kind: 'box', size: [3.2, 6.2, 0.22], at: [-15.5, side * 3.4, 1.3], color: WHITE, yawDeg: -side * 28 });
  }
  parts.push({ kind: 'box', size: [4.2, 0.28, 6.2], at: [-15.2, 0, 3.6], color: ACCENT });
  parts.push({ kind: 'box', size: [2.0, 0.3, 0.6], at: [-13.5, 0, 6.5], color: ACCENT });
  return parts;
}

function gearParts(): BodyPart[] {
  const out: BodyPart[] = [
    { kind: 'cylinder', radius: 0.12, length: 2.0, at: [12, 0, -2.6], axis: 'z', color: DARK },
    { kind: 'cylinder', radius: 0.45, length: 0.5, at: [12, 0, -3.6], axis: 'y', color: '#111' },
  ];
  for (const side of [1, -1]) {
    out.push({ kind: 'cylinder', radius: 0.14, length: 2.0, at: [-1.0, side * 2.6, -2.6], axis: 'z', color: DARK });
    out.push({ kind: 'cylinder', radius: 0.55, length: 0.9, at: [-1.0, side * 2.6, -3.6], axis: 'y', color: '#111' });
  }
  return out;
}

function cabinParts(): BodyPart[] {
  const parts: BodyPart[] = [
    { kind: 'box', size: [24, 3.4, 0.12], at: [-1, 0, -0.7], color: '#7d7a72' },
    { kind: 'box', size: [24, 3.5, 0.1], at: [-1, 0, 1.75], color: '#dfe3e8' },
  ];
  for (const side of [1, -1]) {
    const y = side * 1.75;
    parts.push({ kind: 'box', size: [24, 0.08, 0.75], at: [-1, y, -0.3], color: '#d8dce2' });
    parts.push({ kind: 'box', size: [24, 0.08, 0.5], at: [-1, y, 1.45], color: '#d8dce2' });
    for (let k = 0; k <= 22; k++) parts.push({ kind: 'box', size: [0.3, 0.08, 1.15], at: [-12 + k * 1.09 + 0.55, y, 0.63], color: '#d8dce2' });
    for (let r = 0; r < 10; r++) {
      const x = 9 - r * 2.0;
      for (const seat of [0.65, 1.25]) {
        parts.push({ kind: 'box', size: [0.5, 0.55, 0.45], at: [x, side * seat, -0.4], color: '#2c4a6e' });
        parts.push({ kind: 'box', size: [0.12, 0.55, 1.05], at: [x - 0.22, side * seat, 0.15], color: '#2c4a6e' });
      }
      parts.push({ kind: 'box', size: [0.4, 0.5, 0.3], at: [x + 0.1, side * 1.0, 0.1], color: '#3b587a' });
    }
  }
  return parts;
}

export class AircraftModel {
  readonly airframe: BodyModel;
  readonly gear: BodyModel;
  readonly cabin: BodyModel;
  constructor(viewer: Viewer) {
    this.airframe = new BodyModel(viewer, airframeParts());
    this.gear = new BodyModel(viewer, gearParts(), { shadows: false });
    this.cabin = new BodyModel(viewer, cabinParts(), { shadows: false });
  }
  set show(v: boolean) { this.airframe.show = v; this.cabin.show = v; if (!v) this.gear.show = false; }
  setGear(down: boolean): void { this.gear.show = down && this.airframe.show; }
  /** Position is the fuselage centre line; wheels touch the ground 3.85 m below it. */
  setPose(position: Cartesian3, headingRad: number, pitchRad: number, rollRad: number): void {
    this.airframe.setPose(position, headingRad, pitchRad, rollRad);
    this.gear.setPose(position, headingRad, pitchRad, rollRad);
    this.cabin.setPose(position, headingRad, pitchRad, rollRad);
  }
  destroy(): void { this.airframe.destroy(); this.gear.destroy(); this.cabin.destroy(); }
}

export const AIRCRAFT_GEAR_HEIGHT_M = 3.85;

/** Airport ground scenery: runway strip, taxiway stub and a terminal block. */
export function airportSceneryParts(runwayLengthM: number): BodyPart[] {
  return [
    { kind: 'box', size: [runwayLengthM, 45, 0.3], at: [0, 0, 0.15], color: '#4a4d52' },
    { kind: 'box', size: [runwayLengthM, 1.0, 0.32], at: [0, 0, 0.17], color: '#e9e4d0' },
    { kind: 'box', size: [runwayLengthM * 0.9, 18, 0.28], at: [0, 120, 0.14], color: '#6a6d72' },
  ];
}

export function terminalParts(): BodyPart[] {
  return [
    { kind: 'box', size: [180, 40, 14], at: [0, 0, 7], color: '#cfd6dd' },
    { kind: 'box', size: [184, 44, 1.2], at: [0, 0, 14.6], color: '#8fa1b3' },
    { kind: 'box', size: [176, 0.6, 5], at: [0, 20.3, 6], color: '#3b5f7f' },
    { kind: 'box', size: [176, 0.6, 5], at: [0, -20.3, 6], color: '#3b5f7f' },
    { kind: 'box', size: [30, 60, 3], at: [0, 0, 1.5], color: '#a5adb5' },
  ];
}
