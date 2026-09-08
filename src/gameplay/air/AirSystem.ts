/**
 * Air journeys: enter an airport terminal → destination choice (check-in style) → abstract security → gate → board an
 * original primitive-built airliner → taxi, take-off, climb, great-circle cruise, descent, landing, taxi → leave at
 * the destination terminal. Window or cabin camera, time-compressed (Mumbai–Pune ≈ 3 min real time, [ ] adjusts),
 * "Skip to arrival" fast travel. Flights, gates and airlines are fictional; airport positions are approximate.
 */
import { Cartesian3, Cartographic, Math as CMath } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { AIRPORTS, AIRPORTS_DATA_NOTE, airportById } from '@/data/maharashtra';
import type { Airport } from '@/data/maharashtra/types';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { BodyModel } from '@/gameplay/journeys/bodies';
import { bearingDeg, destinationPoint, distanceM, formatDuration } from '@/gameplay/journeys/geo';
import { PassengerRig, scaleLabel, setStatus, timeScale, type SeatSpec } from '@/gameplay/journeys/passenger';
import { hash01 } from '@/gameplay/journeys/schedule';
import { AIRCRAFT_GEAR_HEIGHT_M, AircraftModel, airportSceneryParts, terminalParts } from './aircraftModel';
import { defaultCompression, emptyFlightState, FlightPlan, type FlightPhase, type FlightState } from './flightPlan';

type Phase = 'idle' | 'terminal' | 'aboard' | 'arrived';
const SEATS: Record<'window' | 'cabin', SeatSpec> = {
  window: { forward: 4, left: -1.4, up: 0.8, lookDeg: 70, label: 'Window seat' },
  cabin: { forward: -9, left: 0, up: 0.85, lookDeg: 0, label: 'Cabin (aisle view)' },
};
const NOTE = 'Fictional airline, flight numbers, gates and timings — simulated journey, no real money. Airport positions approximate.';
const PHASE_LABEL: Record<FlightPhase, string> = { 'taxi-out': 'taxiing to the runway', takeoff: 'taking off', climb: 'climbing', cruise: 'cruising', descent: 'descending', landing: 'landing', 'taxi-in': 'taxiing to the gate', arrived: 'at the gate' };
const scratchPos = new Cartesian3();

interface Scenery { airport: Airport; runway: BodyModel; terminal: BodyModel }

export class AirSystem implements GameplaySystem {
  readonly id = 'air';
  readonly label = 'Air';
  private readonly rig: PassengerRig;
  private phase: Phase = 'idle';
  private airport: Airport | null = null;
  private dest: Airport | null = null;
  private plan: FlightPlan | null = null;
  private model: AircraftModel | null = null;
  private readonly state: FlightState = emptyFlightState();
  private seat: SeatSpec = SEATS.window;
  private flightNo = '';
  private gate = 1;
  private readonly scenery = new Map<string, Scenery>();
  private readonly interactionsOut: Interaction[] = [];
  private lastStatus = '';
  private lastSceneryCheck = 0;
  private destroyed = false;

  constructor(private readonly engine: TerraEngine) {
    this.rig = new PassengerRig(engine);
  }

  interactions(ctx: GameplayContext): Interaction[] {
    const out = this.interactionsOut;
    out.length = 0;
    const p = ctx.player;
    if (this.phase === 'aboard') {
      out.push({ id: 'air-options', label: 'Flight options', lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 1, modes: ['passenger'], run: () => this.showFlightOverlay() });
      return out;
    }
    if (this.phase === 'arrived') {
      out.push({ id: 'air-leave', label: `Leave aircraft at ${this.dest?.iata ?? ''}`, lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 5, modes: ['passenger'], run: () => this.leaveAircraft() });
      return out;
    }
    for (const a of AIRPORTS) {
      const d = distanceM(p, a.terminal);
      if (d > 350) continue;
      out.push({ id: `air-terminal-${a.id}`, label: `Enter terminal · ${a.iata} ${a.city}`, lat: a.terminal.lat, lon: a.terminal.lon, radiusM: 350, priority: 1, run: () => this.enterTerminal(a) });
    }
    return out;
  }

  // ─── Terminal flow ────────────────────────────────────────────────────────────────────────────────────────────

  private enterTerminal(a: Airport): void {
    if (this.phase === 'aboard') return;
    this.airport = a;
    this.phase = 'terminal';
    this.ensureScenery(a);
    const here = this.engine.gameplay.player();
    if (distanceM(here, a.terminal) > 40 || !here.embodied) this.engine.gameplay.teleport(a.terminal.lat, a.terminal.lon, bearingDeg(a.terminal, a));
    this.showDepartures();
  }

  private showDepartures(): void {
    const a = this.airport!;
    const options = AIRPORTS.filter((x) => x.id !== a.id).sort((x, y) => distanceM(a, x) - distanceM(a, y));
    const lines = options.map((d) => `${this.flightNumber(a, d)} → ${d.iata} ${d.city}${d.external ? ' (outside Maharashtra)' : ''} · ${Math.round(distanceM(a, d) / 1000)} km`);
    lines.push(AIRPORTS_DATA_NOTE);
    const actions = options.slice(0, 4).map((d) => ({ id: `to-${d.id}`, label: `Check in → ${d.iata} ${d.city}` }));
    if (options.length > 4) actions.push({ id: 'more', label: 'More destinations…' });
    actions.push({ id: 'close', label: 'Leave the terminal' });
    this.engine.gameplay.showOverlay({ title: `${a.iata} ${a.name} — departures`, lines, actions, note: NOTE }, (id) => {
      if (id.startsWith('to-')) this.showCheckIn(airportById(id.slice(3))!);
      else if (id === 'more') this.showMoreDestinations(options.slice(4));
      else this.engine.gameplay.closeOverlay();
    });
  }

  private showMoreDestinations(rest: Airport[]): void {
    const actions = rest.slice(0, 4).map((d) => ({ id: `to-${d.id}`, label: `Check in → ${d.iata} ${d.city}` }));
    actions.push({ id: 'back', label: 'Back' });
    this.engine.gameplay.showOverlay({ title: 'More destinations', lines: rest.map((d) => `${d.iata} ${d.name}`), actions, note: NOTE }, (id) => {
      if (id.startsWith('to-')) this.showCheckIn(airportById(id.slice(3))!);
      else this.showDepartures();
    });
  }

  private flightNumber(a: Airport, d: Airport): string {
    return `TI ${100 + Math.floor(hash01(`${a.id}>${d.id}`) * 800)}`;
  }

  private showCheckIn(dest: Airport): void {
    const a = this.airport!;
    this.dest = dest;
    this.flightNo = this.flightNumber(a, dest);
    this.gate = 1 + Math.floor(hash01(`${a.id}:${dest.id}:gate`) * 12);
    const lines = [`${this.flightNo} ${a.iata} → ${dest.iata} (${dest.city})`, `Great-circle distance ${Math.round(distanceM(a, dest) / 1000)} km · Terra Air (fictional)`, 'Choose your seat:'];
    this.engine.gameplay.showOverlay({ title: 'Check-in', lines, actions: [{ id: 'window', label: 'Window seat' }, { id: 'cabin', label: 'Cabin seat (aisle view)' }, { id: 'back', label: 'Back to departures' }], note: NOTE }, (id) => {
      if (id === 'back') { this.showDepartures(); return; }
      this.seat = id === 'cabin' ? SEATS.cabin : SEATS.window;
      this.showSecurity();
    });
  }

  private showSecurity(): void {
    this.engine.gameplay.showOverlay({ title: 'Security', lines: ['Bags on the belt, boarding pass ready — an abstract transition, nothing is inspected.', `Gate ${this.gate} is straight ahead.`], actions: [{ id: 'go', label: 'Proceed to the gate' }], note: NOTE }, () => this.showGate());
  }

  private showGate(): void {
    const a = this.airport!, d = this.dest!;
    this.engine.gameplay.showOverlay({ title: `Gate ${this.gate} — ${this.flightNo} to ${d.iata}`, lines: [`Boarding ${this.flightNo} ${a.iata} → ${d.iata}. ${this.seat.label}.`, 'The flight is time-compressed; press [ or ] aboard to slow down or speed up, E for options.'], actions: [{ id: 'board', label: 'Board the aircraft' }, { id: 'wait', label: 'Wait at the gate' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'board') void this.board();
    });
  }

  private async board(): Promise<void> {
    const a = this.airport!, d = this.dest!;
    const [g0, g1] = await Promise.all([this.groundAt(a), this.groundAt(d)]);
    if (this.destroyed || this.phase === 'aboard') return;
    this.plan = new FlightPlan(a, d, { originGroundM: g0, destGroundM: g1 });
    this.ensureScenery(d, g1);
    this.model?.destroy();
    this.model = new AircraftModel(this.engine.viewer);
    this.model.show = true;
    this.phase = 'aboard';
    this.rig.enter();
    this.step(0);
  }

  private async groundAt(a: Airport): Promise<number> {
    try {
      const h = await Promise.race([this.engine.terrainHeight(a.lat, a.lon), new Promise<number>((r) => window.setTimeout(() => r(NaN), 8000))]);
      return Number.isFinite(h) ? Math.max(0, h) : Math.max(0, this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(a.lon, a.lat)) ?? 0);
    } catch { return 0; }
  }

  private showFlightOverlay(): void {
    const p = this.plan!;
    const lines = [this.statusLine(), `Time compression ×${timeScale(this.engine, defaultCompression(p)).toFixed(1)} (adjust with [ and ])`];
    this.engine.gameplay.showOverlay({ title: `Aboard ${this.flightNo}`, lines, actions: [{ id: 'skip', label: `Skip to arrival at ${this.dest!.iata}` }, { id: 'seat', label: this.seat === SEATS.window ? 'Move to the cabin seat' : 'Move to the window seat' }, { id: 'continue', label: 'Continue the flight' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'skip') this.skipToArrival();
      else if (id === 'seat') this.seat = this.seat === SEATS.window ? SEATS.cabin : SEATS.window;
    });
  }

  private skipToArrival(): void {
    if (!this.plan) return;
    this.plan.setTime(this.plan.totalS);
    this.step(0);
  }

  private arrive(): void {
    this.phase = 'arrived';
    this.engine.gameplay.showOverlay({ title: `Arrived at ${this.dest!.iata} ${this.dest!.city}`, lines: [`${this.flightNo} is at the gate. Thank you for flying (fictionally) with Terra Air.`], actions: [{ id: 'leave', label: 'Leave the aircraft' }, { id: 'stay', label: 'Stay seated a moment' }], note: NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'leave') this.leaveAircraft();
    });
  }

  private leaveAircraft(): void {
    const d = this.dest;
    if (!d) return;
    const exit = destinationPoint(d.terminal, bearingDeg(d.terminal, d), 25);
    this.rig.exit(exit.lat, exit.lon, bearingDeg(exit, d.terminal));
    this.model?.destroy(); this.model = null;
    this.plan = null;
    this.phase = 'idle';
    this.airport = d;
    this.dest = null;
    setStatus(null);
  }

  private abandon(): void {
    this.model?.destroy(); this.model = null;
    this.plan = null; this.phase = 'idle'; this.dest = null;
    setStatus(null);
  }

  // ─── Per-frame ────────────────────────────────────────────────────────────────────────────────────────────────

  update(ctx: GameplayContext): void {
    if (this.destroyed) return;
    if ((this.phase === 'aboard' || this.phase === 'arrived') && ctx.player.mode !== 'passenger') { this.abandon(); return; }
    if (this.phase === 'aboard' && this.plan) this.step(ctx.dt * timeScale(this.engine, defaultCompression(this.plan)));
    else if (this.phase === 'arrived') this.step(0);
    if (ctx.nowMs - this.lastSceneryCheck > 2000) {
      this.lastSceneryCheck = ctx.nowMs;
      for (const [id, s] of this.scenery) {
        const keep = this.airport?.id === id || this.dest?.id === id || distanceM(ctx.player, s.airport) < 25_000;
        if (!keep) { s.runway.destroy(); s.terminal.destroy(); this.scenery.delete(id); }
      }
    }
  }

  private step(simDt: number): void {
    const plan = this.plan!;
    const st = plan.advance(simDt, this.state);
    const ground = this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(st.lon, st.lat));
    let alt = st.altM;
    if (ground !== undefined && alt < ground + 0.3) alt = ground + 0.3;
    Cartesian3.fromDegrees(st.lon, st.lat, alt + AIRCRAFT_GEAR_HEIGHT_M, undefined, scratchPos);
    const heading = CMath.toRadians(st.headingDeg), pitch = CMath.toRadians(st.pitchDeg), roll = CMath.toRadians(st.rollDeg);
    if (this.model) { this.model.setPose(scratchPos, heading, pitch, roll); this.model.setGear(st.gearDown); }
    this.rig.seat(scratchPos, heading, this.seat, pitch, roll);
    if (this.phase === 'aboard') {
      this.status(this.statusLine() + scaleLabel(timeScale(this.engine, defaultCompression(plan))));
      if (st.phase === 'arrived') this.arrive();
    }
  }

  private statusLine(): string {
    const st = this.state, a = this.airport!, d = this.dest!;
    const alt = Math.round(Math.max(0, st.altM - this.plan!.opts.originGroundM) / 50) * 50;
    return `Aboard ${this.flightNo} ${a.iata} → ${d.iata} · ${PHASE_LABEL[st.phase]} · ${alt.toLocaleString('en-IN')} m · ${Math.round(st.speedMs * 3.6)} km/h · ${formatDuration(st.remainingS)} to the gate`;
  }

  private status(s: string): void { if (s !== this.lastStatus) { this.lastStatus = s; setStatus(s); } }

  private ensureScenery(a: Airport, groundM?: number): void {
    if (this.scenery.has(a.id)) return;
    const g = groundM ?? Math.max(0, this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(a.lon, a.lat)) ?? 0);
    const runway = new BodyModel(this.engine.viewer, airportSceneryParts(a.runwayLengthM), { shadows: false });
    runway.setPose(Cartesian3.fromDegrees(a.lon, a.lat, g), CMath.toRadians(a.runwayHeadingDeg), 0, 0);
    runway.show = true;
    const b = destinationPoint(a.terminal, bearingDeg(a, a.terminal), 70);
    const gt = Math.max(0, this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(b.lon, b.lat)) ?? g);
    const terminal = new BodyModel(this.engine.viewer, terminalParts(), { shadows: false });
    terminal.setPose(Cartesian3.fromDegrees(b.lon, b.lat, gt), CMath.toRadians(a.runwayHeadingDeg), 0, 0);
    terminal.show = true;
    this.scenery.set(a.id, { airport: a, runway, terminal });
  }

  onSpawn(lat: number, lon: number): void {
    for (const a of AIRPORTS) if (distanceM({ lat, lon }, a) < 6000) this.ensureScenery(a);
  }

  stats(): Record<string, string | number> {
    return { phase: this.phase, flight: this.flightNo || '—', flightPhase: this.plan ? this.state.phase : '—', altM: this.plan ? Math.round(this.state.altM) : 0, scenery: this.scenery.size };
  }

  /** Test/probe hook: jump to a fraction of the flight plan (0..1). */
  debugJump(fraction: number): void {
    if (!this.plan) return;
    this.plan.setTime(Math.max(0, Math.min(1, fraction)) * this.plan.totalS);
    this.step(0);
  }

  /** Test hook. */
  debug(): { phase: Phase; flight: FlightState | null; dest: string | null; progress: number } {
    return { phase: this.phase, flight: this.plan ? { ...this.state } : null, dest: this.dest?.id ?? null, progress: this.state.progress };
  }

  destroy(): void {
    this.destroyed = true;
    this.model?.destroy();
    for (const s of this.scenery.values()) { s.runway.destroy(); s.terminal.destroy(); }
    this.scenery.clear();
  }
}
