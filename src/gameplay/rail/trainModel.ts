/**
 * Train bodies: locomotive/coaches built from boxes (hollow coaches — walls are separate slabs so the interior reads
 * correctly from the window seat), sliding doors and bogies. Local frame: +x forward, +y left, +z up, z=0 at rail.
 */
import { Cartesian3, Cartographic, Math as CMath } from 'cesium';
import type { Viewer } from 'cesium';
import type { RailCorridor } from '@/data/maharashtra/types';
import { BodyModel, type BodyPart } from '@/gameplay/journeys/bodies';
import type { PathSample } from '@/gameplay/journeys/geo';
import type { TrackRuntime } from './track';

export interface UnitSpec { kind: 'loco' | 'cab' | 'coach'; lengthM: number; widthM: number; color: string; roof: string; doors: boolean; heightM: number }
export interface TrainSpec { units: UnitSpec[]; boardingUnit: number; gapM: number }

export function trainSpecFor(service: RailCorridor['service']): TrainSpec {
  switch (service) {
    case 'suburban': {
      const u = (kind: UnitSpec['kind']): UnitSpec => ({ kind, lengthM: 20.5, widthM: 3.2, color: '#5b3a86', roof: '#e8e4dc', doors: true, heightM: 3.9 });
      return { units: [u('cab'), u('coach'), u('coach'), u('coach'), u('coach'), u('coach')], boardingUnit: 1, gapM: 0.7 };
    }
    case 'metro': {
      const u = (kind: UnitSpec['kind']): UnitSpec => ({ kind, lengthM: 21, widthM: 3.0, color: '#2f6fb5', roof: '#dfe6ee', doors: true, heightM: 3.7 });
      return { units: [u('cab'), u('coach'), u('coach'), u('cab')], boardingUnit: 1, gapM: 0.5 };
    }
    case 'heritage': {
      const c = (): UnitSpec => ({ kind: 'coach', lengthM: 6.5, widthM: 2.1, color: '#b8402e', roof: '#e9d9a8', doors: true, heightM: 2.6 });
      return { units: [{ kind: 'loco', lengthM: 5.5, widthM: 2.0, color: '#2e2e2e', roof: '#2e2e2e', doors: false, heightM: 2.6 }, c(), c(), c()], boardingUnit: 1, gapM: 0.5 };
    }
    default: {
      const c = (): UnitSpec => ({ kind: 'coach', lengthM: 23, widthM: 3.2, color: '#2a4f8f', roof: '#c9ced6', doors: true, heightM: 4.0 });
      return { units: [{ kind: 'loco', lengthM: 19, widthM: 3.1, color: '#c8392b', roof: '#3a3a3a', doors: false, heightM: 4.2 }, c(), c(), c(), c(), c(), c(), c()], boardingUnit: 1, gapM: 0.9 };
    }
  }
}

function coachParts(u: UnitSpec): { body: BodyPart[]; doors: BodyPart[] } {
  const L = u.lengthM, W = u.widthM, H = u.heightM;
  const floorZ = 1.25;
  const dark = '#2b2b2f';
  const body: BodyPart[] = [
    { kind: 'box', size: [L, W - 0.5, 0.45], at: [0, 0, 0.95], color: dark },
    { kind: 'box', size: [L - 0.1, W - 0.16, 0.12], at: [0, 0, floorZ], color: '#8d8579' },
    { kind: 'box', size: [L, W, 0.16], at: [0, 0, H + 0.05], color: u.roof },
    { kind: 'box', size: [2.4, 2.6, 0.6], at: [L / 3, 0, 0.5], color: dark },
    { kind: 'box', size: [2.4, 2.6, 0.6], at: [-L / 3, 0, 0.5], color: dark },
  ];
  if (u.kind === 'loco') {
    body.push({ kind: 'box', size: [L, W, H - 1.2], at: [0, 0, 1.2 + (H - 1.2) / 2], color: u.color });
    body.push({ kind: 'box', size: [3.0, W - 0.3, 1.1], at: [L / 2 - 1.6, 0, H - 0.8], color: '#1f2933' });
    body.push({ kind: 'box', size: [3.0, W - 0.3, 1.1], at: [-(L / 2 - 1.6), 0, H - 0.8], color: '#1f2933' });
    return { body, doors: [] };
  }
  const sillZ = floorZ, sillH = 0.85;
  const winTop = H - 0.45;
  const winH = winTop - (sillZ + sillH / 2);
  for (const side of [1, -1]) {
    const y = (side * W) / 2;
    body.push({ kind: 'box', size: [L, 0.08, sillH], at: [0, y, sillZ + sillH / 2 - 0.25], color: u.color });
    body.push({ kind: 'box', size: [L, 0.08, 0.45], at: [0, y, H - 0.2], color: u.color });
    const nWin = Math.max(2, Math.floor((L - 5) / 2.1));
    const span = L - 5;
    for (let k = 0; k <= nWin; k++) {
      const x = -span / 2 + (span * k) / nWin;
      body.push({ kind: 'box', size: [0.22, 0.08, winH + 0.05], at: [x, y, sillZ + sillH / 2 - 0.25 + sillH / 2 + winH / 2], color: u.color });
    }
    // Door frames near the ends (dark openings behind the sliding panels).
    for (const ex of [1, -1]) body.push({ kind: 'box', size: [1.5, 0.04, H - floorZ - 0.2], at: [ex * (L / 2 - 1.6), y - side * 0.08, floorZ + (H - floorZ) / 2 - 0.1], color: '#101418' });
  }
  body.push({ kind: 'box', size: [0.08, W, H - floorZ], at: [L / 2, 0, floorZ + (H - floorZ) / 2], color: u.kind === 'cab' ? '#1f2933' : u.color });
  body.push({ kind: 'box', size: [0.08, W, H - floorZ], at: [-L / 2, 0, floorZ + (H - floorZ) / 2], color: u.color });
  // Seats (rows on both sides, facing forward).
  const rows = Math.min(6, Math.floor((L - 6) / 2.2));
  for (let r = 0; r < rows; r++) {
    const x = -(L - 8) / 2 + r * 2.2;
    for (const side of [1, -1]) {
      body.push({ kind: 'box', size: [0.55, 1.0, 0.45], at: [x, side * (W / 2 - 0.7), floorZ + 0.35], color: '#3d5a80' });
      body.push({ kind: 'box', size: [0.12, 1.0, 0.9], at: [x - 0.25, side * (W / 2 - 0.7), floorZ + 0.95], color: '#3d5a80' });
    }
  }
  const doors: BodyPart[] = [];
  if (u.doors) {
    for (const side of [1, -1]) for (const ex of [1, -1]) doors.push({ kind: 'box', size: [1.4, 0.06, H - floorZ - 0.25], at: [ex * (L / 2 - 1.6), (side * W) / 2 + side * 0.06, floorZ + (H - floorZ) / 2 - 0.12], color: u.roof });
  }
  return { body, doors };
}

interface Unit { spec: UnitSpec; body: BodyModel; doors: BodyModel | null; centreOffset: number }

const scratchPos = new Cartesian3();
const scratchSample: PathSample = { lat: 0, lon: 0, headingDeg: 0, segment: 0, heightM: 0 };
const scratchSample2: PathSample = { lat: 0, lon: 0, headingDeg: 0, segment: 0, heightM: 0 };

/** A posed multi-unit train. `s` is the arc length of the front coupler; units trail behind along the track. */
export class TrainModel {
  readonly units: Unit[] = [];
  readonly totalLengthM: number;
  readonly boardingOffsetM: number;
  private doorOpen = 0;
  private lastHeight = 0;

  constructor(viewer: Viewer, readonly spec: TrainSpec) {
    let cum = 0;
    spec.units.forEach((u, i) => {
      const parts = coachParts(u);
      const centreOffset = cum + u.lengthM / 2;
      this.units.push({ spec: u, body: new BodyModel(viewer, parts.body), doors: parts.doors.length ? new BodyModel(viewer, parts.doors) : null, centreOffset });
      cum += u.lengthM + (i < spec.units.length - 1 ? spec.gapM : 0);
    });
    this.totalLengthM = cum;
    this.boardingOffsetM = this.units[spec.boardingUnit].centreOffset;
  }

  set show(v: boolean) { for (const u of this.units) { u.body.show = v; if (u.doors) u.doors.show = v; } }

  /** 0 closed … 1 open (panels slide along the coach). */
  setDoors(open: number): void { this.doorOpen = open; }
  get doorsOpen(): number { return this.doorOpen; }

  /** Poses every unit along the track for front-coupler arc length s; `groundLift` returns an extra minimum height. */
  pose(track: TrackRuntime, s: number, direction: 1 | -1, liftFloor: (lat: number, lon: number) => number | null): void {
    const line = track.line;
    for (const u of this.units) {
      const sc = s - direction * u.centreOffset;
      line.sample(sc, scratchSample);
      let h = track.heightAt(sc);
      const floor = liftFloor(scratchSample.lat, scratchSample.lon);
      if (!Number.isFinite(h)) h = floor !== null ? floor + 0.6 : this.lastHeight;
      else if (floor !== null && floor + 0.4 > h) h = floor + 0.4;
      this.lastHeight = h;
      // Pitch from the profile grade across the unit length.
      const half = u.spec.lengthM / 2;
      const hf = track.heightAt(sc + direction * half), hb = track.heightAt(sc - direction * half);
      const pitch = Number.isFinite(hf) && Number.isFinite(hb) ? Math.atan2(hf - hb, u.spec.lengthM) : 0;
      const heading = CMath.toRadians(direction > 0 ? scratchSample.headingDeg : scratchSample.headingDeg + 180);
      Cartesian3.fromDegrees(scratchSample.lon, scratchSample.lat, h, undefined, scratchPos);
      u.body.setPose(scratchPos, heading, pitch, 0);
      if (u.doors) {
        // Slide the door panels forward as they open (same primitive, translated along the coach axis).
        const slide = this.doorOpen * 1.35;
        line.sample(sc + direction * slide, scratchSample2);
        const dh = track.heightAt(sc + direction * slide);
        Cartesian3.fromDegrees(scratchSample2.lon, scratchSample2.lat, Number.isFinite(dh) ? Math.max(dh, h) : h, undefined, scratchPos);
        u.doors.setPose(scratchPos, heading, pitch, 0);
      }
    }
  }

  /** World position and heading of a unit's centre (for the passenger seat and exits). */
  unitPose(track: TrackRuntime, s: number, direction: 1 | -1, unit: number, out: Cartesian3): { position: Cartesian3; headingRad: number; lat: number; lon: number; heightM: number } {
    const u = this.units[unit];
    const sc = s - direction * u.centreOffset;
    track.line.sample(sc, scratchSample);
    let h = track.heightAt(sc);
    if (!Number.isFinite(h)) h = this.lastHeight;
    Cartesian3.fromDegrees(scratchSample.lon, scratchSample.lat, h, undefined, out);
    return { position: out, headingRad: CMath.toRadians(direction > 0 ? scratchSample.headingDeg : scratchSample.headingDeg + 180), lat: scratchSample.lat, lon: scratchSample.lon, heightM: h };
  }

  destroy(): void { for (const u of this.units) { u.body.destroy(); u.doors?.destroy(); } this.units.length = 0; }
}

export function cartoOf(p: Cartesian3): { lat: number; lon: number; heightM: number } {
  const c = Cartographic.fromCartesian(p);
  return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), heightM: c.height };
}
