/**
 * Rail journeys: enter a station → departure board (simulated timetable) → fictional ticket → wait on the platform →
 * the train arrives along the corridor and opens its doors → board → window seat or standing → passenger mode with
 * station stops, door cycles, announcements and simple block signalling → leave at any stop.
 *
 * Everything shown is labelled simulated/fictional; station and corridor positions are approximate (see data notes).
 */
import { Cartesian3, Cartographic, Math as CMath } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { corridorById, corridorsAtStation, STATIONS, stationById, STATIONS_DATA_NOTE } from '@/data/maharashtra';
import { useTerraStore } from '@/state/store';
import type { RailCorridor, Station } from '@/data/maharashtra/types';
import type { GameplayContext, GameplayOverlay, GameplaySystem, Interaction } from '@/gameplay/types';
import { BodyModel, localToWorld } from '@/gameplay/journeys/bodies';
import { distanceM, enuOffset, formatDuration } from '@/gameplay/journeys/geo';
import { PassengerRig, scaleLabel, setStatus, timeScale, type SeatSpec } from '@/gameplay/journeys/passenger';
import { nextDepartures, type Departure } from '@/gameplay/journeys/schedule';
import { advanceTrain, limitAt, SERVICE_MOTION } from './motion';
import { railHeadingRad, TrackRenderer, TrackRuntime } from './track';
import { TrainModel, trainSpecFor } from './trainModel';

type Phase = 'idle' | 'at-station' | 'waiting' | 'aboard';
type TrainState = 'run' | 'dwell' | 'held' | 'done';

interface Train {
  id: string;
  track: TrackRuntime;
  direction: 1 | -1;
  s: number;
  v: number;
  /** Remaining stop arc lengths (front-coupler positions) in travel order, with the station index of each. */
  stops: { s: number; station: number }[];
  state: TrainState;
  dwellLeft: number;
  doors: number;
  doorsTarget: number;
  model: TrainModel | null;
  isPlayer: boolean;
  label: string;
  departure: Departure | null;
  /** Ambient trains loop; player trains finish at their destination. */
  loop: boolean;
  lastPos: Cartesian3;
}

interface Platform { station: Station; track: TrackRuntime; s: number; centre: Cartesian3; lat: number; lon: number; headingRad: number; levelM: number; model: BodyModel; dispose: () => void }

const SEATS: Record<'window' | 'door', SeatSpec> = {
  window: { forward: 1.6, left: -0.85, up: 2.7, lookDeg: 60, label: 'Window seat' },
  door: { forward: -8.5, left: 0.2, up: 2.95, lookDeg: 90, label: 'Standing by the door' },
};
const TICKET_NOTE = 'Simulated timetable and fictional in-game ticket — no real money, no real trains. Positions approximate.';
const RAIL_TIME_BASE = 2;
const DWELL_PLAYER_S = 40;
const DWELL_STOP_S = 18;
const DWELL_AMBIENT_S = 20;
const scratchA = new Cartesian3();
const scratchB = new Cartesian3();

export class RailSystem implements GameplaySystem {
  readonly id = 'rail';
  readonly label = 'Rail';
  private readonly rig: PassengerRig;
  private readonly tracks = new Map<string, TrackRuntime>();
  private readonly renderers = new Map<string, TrackRenderer>();
  private readonly trains: Train[] = [];
  private readonly platforms = new Map<string, Platform>();
  private phase: Phase = 'idle';
  private station: Station | null = null;
  private departure: Departure | null = null;
  private playerTrain: Train | null = null;
  private seat: SeatSpec = SEATS.window;
  private leaveAtNext = false;
  private ambientSeq = 0;
  private lastAmbientCheck = 0;
  private lastStatus = '';
  private readonly interactionsOut: Interaction[] = [];
  private destroyed = false;

  constructor(private readonly engine: TerraEngine) {
    this.rig = new PassengerRig(engine);
  }

  // ─── Setup helpers ────────────────────────────────────────────────────────────────────────────────────────────

  private track(corridor: RailCorridor, nearS?: number): TrackRuntime {
    let t = this.tracks.get(corridor.id);
    if (!t) {
      t = new TrackRuntime(corridor, stationById);
      this.tracks.set(corridor.id, t);
      this.renderers.set(corridor.id, new TrackRenderer(this.engine.viewer, t));
      this.spawnAmbient(t);
    }
    if (nearS !== undefined) void t.buildProfile(this.engine, nearS).catch((e) => useTerraStore.getState().log('warn', `Rail profile for ${corridor.name} failed: ${String(e)}`));
    return t;
  }

  private spawnAmbient(t: TrackRuntime): void {
    const n = t.corridor.service === 'heritage' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const s = t.line.lengthM * ((i + 0.5) / n);
      const train = this.makeTrain(t, direction, s, null, false);
      train.stops = this.stopsFrom(t, direction, s, null);
      this.trains.push(train);
    }
  }

  private makeTrain(track: TrackRuntime, direction: 1 | -1, s: number, departure: Departure | null, isPlayer: boolean): Train {
    const label = departure ? `${departure.trainNo} ${departure.name}` : `${track.corridor.service} service`;
    return { id: `${track.corridor.id}-${this.ambientSeq++}`, track, direction, s, v: 0, stops: [], state: 'run', dwellLeft: 0, doors: 0, doorsTarget: 0, model: null, isPlayer, label, departure, loop: !isPlayer, lastPos: new Cartesian3() };
  }

  /** Stops ahead of `s` in travel order (front-coupler arc lengths, so the boarding coach aligns with the platform). */
  private stopsFrom(track: TrackRuntime, direction: 1 | -1, s: number, until: number | null): { s: number; station: number }[] {
    const offset = this.boardingOffset(track);
    const out: { s: number; station: number }[] = [];
    track.stationS.forEach((ss, idx) => {
      const stopS = ss + direction * offset;
      if ((stopS - s) * direction > 1 && (until === null || (stopS - track.stationS[until]) * direction <= offset + 1)) out.push({ s: stopS, station: idx });
    });
    out.sort((a, b) => (a.s - b.s) * direction);
    return out;
  }

  private boardingOffset(track: TrackRuntime): number {
    const spec = trainSpecFor(track.corridor.service);
    let cum = 0;
    for (let i = 0; i < spec.boardingUnit; i++) cum += spec.units[i].lengthM + spec.gapM;
    return cum + spec.units[spec.boardingUnit].lengthM / 2;
  }

  private ensureModel(train: Train): TrainModel {
    if (!train.model) { train.model = new TrainModel(this.engine.viewer, trainSpecFor(train.track.corridor.service)); train.model.show = true; }
    return train.model;
  }

  private liftFloor = (lat: number, lon: number): number | null => {
    const h = this.engine.viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat));
    return h === undefined ? null : h;
  };

  /** Builds (or returns) the platform at a station on a track: slab + support at rail level, with a height sampler. */
  private platform(station: Station, track: TrackRuntime): Platform {
    const key = `${station.id}:${track.corridor.id}`;
    const existing = this.platforms.get(key);
    if (existing) return existing;
    const idx = track.corridor.stations.indexOf(station.id);
    const s = track.stationS[idx];
    const sample = track.line.sample(s);
    let rail = track.heightAt(s);
    const ground = this.liftFloor(sample.lat, sample.lon);
    if (!Number.isFinite(rail)) rail = (ground ?? 0) + 0.6 + (track.corridor.elevatedM ?? 0);
    if (ground !== null && rail < ground + 0.4) rail = ground + 0.4;
    const headingRad = railHeadingRad(sample.headingDeg, 1);
    const trackPos = Cartesian3.fromDegrees(sample.lon, sample.lat, rail);
    const centre = localToWorld(trackPos, headingRad, 0, 6.2, 0, new Cartesian3());
    const c = Cartographic.fromCartesian(centre);
    const lat = CMath.toDegrees(c.latitude), lon = CMath.toDegrees(c.longitude);
    const levelM = rail + 1.0;
    const support = ground !== null ? Math.max(0.8, levelM - 0.4 - ground) : 1.2;
    const model = new BodyModel(this.engine.viewer, [
      { kind: 'box', size: [140, 7, 0.4], at: [0, 0, 0.8], color: '#9a9287' },
      { kind: 'box', size: [140, 5.5, support], at: [0, 0, 0.6 - support / 2], color: '#6d675f' },
      { kind: 'box', size: [140, 0.15, 1.1], at: [0, 3.4, 1.55], color: '#c9a227' },
      { kind: 'box', size: [40, 6, 0.2], at: [0, 0, 4.6], color: '#4a4f57' },
      { kind: 'box', size: [0.3, 0.3, 3.6], at: [-18, 2.5, 2.8], color: '#4a4f57' },
      { kind: 'box', size: [0.3, 0.3, 3.6], at: [18, 2.5, 2.8], color: '#4a4f57' },
    ], { shadows: false });
    model.setPose(trackPos, headingRad, 0, 0);
    model.show = true;
    const origin = { lat: sample.lat, lon: sample.lon };
    const cos = Math.cos(headingRad), sin = Math.sin(headingRad);
    const sampler = (la: number, lo: number): number | null => {
      const o = enuOffset(origin, { lat: la, lon: lo });
      // Local forward/left of the +1 heading: forward = (sin h, cos h) east/north, left = (−cos h, sin h).
      const fwd = o.x * sin + o.y * cos;
      const left = -o.x * cos + o.y * sin;
      if (Math.abs(fwd) <= 70 && left >= 2.7 && left <= 9.7) return levelM;
      return null;
    };
    const dispose = this.engine.modes.addHeightSampler(sampler);
    const p: Platform = { station, track, s, centre, lat, lon, headingRad, levelM, model, dispose };
    this.platforms.set(key, p);
    return p;
  }

  private dropFarPlatforms(lat: number, lon: number): void {
    for (const [key, p] of this.platforms) {
      if (distanceM({ lat, lon }, { lat: p.lat, lon: p.lon }) > 2500 && this.phase !== 'waiting' && !(this.phase === 'at-station' && this.station?.id === p.station.id)) {
        p.dispose(); p.model.destroy(); this.platforms.delete(key);
      }
    }
  }

  // ─── Interactions and overlays ───────────────────────────────────────────────────────────────────────────────

  interactions(ctx: GameplayContext): Interaction[] {
    const out = this.interactionsOut;
    out.length = 0;
    const p = ctx.player;
    if (this.phase === 'aboard' && this.playerTrain) {
      const t = this.playerTrain;
      if (t.state === 'dwell' && t.doors > 0.6) {
        const st = this.stationOf(t, t.stops[0]?.station ?? -1) ?? this.station;
        out.push({ id: 'rail-leave', label: `Leave train at ${st?.name ?? 'this stop'}`, lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 5, modes: ['passenger'], run: () => this.leaveTrain() });
      }
      out.push({ id: 'rail-options', label: 'Journey options', lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 1, modes: ['passenger'], run: () => this.showJourneyOverlay() });
      return out;
    }
    if (this.phase === 'waiting' && this.playerTrain && this.playerTrain.state === 'dwell' && this.playerTrain.doors > 0.6 && this.station) {
      const d = this.departure!;
      out.push({ id: 'rail-board', label: `Board ${d.trainNo} ${d.name} to ${stationById(d.destinationId)?.name ?? d.destinationId}`, lat: p.lat, lon: p.lon, radiusM: 1e6, priority: 4, run: () => this.showSeatOverlay() });
    }
    for (const st of STATIONS) {
      const d = distanceM(p, st);
      if (d > 160) continue;
      const atPlatform = this.phase !== 'idle' && this.station?.id === st.id;
      out.push({ id: `rail-station-${st.id}`, label: atPlatform ? `Departure board · ${st.name}` : `Enter station · ${st.name}`, lat: st.lat, lon: st.lon, radiusM: 160, priority: atPlatform ? 2 : 0, run: () => this.enterStation(st) });
    }
    return out;
  }

  private stationOf(train: Train, index: number): Station | undefined {
    const id = train.track.corridor.stations[index];
    return id ? stationById(id) : undefined;
  }

  private simMinutes(): number {
    return Math.floor(this.engine.environment.getDate().getTime() / 60_000);
  }

  private enterStation(station: Station): void {
    if (this.phase === 'aboard') return;
    const corridors = corridorsAtStation(station.id);
    if (corridors.length === 0) return;
    for (const c of corridors) { const t = this.track(c); void t.buildProfile(this.engine, t.stationS[c.stations.indexOf(station.id)]).catch(() => undefined); }
    const plat = this.platform(station, this.tracks.get(corridors[0].id)!);
    this.station = station;
    this.phase = 'at-station';
    const here = this.engine.gameplay.player();
    if (distanceM(here, plat) > 25 || !here.embodied) {
      this.engine.gameplay.teleport(plat.lat, plat.lon, CMath.toDegrees(plat.headingRad));
      this.engine.modes.setBody(plat.lat, plat.lon, CMath.toDegrees(plat.headingRad), plat.levelM);
    }
    this.showBoard(station);
  }

  private showBoard(station: Station): void {
    const corridors = corridorsAtStation(station.id);
    const deps = nextDepartures(station.id, corridors, this.simMinutes(), 90, 6);
    const lines = deps.length ? deps.map((d) => `${d.trainNo} ${d.name} → ${stationById(d.destinationId)?.name ?? d.destinationId} · platform ${d.platform} · in ${d.departsInMin} min`) : ['No departures in the next 90 minutes.'];
    lines.push(STATIONS_DATA_NOTE);
    const actions = deps.slice(0, 4).map((d, i) => ({ id: `dep-${i}`, label: `Ticket → ${stationById(d.destinationId)?.name ?? d.destinationId} (${d.name})` }));
    actions.push({ id: 'close', label: 'Leave the counter' });
    const overlay: GameplayOverlay = { title: `${station.name} (${station.code}) — next departures`, lines, actions, note: TICKET_NOTE };
    this.engine.gameplay.showOverlay(overlay, (id) => {
      if (id.startsWith('dep-')) this.showTicket(deps[Number(id.slice(4))]);
      else this.engine.gameplay.closeOverlay();
    });
  }

  private showTicket(dep: Departure): void {
    const corridor = corridorById(dep.corridorId)!;
    const dest = stationById(dep.destinationId)!;
    const lines = [
      `From ${this.station!.name} to ${dest.name}`,
      `${dep.trainNo} ${dep.name} · ${corridor.name}`,
      `${dep.stops.length} stop${dep.stops.length === 1 ? '' : 's'} · platform ${dep.platform} · departs in ${dep.departsInMin} min (simulated)`,
      'Fare: 0 — fictional in-game ticket.',
    ];
    this.engine.gameplay.showOverlay({ title: 'Ticket', lines, actions: [{ id: 'wait', label: 'Buy ticket and wait on the platform' }, { id: 'back', label: 'Back to departures' }], note: TICKET_NOTE }, (id) => {
      if (id === 'wait') { this.engine.gameplay.closeOverlay(); this.startWaiting(dep); }
      else this.showBoard(this.station!);
    });
  }

  private startWaiting(dep: Departure): void {
    const corridor = corridorById(dep.corridorId)!;
    const track = this.track(corridor);
    const idx = corridor.stations.indexOf(this.station!.id);
    const stationS = track.stationS[idx];
    void track.buildProfile(this.engine, stationS).catch(() => undefined);
    const offset = this.boardingOffset(track);
    const stopS = stationS + dep.direction * offset;
    const approach = Math.min(900, Math.max(200, Math.abs((dep.direction > 0 ? stationS : track.line.lengthM - stationS) - 30)));
    // Retire any earlier player train (missed or abandoned).
    if (this.playerTrain) { this.playerTrain.isPlayer = false; this.playerTrain.loop = true; }
    const train = this.makeTrain(track, dep.direction, stopS - dep.direction * approach, dep, true);
    train.v = Math.min(SERVICE_MOTION[corridor.service].maxMs * 0.6, 12);
    const destIdx = corridor.stations.indexOf(dep.destinationId);
    train.stops = [{ s: stopS, station: idx }, ...this.stopsFrom(track, dep.direction, stopS, destIdx)];
    this.ensureModel(train);
    this.trains.push(train);
    this.playerTrain = train;
    this.departure = dep;
    this.phase = 'waiting';
    this.leaveAtNext = false;
    // Make sure the platform belongs to this corridor's track (the first corridor's may differ slightly).
    this.platform(this.station!, track);
    this.status(`Waiting for ${dep.trainNo} ${dep.name} to ${stationById(dep.destinationId)?.name} · platform ${dep.platform} · train approaching`);
  }

  private showSeatOverlay(): void {
    const d = this.departure!;
    this.engine.gameplay.showOverlay({ title: `Board ${d.trainNo} ${d.name}`, lines: [`To ${stationById(d.destinationId)?.name}. Choose where to travel:`], actions: [{ id: 'window', label: 'Window seat' }, { id: 'door', label: 'Stand by the door' }], note: 'Passenger mode: look around with the mouse; E for journey options; [ and ] change the time compression.' }, (id) => {
      this.seat = id === 'door' ? SEATS.door : SEATS.window;
      this.engine.gameplay.closeOverlay();
      this.board();
    });
  }

  private board(): void {
    const t = this.playerTrain;
    if (!t) return;
    this.phase = 'aboard';
    this.rig.enter();
    t.dwellLeft = Math.min(t.dwellLeft, 6);
    this.poseCamera(t);
  }

  private showJourneyOverlay(): void {
    const t = this.playerTrain;
    if (!t) return;
    const dest = t.departure ? stationById(t.departure.destinationId) : undefined;
    const dwelling = t.state === 'dwell' && t.doors > 0.6;
    const lines = [this.statusLine(t), `Time compression ×${timeScale(this.engine, RAIL_TIME_BASE).toFixed(1)} (adjust with [ and ])`];
    const actions = [
      { id: 'skip', label: `Skip to arrival at ${dest?.name ?? 'the destination'}`, disabled: t.stops.length === 0 },
      { id: 'leave', label: dwelling ? 'Leave the train here' : `Leave at the next stop${this.leaveAtNext ? ' (set)' : ''}` },
      { id: 'seat', label: this.seat === SEATS.window ? 'Stand by the door' : 'Take a window seat' },
      { id: 'continue', label: 'Continue the journey' },
    ];
    this.engine.gameplay.showOverlay({ title: `Aboard ${t.label}`, lines, actions, note: TICKET_NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'skip') this.skipToArrival();
      else if (id === 'leave') { if (dwelling) this.leaveTrain(); else this.leaveAtNext = true; }
      else if (id === 'seat') this.seat = this.seat === SEATS.window ? SEATS.door : SEATS.window;
    });
  }

  /** Fast travel: the train is placed at its final stop with the doors open. */
  private skipToArrival(): void {
    const t = this.playerTrain;
    if (!t || t.stops.length === 0) return;
    const last = t.stops[t.stops.length - 1];
    t.s = last.s; t.v = 0;
    t.stops = [last];
    void t.track.buildProfile(this.engine, t.s).catch(() => undefined);
    this.arriveAtStop(t, true);
    this.poseCamera(t);
    const st = this.stationOf(t, last.station);
    this.showArrivalOverlay(st);
  }

  private showArrivalOverlay(st: Station | undefined): void {
    this.engine.gameplay.showOverlay({ title: `Arrived at ${st?.name ?? 'the destination'}`, lines: ['Doors are open. This is the last stop of your ticket.'], actions: [{ id: 'leave', label: 'Leave the train' }, { id: 'stay', label: 'Look around first' }], note: TICKET_NOTE }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'leave') this.leaveTrain();
    });
  }

  private leaveTrain(): void {
    const t = this.playerTrain;
    if (!t) return;
    const stop = t.stops[0];
    const st = stop ? this.stationOf(t, stop.station) : undefined;
    let lat: number, lon: number, heading: number, level: number | undefined;
    if (st) {
      const plat = this.platform(st, t.track);
      // Stand on the platform beside the boarding coach.
      const model = this.ensureModel(t);
      const pose = model.unitPose(t.track, t.s, t.direction, model.spec.boardingUnit, scratchA);
      const side = t.direction > 0 ? 1 : -1;
      const p = localToWorld(pose.position, pose.headingRad, 0, side * 4.5, 0, scratchB);
      const c = Cartographic.fromCartesian(p);
      lat = CMath.toDegrees(c.latitude); lon = CMath.toDegrees(c.longitude);
      heading = CMath.toDegrees(pose.headingRad) + (side > 0 ? -90 : 90);
      level = plat.levelM;
      this.station = st;
      this.phase = 'at-station';
    } else {
      const c = PassengerRig.carto(t.lastPos);
      lat = c.lat; lon = c.lon; heading = 0; level = undefined;
      this.phase = 'idle';
      this.station = null;
    }
    this.rig.exit(lat, lon, heading, level);
    t.isPlayer = false; t.loop = true;
    if (t.state === 'dwell') t.dwellLeft = Math.min(t.dwellLeft, 8);
    this.playerTrain = null;
    this.departure = null;
    this.leaveAtNext = false;
    setStatus(null);
  }

  // ─── Simulation ───────────────────────────────────────────────────────────────────────────────────────────

  update(ctx: GameplayContext): void {
    if (this.destroyed) return;
    const scale = timeScale(this.engine, RAIL_TIME_BASE);
    const simDt = ctx.dt * scale;
    const player = ctx.player;
    // Player abandoned passenger mode with a mode key → treat as leaving.
    if (this.phase === 'aboard' && player.mode !== 'passenger') { this.abandon(); }
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const t = this.trains[i];
      this.stepTrain(t, simDt, ctx.dt);
      if (t.state === 'done' && !t.isPlayer) { this.retire(t); this.trains.splice(i, 1); }
    }
    // Ambient models: only within ~3 km of the player (checked twice a second).
    if (ctx.nowMs - this.lastAmbientCheck > 500) {
      this.lastAmbientCheck = ctx.nowMs;
      let rendered = 0;
      for (const t of this.trains) {
        if (t.isPlayer) continue;
        const sample = t.track.line.sample(t.s);
        const near = distanceM(player, sample) < 3000 && rendered < 3;
        if (near) { this.ensureModel(t); rendered++; }
        else if (t.model) { t.model.destroy(); t.model = null; }
      }
      for (const [id, r] of this.renderers) {
        const track = this.tracks.get(id)!;
        const near = this.playerTrain?.track === track || (this.station && track.corridor.stations.includes(this.station.id)) || track.line.distanceToNearestVertexM(player) < 4000;
        if (near) r.update(this.playerTrain?.track === track ? this.playerTrain.s : track.line.nearestS(player));
      }
      this.dropFarPlatforms(player.lat, player.lon);
    }
    for (const t of this.trains) if (t.model) t.model.pose(t.track, t.s, t.direction, this.liftFloor);
    if (this.phase === 'aboard' && this.playerTrain) {
      this.poseCamera(this.playerTrain);
      this.status(this.statusLine(this.playerTrain) + scaleLabel(scale));
    } else if (this.phase === 'waiting' && this.playerTrain) {
      const t = this.playerTrain;
      const d = this.departure!;
      if (t.state === 'dwell') this.status(t.doors > 0.6 ? `${d.trainNo} ${d.name} at platform ${d.platform} · doors open · press E to board (${Math.ceil(t.dwellLeft)} s)` : 'Doors opening…');
      else if (t.state === 'run' && t.stops.length && Math.abs(t.stops[0].s - t.s) < 300) this.status(`${d.trainNo} ${d.name} arriving at platform ${d.platform}`);
    }
  }

  private stepTrain(t: Train, simDt: number, realDt: number): void {
    const p = SERVICE_MOTION[t.track.corridor.service];
    // Doors animate in real time.
    t.doors += Math.sign(t.doorsTarget - t.doors) * Math.min(Math.abs(t.doorsTarget - t.doors), realDt * 0.8);
    t.model?.setDoors(t.doors);
    if (t.state === 'done') return;
    if (t.state === 'dwell') {
      t.dwellLeft -= simDt;
      if (t.doorsTarget > 0 && t.dwellLeft <= 3) t.doorsTarget = 0;
      if (t.dwellLeft <= 0 && t.doors < 0.05) {
        // Depart: the current stop is consumed.
        t.stops.shift();
        if (t.stops.length === 0) {
          if (t.loop) { t.direction = t.direction > 0 ? -1 : 1; t.stops = this.stopsFrom(t.track, t.direction, t.s, null); if (t.stops.length === 0) { t.state = 'done'; return; } }
          else { t.state = 'done'; return; }
        }
        t.state = 'run';
      }
      return;
    }
    // Block signalling: hold at the boundary if the next block is occupied by a train going the same way.
    const nextStop = t.stops[0]?.s ?? null;
    let stopS = nextStop;
    const boundary = t.track.blocks.nextBoundary(t.s, t.direction);
    const beyond = t.track.blocks.blockBeyond(t.s, t.direction);
    let held = false;
    if (boundary !== null && beyond !== null && !t.track.blocks.canEnter(t.id, beyond, t.direction)) {
      const signalS = boundary - t.direction * 30;
      if ((signalS - t.s) * t.direction >= -1 && (stopS === null || (signalS - t.s) * t.direction < (stopS - t.s) * t.direction)) { stopS = signalS; held = true; }
    }
    const limit = limitAt(t.s, t.track.baseLimitMs, t.track.limits);
    const r = advanceTrain(t.s, t.v, t.direction, simDt, limit, stopS, p);
    t.s = r.s; t.v = r.v;
    t.track.blocks.update(t.id, t.s, t.direction);
    if (r.stopped) {
      if (held) { t.state = 'held'; }
      else if (nextStop !== null && Math.abs(nextStop - t.s) < 0.6) this.arriveAtStop(t, false);
    } else if (t.state === 'held') t.state = 'run';
    if (t.state === 'held') {
      // Re-check the signal every frame: proceed as soon as the block clears.
      if (beyond !== null && t.track.blocks.canEnter(t.id, beyond, t.direction)) t.state = 'run';
    }
    if (t.s <= 0 || t.s >= t.track.line.lengthM) { if (t.loop) { t.direction = t.direction > 0 ? -1 : 1; t.stops = this.stopsFrom(t.track, t.direction, t.s, null); } }
  }

  private arriveAtStop(t: Train, arrivalSkip: boolean): void {
    t.state = 'dwell';
    t.v = 0;
    t.doorsTarget = 1;
    const isTerminus = t.stops.length === 1;
    t.dwellLeft = t.isPlayer ? (this.phase === 'waiting' ? DWELL_PLAYER_S : isTerminus ? 1e9 : DWELL_STOP_S) : DWELL_AMBIENT_S;
    if (arrivalSkip) t.doors = 1;
    if (t.isPlayer && this.phase === 'aboard') {
      if (this.leaveAtNext) { this.leaveAtNext = false; window.setTimeout(() => { if (this.playerTrain === t && this.phase === 'aboard') this.leaveTrain(); }, 800); }
      else if (isTerminus && !arrivalSkip) this.showArrivalOverlay(this.stationOf(t, t.stops[0].station));
    }
    if (t.isPlayer && this.phase === 'waiting') {
      // If the player never boards, the train leaves and becomes ambient.
      window.setTimeout(() => {
        if (this.playerTrain === t && this.phase === 'waiting' && t.state !== 'dwell') {
          t.isPlayer = false; t.loop = true; this.playerTrain = null; this.phase = 'at-station';
          this.status(`Missed ${t.label} — check the departure board for the next service`);
        }
      }, (DWELL_PLAYER_S / Math.max(0.1, timeScale(this.engine, RAIL_TIME_BASE))) * 1000 + 6000);
    }
  }

  private abandon(): void {
    const t = this.playerTrain;
    if (t) { t.isPlayer = false; t.loop = true; }
    this.playerTrain = null; this.departure = null; this.phase = 'idle'; this.station = null;
    setStatus(null);
  }

  private retire(t: Train): void {
    t.track.blocks.remove(t.id);
    t.model?.destroy(); t.model = null;
  }

  private poseCamera(t: Train): void {
    const model = this.ensureModel(t);
    const pose = model.unitPose(t.track, t.s, t.direction, model.spec.boardingUnit, scratchA);
    Cartesian3.clone(pose.position, t.lastPos);
    // Keep the seat on the platform side when standing by the door.
    const seat = this.seat === SEATS.door ? { ...SEATS.door, left: SEATS.door.left, lookDeg: t.direction > 0 ? 90 : -90 } : this.seat;
    this.rig.seat(pose.position, pose.headingRad, seat);
  }

  private statusLine(t: Train): string {
    const dest = t.departure ? stationById(t.departure.destinationId)?.name ?? '' : '';
    const next = t.stops[0];
    const nextName = next ? this.stationOf(t, next.station)?.name ?? '' : '';
    if (t.state === 'dwell') return next ? `Aboard ${t.label} → ${dest} · at ${nextName} · doors ${t.doors > 0.6 ? 'open' : 'closing'}${t.stops.length === 1 ? ' · last stop' : ` · departs in ${Math.max(0, Math.ceil(t.dwellLeft))} s`}` : `Aboard ${t.label} → ${dest}`;
    if (t.state === 'held') return `Aboard ${t.label} → ${dest} · held at signal (block ahead occupied) · next stop ${nextName}`;
    const dist = next ? Math.abs(next.s - t.s) : 0;
    const eta = dist / Math.max(4, limitAt(t.s, t.track.baseLimitMs, t.track.limits) * 0.75);
    const kmh = Math.round(t.v * 3.6);
    return `Aboard ${t.label} → ${dest} · next stop ${nextName} · ${dist < 600 ? 'arriving' : formatDuration(eta)} · ${kmh} km/h`;
  }

  private status(s: string): void {
    if (s === this.lastStatus) return;
    this.lastStatus = s;
    setStatus(s);
  }

  onSpawn(lat: number, lon: number): void {
    // Pre-build the corridors through nearby stations so trains are already running when the player looks around.
    for (const st of STATIONS) {
      if (distanceM({ lat, lon }, st) > 1500) continue;
      for (const c of corridorsAtStation(st.id)) { const t = this.track(c); void t.buildProfile(this.engine, t.stationS[c.stations.indexOf(st.id)]).catch(() => undefined); }
    }
  }

  stats(): Record<string, string | number> {
    let models = 0;
    for (const t of this.trains) if (t.model) models++;
    const profiles = [...this.tracks.values()].map((t) => `${t.corridor.id}:${Math.round(t.profileProgress * 100)}%`).join(' ');
    return { phase: this.phase, trains: this.trains.length, models, tracks: this.tracks.size, platforms: this.platforms.size, profiles: profiles || '—' };
  }

  /** Test hook: state summary for e2e specs. */
  debug(): { phase: Phase; station: string | null; train: { label: string; s: number; v: number; state: TrainState; stops: number; doors: number } | null } {
    const t = this.playerTrain;
    return { phase: this.phase, station: this.station?.id ?? null, train: t ? { label: t.label, s: t.s, v: t.v, state: t.state, stops: t.stops.length, doors: t.doors } : null };
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.trains) this.retire(t);
    this.trains.length = 0;
    for (const r of this.renderers.values()) r.destroy();
    for (const t of this.tracks.values()) t.dispose();
    for (const p of this.platforms.values()) { p.dispose(); p.model.destroy(); }
    this.platforms.clear();
  }
}
