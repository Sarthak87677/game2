/**
 * Marine journeys: the Gateway ↔ Mandwa (and Ferry Wharf ↔ Rewas) ferry with a deck camera, an arcade speedboat
 * checkpoint course off Alibaug (drive mode on a water height sampler, capped speed, virtual buoys) and the original
 * cruise ship "MV Terra Konkan" whose decks are a walkable moving level (deck height sampler + body translation).
 * Vessels, timetables and tickets are fictional; jetty positions are approximate.
 */
import { Cartesian3, Cartographic, Math as CMath, type Primitive } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { PORTS, PORTS_DATA_NOTE, portById, WATER_ROUTES } from '@/data/maharashtra';
import type { Port, WaterRoute } from '@/data/maharashtra/types';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { BodyModel, localToWorld, worldToLocal } from '@/gameplay/journeys/bodies';
import { distanceM, formatDuration, Polyline, type PathSample } from '@/gameplay/journeys/geo';
import { PassengerRig, scaleLabel, setStatus, timeScale, type SeatSpec } from '@/gameplay/journeys/passenger';
import { DEFAULT_DRIVE_PARAMS } from '@/modes/ModeController';
import { BOARDING_SPOT, DECK_Z, placeName, sampleDeck } from './cruiseDecks';
import { buoyParts, cruiseShipParts, FERRY_SEAT, FERRY_SEAT_BOW, ferryParts, speedboatParts } from './vessels';

type Phase = 'idle' | 'ferry' | 'ferry-arrived' | 'speedboat' | 'cruise';
const NOTE = 'Fictional vessels and tickets — simulated journey, no real money. Jetty positions approximate.';
const FERRY_MS = 9;
const CRUISE_MS = 10.3;
const FERRY_TIME_BASE = 2;
const CRUISE_TIME_BASE = 8;
const WATER_Z = 0;
const scratchA = new Cartesian3();
const scratchB = new Cartesian3();
const scratchC = new Cartesian3();
const sample: PathSample = { lat: 0, lon: 0, headingDeg: 0, segment: 0, heightM: 0 };

interface Voyage { route: WaterRoute; line: Polyline; s: number; from: Port; to: Port; model: BodyModel; position: Cartesian3; headingRad: number; bob: number }
interface Course { route: WaterRoute; line: Polyline; buoys: BodyModel[]; checkpoints: { lat: number; lon: number }[]; next: number; startMs: number; boat: BodyModel; disposeSampler: () => void; offWaterS: number; lastCheckpoint: { lat: number; lon: number } }

export class MarineSystem implements GameplaySystem {
  readonly id = 'marine';
  readonly label = 'Marine';
  private readonly rig: PassengerRig;
  private phase: Phase = 'idle';
  private voyage: Voyage | null = null;
  private course: Course | null = null;
  private cruise: (Voyage & { disposeSampler: () => void; playerZ: number; lastPos: Cartesian3; lastHeading: number; docked: boolean }) | null = null;
  private seat: SeatSpec = FERRY_SEAT;
  private readonly docked = new Map<string, BodyModel>();
  private readonly interactionsOut: Interaction[] = [];
  private lastStatus = '';
  private lastNear = 0;
  private savedDrive = { ...DEFAULT_DRIVE_PARAMS };
  private destroyed = false;

  constructor(private readonly engine: TerraEngine) {
    this.rig = new PassengerRig(engine);
  }

  // ─── Interactions ─────────────────────────────────────────────────────────────────────────────────────────────

  interactions(ctx: GameplayContext): Interaction[] {
    const out = this.interactionsOut;
    out.length = 0;
    const p = ctx.player;
    if (this.phase === 'ferry') { out.push({ id: 'ferry-options', label: 'Ferry options', lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 1, modes: ['passenger'], run: () => this.showFerryOverlay() }); return out; }
    if (this.phase === 'ferry-arrived') { out.push({ id: 'ferry-leave', label: `Step off at ${this.voyage!.to.name}`, lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 5, modes: ['passenger'], run: () => this.leaveFerry() }); return out; }
    if (this.phase === 'speedboat') { out.push({ id: 'speedboat-exit', label: 'End the speedboat course', lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 0, modes: ['drive'], run: () => this.endCourse(false) }); return out; }
    if (this.phase === 'cruise') { out.push({ id: 'cruise-options', label: 'Cruise options', lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 0, modes: ['walk'], run: () => this.showCruiseOverlay() }); return out; }
    for (const r of WATER_ROUTES) {
      if (r.vessel === 'ferry') {
        for (const [from, to, reverse] of [[r.from, r.to, false], [r.to, r.from, true]] as const) {
          const port = portById(from)!;
          if (distanceM(p, port) > 220) continue;
          out.push({ id: `ferry-${r.id}-${from}`, label: `Board ferry to ${portById(to)!.name}`, lat: port.lat, lon: port.lon, radiusM: 220, priority: 2, run: () => this.showFerryTicket(r, reverse) });
        }
      } else if (r.vessel === 'speedboat') {
        const port = portById(r.from)!;
        if (distanceM(p, port) <= 220) out.push({ id: `speedboat-${r.id}`, label: `Take the speedboat course (${r.name})`, lat: port.lat, lon: port.lon, radiusM: 220, priority: 1, run: () => this.showSpeedboatOverlay(r) });
      } else {
        const port = portById(r.from)!;
        if (distanceM(p, port) <= 260) out.push({ id: `cruise-${r.id}`, label: 'Board the cruise ship MV Terra Konkan', lat: port.lat, lon: port.lon, radiusM: 260, priority: 2, run: () => this.showCruiseTicket(r) });
      }
    }
    return out;
  }

  // ─── Ferry ───────────────────────────────────────────────────────────────────────────────────────────────────

  private routeLine(route: WaterRoute, reverse: boolean): Polyline {
    return new Polyline(reverse ? [...route.path].reverse() : route.path).densify(60);
  }

  private showFerryTicket(route: WaterRoute, reverse: boolean): void {
    const from = portById(reverse ? route.to : route.from)!, to = portById(reverse ? route.from : route.to)!;
    const line = this.routeLine(route, reverse);
    const lines = [`${from.name} → ${to.name}`, `${(line.lengthM / 1000).toFixed(1)} km · about ${formatDuration(line.lengthM / FERRY_MS)} at ${Math.round(FERRY_MS * 1.944)} kn (simulated)`, 'Fare: 0 — fictional in-game ticket.', PORTS_DATA_NOTE];
    this.engine.gameplay.showOverlay({ title: 'Ferry ticket', lines, actions: [{ id: 'deck', label: 'Board — open deck (port side)' }, { id: 'bow', label: 'Board — bow rail' }, { id: 'close', label: 'Not now' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'close') return;
      this.seat = id === 'bow' ? FERRY_SEAT_BOW : FERRY_SEAT;
      this.boardFerry(route, from, to, line);
    });
  }

  private boardFerry(route: WaterRoute, from: Port, to: Port, line: Polyline): void {
    const key = `${route.id}:${from.id}`;
    const model = this.docked.get(key) ?? new BodyModel(this.engine.viewer, ferryParts());
    this.docked.delete(key);
    model.show = true;
    this.voyage = { route, line, s: 0, from, to, model, position: new Cartesian3(), headingRad: 0, bob: 0 };
    this.phase = 'ferry';
    this.rig.enter();
    this.stepFerry(0, 0);
  }

  private showFerryOverlay(): void {
    const v = this.voyage!;
    this.engine.gameplay.showOverlay({ title: `Ferry to ${v.to.name}`, lines: [this.ferryStatus(), `Time compression ×${timeScale(this.engine, FERRY_TIME_BASE).toFixed(1)} ([ and ] adjust)`], actions: [{ id: 'skip', label: `Skip to arrival at ${v.to.name}` }, { id: 'seat', label: this.seat === FERRY_SEAT ? 'Move to the bow rail' : 'Move to the open deck' }, { id: 'continue', label: 'Continue' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'skip') { v.s = v.line.lengthM; this.stepFerry(0, 0); }
      else if (id === 'seat') this.seat = this.seat === FERRY_SEAT ? FERRY_SEAT_BOW : FERRY_SEAT;
    });
  }

  private stepFerry(simDt: number, realDt: number): void {
    const v = this.voyage!;
    const arrived = v.s >= v.line.lengthM - 0.5;
    if (!arrived) {
      // Slow down for the last 120 m and the first 60 m (leaving the jetty).
      const remaining = v.line.lengthM - v.s;
      const speed = FERRY_MS * Math.min(1, Math.max(0.15, remaining / 120), Math.max(0.25, (v.s + 15) / 60));
      v.s = Math.min(v.line.lengthM, v.s + speed * simDt);
    }
    v.bob += realDt * 0.9;
    v.line.sample(v.s, sample);
    const z = WATER_Z + Math.sin(v.bob) * 0.18;
    Cartesian3.fromDegrees(sample.lon, sample.lat, z, undefined, v.position);
    v.headingRad = CMath.toRadians(sample.headingDeg);
    const roll = Math.sin(v.bob * 0.7) * 0.02, pitch = Math.cos(v.bob * 0.5) * 0.012;
    v.model.setPose(v.position, v.headingRad, pitch, roll);
    this.rig.seat(v.position, v.headingRad, this.seat, pitch, roll);
    if (arrived && this.phase === 'ferry') {
      this.phase = 'ferry-arrived';
      this.status(`Ferry alongside ${v.to.name} · press E to step off`);
      this.engine.gameplay.showOverlay({ title: `Arrived at ${v.to.name}`, lines: ['The ferry is alongside the jetty.'], actions: [{ id: 'leave', label: 'Step off the ferry' }, { id: 'stay', label: 'Stay aboard a moment' }], note: NOTE }, (id) => { this.engine.gameplay.closeOverlay(); if (id === 'leave') this.leaveFerry(); });
    } else if (this.phase === 'ferry') this.status(this.ferryStatus() + scaleLabel(timeScale(this.engine, FERRY_TIME_BASE)));
  }

  private ferryStatus(): string {
    const v = this.voyage!;
    const remaining = v.line.lengthM - v.s;
    return `Aboard the ${v.from.name.split(' ')[0]}–${v.to.name.split(' ')[0]} ferry → ${v.to.name} · ${(remaining / 1000).toFixed(1)} km · ${formatDuration(remaining / FERRY_MS)}`;
  }

  private leaveFerry(): void {
    const v = this.voyage;
    if (!v) return;
    this.rig.exit(v.to.lat, v.to.lon, CMath.toDegrees(v.headingRad) + 90);
    // The ferry stays docked at the arrival jetty for the return trip.
    this.docked.set(`${v.route.id}:${v.to.id}`, v.model);
    this.voyage = null;
    this.phase = 'idle';
    setStatus(null);
  }

  // ─── Speedboat course ─────────────────────────────────────────────────────────────────────────────────────────

  private showSpeedboatOverlay(route: WaterRoute): void {
    const line = new Polyline(route.path);
    this.engine.gameplay.showOverlay({ title: route.name, lines: [`${route.path.length - 1} virtual buoys · ${(line.lengthM / 1000).toFixed(1)} km lap · top speed 60 km/h (capped)`, 'Arcade activity: W/S throttle, A/D steer, Space brake. Not a boating course.', PORTS_DATA_NOTE], actions: [{ id: 'go', label: 'Start the course' }, { id: 'close', label: 'Not now' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'go') this.startCourse(route);
    });
  }

  private startCourse(route: WaterRoute): void {
    const line = new Polyline(route.path);
    const checkpoints = route.path.slice(1);
    const buoys = checkpoints.map((c) => { const b = new BodyModel(this.engine.viewer, buoyParts(), { shadows: false }); b.setPose(Cartesian3.fromDegrees(c.lon, c.lat, WATER_Z), 0, 0, 0); b.show = true; return b; });
    const boat = new BodyModel(this.engine.viewer, speedboatParts());
    const modes = this.engine.modes;
    this.savedDrive = { ...modes.driveParams };
    const disposeSampler = modes.addHeightSampler(() => WATER_Z + 0.35);
    const start = route.path[0];
    // Launch 60 m out from the jetty along the first leg.
    line.sample(60, sample);
    modes.setMode('drive');
    modes.setBody(sample.lat, sample.lon, sample.headingDeg, WATER_Z + 0.35);
    modes.driveParams = { accelMs2: 4.5, maxSpeedMs: 16.7, turnRate: 1.3, eyeHeightM: 1.25, followBackM: 11, followUpM: 3.8 };
    modes.setVehicleBody(boat.primitive as Primitive);
    modes.setView('third');
    this.course = { route, line, buoys, checkpoints, next: 0, startMs: performance.now(), boat, disposeSampler, offWaterS: 0, lastCheckpoint: start };
    this.phase = 'speedboat';
    this.status(`Speedboat course · buoy 1/${checkpoints.length} · 0:00`);
  }

  private stepCourse(ctx: GameplayContext): void {
    const c = this.course!;
    const p = ctx.player;
    const elapsed = (ctx.nowMs - c.startMs) / 1000;
    const cp = c.checkpoints[c.next];
    if (cp && distanceM(p, cp) < 32) {
      c.buoys[c.next].show = false;
      c.lastCheckpoint = cp;
      c.next++;
      if (c.next >= c.checkpoints.length) { this.finishCourse(elapsed); return; }
    }
    // Ran aground: after two seconds on land, back to the last buoy.
    const ground = this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat));
    if (ground !== undefined && ground > WATER_Z + 1.2) { c.offWaterS += ctx.dt; if (c.offWaterS > 2) { c.offWaterS = 0; this.engine.modes.setBody(c.lastCheckpoint.lat, c.lastCheckpoint.lon, undefined, WATER_Z + 0.35); this.status('Back on the water — returned to the last buoy'); return; } }
    else c.offWaterS = 0;
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    this.status(`Speedboat course · buoy ${c.next + 1}/${c.checkpoints.length} · ${m}:${String(s).padStart(2, '0')} · ${Math.round(this.engine.modes.getState().groundSpeedMs * 3.6)} km/h`);
  }

  private finishCourse(elapsed: number): void {
    const m = Math.floor(elapsed / 60), s = (elapsed % 60).toFixed(1);
    this.status(`Course complete · ${m}:${s.padStart(4, '0')}`);
    this.engine.gameplay.showOverlay({ title: 'Course complete', lines: [`Lap time ${m}:${s.padStart(4, '0')} (arcade, fictional course).`], actions: [{ id: 'again', label: 'Run it again' }, { id: 'jetty', label: 'Return to Mandwa jetty' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      const route = this.course!.route;
      this.endCourse(true);
      if (id === 'again') this.startCourse(route);
    });
  }

  private endCourse(silent: boolean): void {
    const c = this.course;
    if (!c) return;
    const modes = this.engine.modes;
    c.disposeSampler();
    modes.setVehicleBody(null);
    modes.driveParams = { ...this.savedDrive };
    for (const b of c.buoys) b.destroy();
    c.boat.destroy();
    const jetty = portById(c.route.from)!;
    modes.setMode('walk');
    modes.setBody(jetty.lat, jetty.lon, 0);
    this.course = null;
    this.phase = 'idle';
    setStatus(null);
    if (!silent) this.status('');
  }

  // ─── Cruise ship ─────────────────────────────────────────────────────────────────────────────────────────────

  private showCruiseTicket(route: WaterRoute): void {
    const line = new Polyline(route.path);
    const lines = [`MV Terra Konkan (original in-game design) · ${(line.lengthM / 1000).toFixed(0)} km Konkan-coast loop from Ballard Pier`, `About ${formatDuration(line.lengthM / CRUISE_MS)} at 20 kn (simulated, time-compressed ×${CRUISE_TIME_BASE}).`, 'Public decks: Promenade (restaurant, music lounge, theatre), Lido (pool, cabins, aft lounge), Sky (viewing deck). Walk anywhere; stairs are the ramps on the centre line.', 'Fare: 0 — fictional boarding pass, fictional cabin 407.', PORTS_DATA_NOTE];
    this.engine.gameplay.showOverlay({ title: 'Cruise boarding pass', lines, actions: [{ id: 'board', label: 'Board at Ballard Pier' }, { id: 'close', label: 'Not now' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'board') this.boardCruise(route);
    });
  }

  private boardCruise(route: WaterRoute): void {
    const line = this.routeLine(route, false);
    const from = portById(route.from)!, to = portById(route.to)!;
    const model = new BodyModel(this.engine.viewer, cruiseShipParts());
    model.show = true;
    const position = new Cartesian3();
    line.sample(0, sample);
    Cartesian3.fromDegrees(sample.lon, sample.lat, WATER_Z, undefined, position);
    const headingRad = CMath.toRadians(sample.headingDeg);
    model.setPose(position, headingRad, 0, 0);
    const modes = this.engine.modes;
    // The decks are an interior-like level moving with the ship: while aboard they replace terrain, buildings and
    // other samplers (groundOverride) so quay buildings never lift the walker; falls back to an additive sampler when
    // another system already owns the override.
    let disposeSampler: () => void;
    if (!modes.groundOverride) {
      const fn = (lat: number, lon: number) => this.cruiseDeckHeight(lat, lon);
      modes.groundOverride = fn;
      disposeSampler = () => { if (modes.groundOverride === fn) modes.groundOverride = null; };
    } else disposeSampler = modes.addHeightSampler((lat, lon) => this.cruiseDeckHeight(lat, lon));
    this.cruise = { route, line, s: 0, from, to, model, position, headingRad, bob: 0, disposeSampler, playerZ: BOARDING_SPOT.z, lastPos: Cartesian3.clone(position), lastHeading: headingRad, docked: true };
    this.phase = 'cruise';
    this.placeOnDeck(BOARDING_SPOT.x, BOARDING_SPOT.y, BOARDING_SPOT.z);
    this.status(`Aboard MV Terra Konkan · leaving ${from.name}`);
  }

  /** Deck height sampler: converts the query point into ship-local coordinates and asks the deck layout. */
  private cruiseDeckHeight(lat: number, lon: number): number | null {
    const c = this.cruise;
    if (!c) return null;
    const world = Cartesian3.fromDegrees(lon, lat, c.playerZ, undefined, scratchA);
    const local = worldToLocal(c.position, c.headingRad, world, scratchB);
    const h = sampleDeck(local.x, local.y, c.playerZ);
    if (h === null) return null;
    // Deck heights are relative to the waterline: translate to ellipsoid height at that spot.
    return Cartographic.fromCartesian(localToWorld(c.position, c.headingRad, local.x, local.y, h, scratchC)).height;
  }

  private placeOnDeck(x: number, y: number, z: number): void {
    const c = this.cruise!;
    c.playerZ = z;
    const world = localToWorld(c.position, c.headingRad, x, y, z, scratchA);
    const carto = Cartographic.fromCartesian(world);
    const modes = this.engine.modes;
    modes.setMode('walk');
    modes.setBody(CMath.toDegrees(carto.latitude), CMath.toDegrees(carto.longitude), CMath.toDegrees(c.headingRad), carto.height);
    modes.setView('first');
  }

  private showCruiseOverlay(): void {
    const c = this.cruise!;
    const remaining = c.line.lengthM - c.s;
    const lines = [this.cruiseStatus(), `Time compression ×${timeScale(this.engine, CRUISE_TIME_BASE).toFixed(1)} ([ and ] adjust)`];
    const actions = [
      { id: 'leg', label: 'Skip ahead (one sixth of the loop)', disabled: remaining < 1000 },
      { id: 'skip', label: 'Skip to arrival back at Ballard Pier', disabled: remaining < 1000 },
      { id: 'disembark', label: c.docked ? 'Disembark at Ballard Pier' : 'Disembark (only when docked)', disabled: !c.docked },
      { id: 'continue', label: 'Continue the cruise' },
    ];
    this.engine.gameplay.showOverlay({ title: 'MV Terra Konkan', lines, actions, note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'leg') c.s = Math.min(c.line.lengthM, c.s + c.line.lengthM / 6);
      else if (id === 'skip') c.s = c.line.lengthM;
      else if (id === 'disembark') this.leaveCruise();
    });
  }

  private stepCruise(ctx: GameplayContext, simDt: number): void {
    const c = this.cruise!;
    const modes = this.engine.modes;
    const arrived = c.s >= c.line.lengthM - 0.5;
    if (!arrived) {
      const remaining = c.line.lengthM - c.s;
      const speed = CRUISE_MS * Math.min(1, Math.max(0.1, remaining / 400), Math.max(0.2, (c.s + 40) / 300));
      c.s = Math.min(c.line.lengthM, c.s + speed * simDt);
    }
    c.docked = c.s < 120 || arrived;
    // Player's ship-local coordinates before the ship moves.
    const body = modes.bodyPosition();
    const localBefore = worldToLocal(c.lastPos, c.lastHeading, body, scratchA);
    c.line.sample(c.s, sample);
    Cartesian3.fromDegrees(sample.lon, sample.lat, WATER_Z, undefined, c.position);
    c.headingRad = CMath.toRadians(sample.headingDeg);
    c.model.setPose(c.position, c.headingRad, 0, 0);
    // Carry the walker with the ship: same local coordinates under the new pose.
    const after = localToWorld(c.position, c.headingRad, localBefore.x, localBefore.y, localBefore.z, scratchB);
    Cartesian3.subtract(after, body, scratchC);
    if (Cartesian3.magnitude(scratchC) > 0) modes.translateBody(scratchC);
    Cartesian3.clone(c.position, c.lastPos);
    c.lastHeading = c.headingRad;
    const local = worldToLocal(c.position, c.headingRad, modes.bodyPosition(), scratchA);
    c.playerZ = local.z;
    // Overboard (or fell through the sea): back to the promenade deck.
    if (sampleDeck(local.x, local.y, DECK_Z[2] + 1) === null || local.z < DECK_Z[0] - 4) { this.placeOnDeck(BOARDING_SPOT.x, BOARDING_SPOT.y, BOARDING_SPOT.z); this.status('Back on deck (railings and fade-to-respawn keep everyone aboard)'); return; }
    void ctx;
    this.status(this.cruiseStatus() + scaleLabel(timeScale(this.engine, CRUISE_TIME_BASE)));
  }

  private cruiseStatus(): string {
    const c = this.cruise!;
    const modes = this.engine.modes;
    const local = worldToLocal(c.position, c.headingRad, modes.bodyPosition(), scratchA);
    const where = placeName(local.x, local.y, c.playerZ);
    const remaining = c.line.lengthM - c.s;
    if (remaining < 1) return `MV Terra Konkan · docked at ${c.to.name} · ${where}`;
    return `Aboard MV Terra Konkan · ${nearestPortLabel(sample)} · ${(remaining / 1000).toFixed(0)} km to ${c.to.name} · ${where}`;
  }

  private leaveCruise(): void {
    const c = this.cruise;
    if (!c) return;
    c.disposeSampler();
    c.model.destroy();
    this.cruise = null;
    this.phase = 'idle';
    this.rig.exit(c.to.lat, c.to.lon, 0);
    setStatus(null);
  }

  // ─── Per-frame ────────────────────────────────────────────────────────────────────────────────────────────────

  update(ctx: GameplayContext): void {
    if (this.destroyed) return;
    const mode = ctx.player.mode;
    if ((this.phase === 'ferry' || this.phase === 'ferry-arrived') && this.voyage) {
      if (mode !== 'passenger') { this.abandonFerry(); return; }
      this.stepFerry(ctx.dt * timeScale(this.engine, FERRY_TIME_BASE), ctx.dt);
    } else if (this.phase === 'speedboat' && this.course) {
      if (mode !== 'drive') { this.endCourse(true); return; }
      this.stepCourse(ctx);
    } else if (this.phase === 'cruise' && this.cruise) {
      if (mode !== 'walk') { this.leaveCruise(); return; }
      this.stepCruise(ctx, ctx.dt * timeScale(this.engine, CRUISE_TIME_BASE));
    }
    if (ctx.nowMs - this.lastNear > 1500) { this.lastNear = ctx.nowMs; this.updateDocked(ctx.player.lat, ctx.player.lon); }
  }

  /** Docked ferries at the jetties near the player (so there is something to look at and to board). */
  private updateDocked(lat: number, lon: number): void {
    for (const r of WATER_ROUTES) {
      if (r.vessel !== 'ferry') continue;
      for (const [portId, reverse] of [[r.from, false], [r.to, true]] as const) {
        const key = `${r.id}:${portId}`;
        const port = portById(portId)!;
        const near = distanceM({ lat, lon }, port) < 1200;
        const existing = this.docked.get(key);
        if (near && !existing) {
          const line = this.routeLine(r, reverse);
          line.sample(0, sample);
          const m = new BodyModel(this.engine.viewer, ferryParts());
          m.setPose(Cartesian3.fromDegrees(sample.lon, sample.lat, WATER_Z), CMath.toRadians(sample.headingDeg), 0, 0);
          m.show = true;
          this.docked.set(key, m);
        } else if (!near && existing) { existing.destroy(); this.docked.delete(key); }
      }
    }
  }

  private abandonFerry(): void {
    const v = this.voyage;
    if (v) { this.docked.set(`${v.route.id}:${v.to.id}`, v.model); }
    this.voyage = null; this.phase = 'idle'; setStatus(null);
  }

  private status(s: string): void { if (s !== this.lastStatus) { this.lastStatus = s; setStatus(s || null); } }

  onSpawn(lat: number, lon: number): void { this.updateDocked(lat, lon); }

  stats(): Record<string, string | number> {
    return { phase: this.phase, docked: this.docked.size, ferryS: this.voyage ? Math.round(this.voyage.s) : 0, cruiseS: this.cruise ? Math.round(this.cruise.s) : 0, buoysLeft: this.course ? this.course.checkpoints.length - this.course.next : 0 };
  }

  /** Test hook. */
  debug(): { phase: Phase; ferry: { s: number; lengthM: number; to: string } | null; cruise: { s: number; lengthM: number; playerZ: number; docked: boolean; place: string } | null; course: { next: number; total: number } | null } {
    const c = this.cruise;
    let place = '';
    if (c) { const local = worldToLocal(c.position, c.headingRad, this.engine.modes.bodyPosition(), scratchA); place = placeName(local.x, local.y, c.playerZ); }
    return {
      phase: this.phase,
      ferry: this.voyage ? { s: this.voyage.s, lengthM: this.voyage.line.lengthM, to: this.voyage.to.id } : null,
      cruise: c ? { s: c.s, lengthM: c.line.lengthM, playerZ: c.playerZ, docked: c.docked, place } : null,
      course: this.course ? { next: this.course.next, total: this.course.checkpoints.length } : null,
    };
  }

  /** Probe hook: advance the cruise ship along its loop (0..1) or teleport the walker to a ship-local spot. */
  debugCruise(fraction?: number, spot?: { x: number; y: number; z: number }): void {
    const c = this.cruise;
    if (!c) return;
    if (fraction !== undefined) c.s = Math.max(0, Math.min(1, fraction)) * c.line.lengthM;
    if (spot) this.placeOnDeck(spot.x, spot.y, spot.z);
  }

  destroy(): void {
    this.destroyed = true;
    this.voyage?.model.destroy();
    if (this.course) this.endCourse(true);
    if (this.cruise) { this.cruise.disposeSampler(); this.cruise.model.destroy(); }
    for (const m of this.docked.values()) m.destroy();
    this.docked.clear();
  }
}

function nearestPortLabel(p: { lat: number; lon: number }): string {
  let best: Port | null = null, bd = Infinity;
  for (const port of PORTS) { const d = distanceM(p, port); if (d < bd) { bd = d; best = port; } }
  return best ? `${(bd / 1000).toFixed(0)} km off ${best.name.replace(/ jetty| harbour|Mumbai cruise terminal \(|\)/g, '')}` : 'at sea';
}

