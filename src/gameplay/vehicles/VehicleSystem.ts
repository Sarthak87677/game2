import { Cartesian2, Cartesian3, Color, ConeEmitter, Math as CMath, Matrix4, ParticleSystem, PostProcessStage, PrimitiveCollection, Quaternion, Transforms, TranslationRotationScale, type Particle } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { distanceM } from '@/gameplay/GameplayHost';
import { useTerraStore } from '@/state/store';
import { MAHARASHTRA_SPAWNS } from '@/data/maharashtra/spawns';
import { MAHARASHTRA_SHOWROOMS } from '@/data/maharashtra/showrooms';
import { fnv1a, Rng } from '@/util/hash';
import { VEHICLE_CATALOG, vehicleSpec, type VehicleKind, type VehicleSpec } from './catalog';
import { VehicleBody } from './VehicleBody';
import { VehicleAudio } from './VehicleAudio';
import { onVehicleRequest, type SpawnVehicleRequest } from './requests';
import { advanceTimeTrial, bearingDeg, formatLapTime, headlightsOn, impactDamage, indicatorLit, loadBestTime, nearestRoadPoint, nextCheckpoint, offsetFromVehicle, pointBehind, saveBestTime, selectGear, startTimeTrial, StuckDetector, wetGrip, type Gear, type TimeTrialState } from './logic';
import { TIME_TRIAL_COURSES } from './courses';
import { CourseMarkers } from './CourseMarkers';
import { GroundResolver } from './ground';

interface ParkedVehicle {
  id: string;
  kind: VehicleKind;
  paint: string;
  lat: number;
  lon: number;
  headingDeg: number;
  groundM: number | null;
  body: VehicleBody | null;
  damage: number;
  /** Test-drive slot key from a showroom request (replaces older vehicles with the same key). */
  key?: string;
  destination: { name: string; lat: number; lon: number } | null;
}

type CameraMode = 'third' | 'first' | 'dashboard';
type Indicator = 'off' | 'left' | 'right' | 'hazard';

const NEAR_BUILD_M = 900;
const FAR_DESTROY_M = 1600;
const PARKED_PER_SPAWN: VehicleKind[] = ['hatchback', 'sedan', 'suv', 'taxi', 'rickshaw', 'sports', 'bus', 'truck'];
const scratchPos = new Cartesian3();
const scratchFwd = new Cartesian3();
const scratchDelta = new Cartesian3();
const scratchEnu = new Matrix4();

/**
 * Drivable vehicles: parked vehicles at spawn points, showrooms and the time-trial start; enter/exit; camera cycling;
 * lamps, indicators, horn, wipers, tyre spray, wet grip, damage, stuck reset, engine audio, HUD readout and the
 * closed-course time trial. Registered as `vehicles`.
 */
export class VehicleSystem implements GameplaySystem {
  readonly id = 'vehicles';
  readonly label = 'Vehicles';
  private collection: PrimitiveCollection;
  private parked: ParkedVehicle[] = [];
  private active: ParkedVehicle | null = null;
  private spec: VehicleSpec | null = null;
  private audio: VehicleAudio | null = null;
  private camera: CameraMode = 'third';
  private indicator: Indicator = 'off';
  private headlightOverride: boolean | null = null;
  private horn = false;
  private gear: Gear = 'P';
  private idleS = 0;
  private lastSpeed = 0;
  private lastPos: Cartesian3 | null = null;
  private stuck = new StuckDetector(4);
  private resetting = false;
  private fade: PostProcessStage | null = null;
  private fadeAmount = 0;
  private fadeTarget = 0;
  private spray: ParticleSystem | null = null;
  private lastHud = 0;
  private lastPoolSync = 0;
  private trial: { state: TimeTrialState; courseIdx: number } | null = null;
  private markers: CourseMarkers;
  private ground: GroundResolver;
  private offRequests: () => void;
  private keyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private keyUp = (e: KeyboardEvent) => this.onKey(e, false);
  private trafficPool: { bodies: VehicleBody[]; free: VehicleBody[] } = { bodies: [], free: [] };
  private stats_ = { parked: 0, bodies: 0, resets: 0, impacts: 0 };
  private wetness = 0;
  private lastSunCheck = 0;
  private sunEl = 30;
  private brakeLight = false;
  private steer = 0;

  constructor(private readonly engine: TerraEngine) {
    this.collection = engine.viewer.scene.primitives.add(new PrimitiveCollection());
    this.ground = new GroundResolver(engine);
    this.markers = new CourseMarkers(this.collection, this.ground);
    this.seedParkedVehicles();
    this.offRequests = onVehicleRequest((r) => this.handleRequest(r));
    window.addEventListener('keydown', this.keyDown, true);
    window.addEventListener('keyup', this.keyUp, true);
    this.installTrafficPool();
  }

  // ------------------------------------------------------------------------------------------------ parked vehicles

  /** Deterministic parked vehicles at every spawn point, each showroom's forecourt and the time-trial start. */
  private seedParkedVehicles(): void {
    const place = (seedKey: string, lat: number, lon: number, headingDeg: number, count: number, kinds: VehicleKind[]) => {
      const rng = new Rng(fnv1a(seedKey));
      for (let i = 0; i < count; i++) {
        const kind = kinds[i % kinds.length];
        const spec = vehicleSpec(kind);
        // Line the vehicles up on the right-hand side of the spawn heading, nose along the heading.
        const p = offsetFromVehicle(lat, lon, headingDeg, 10 + i * (spec.lengthM + 2.5), -6);
        this.parked.push({ id: `${seedKey}:${i}`, kind, paint: rng.pick(spec.colours), lat: p.lat, lon: p.lon, headingDeg, groundM: null, body: null, damage: 0, destination: null });
      }
    };
    for (const s of MAHARASHTRA_SPAWNS) {
      const rng = new Rng(fnv1a(`park:${s.id}`));
      const start = rng.int(PARKED_PER_SPAWN.length);
      const kinds = [0, 1, 2].map((k) => PARKED_PER_SPAWN[(start + k * 3) % PARKED_PER_SPAWN.length]);
      place(`park:${s.id}`, s.lat, s.lon, s.headingDeg, 3, kinds);
    }
    for (const sr of MAHARASHTRA_SHOWROOMS) {
      const p = offsetFromVehicle(sr.lat, sr.lon, sr.headingDeg, 26, 14);
      place(`showroom:${sr.id}`, p.lat, p.lon, sr.headingDeg + 90, 3, ['hatchback', 'suv', 'sedan']);
    }
    for (const c of TIME_TRIAL_COURSES) {
      const start = c.checkpoints[0];
      const next = c.checkpoints[1];
      const heading = bearingDeg(start.lat, start.lon, next.lat, next.lon);
      place(`trial:${c.id}`, start.lat, start.lon, heading, 3, ['sports', 'hatchback', 'suv']);
    }
  }

  private handleRequest(r: SpawnVehicleRequest): void {
    if (r.key) {
      for (const v of this.parked.filter((p) => p.key === r.key && p !== this.active)) { v.body?.destroy(); this.parked.splice(this.parked.indexOf(v), 1); }
    }
    const spec = vehicleSpec(r.kind);
    const v: ParkedVehicle = { id: `req:${r.key ?? Math.random().toString(36).slice(2)}`, kind: r.kind, paint: r.paint ?? spec.colours[0], lat: r.lat, lon: r.lon, headingDeg: r.headingDeg, groundM: null, body: null, damage: 0, key: r.key, destination: r.destination ?? null };
    this.parked.push(v);
    if (r.enter) void this.enter(v);
  }

  private ensureBody(v: ParkedVehicle): VehicleBody {
    if (!v.body) {
      v.body = new VehicleBody(this.collection, vehicleSpec(v.kind), v.paint, { interior: true, shadows: this.engine.getQuality() !== 'low' });
      v.body.setDamage(v.damage);
      this.placeParked(v);
    }
    return v.body;
  }

  private placeParked(v: ParkedVehicle): void {
    if (!v.body) return;
    const g = this.ground.get(v.id, v.lat, v.lon);
    if (g !== null) v.groundM = g;
    const h = v.groundM ?? 0;
    v.body.show = v.groundM !== null;
    v.body.setPose(Cartesian3.fromDegrees(v.lon, v.lat, h, undefined, scratchPos), CMath.toRadians(v.headingDeg));
  }

  private syncParked(lat: number, lon: number, nowMs: number): void {
    if (nowMs - this.lastPoolSync < 900) return;
    this.lastPoolSync = nowMs;
    let bodies = 0;
    for (const v of this.parked) {
      if (v === this.active) { bodies++; continue; }
      const d = distanceM(lat, lon, v.lat, v.lon);
      if (d < NEAR_BUILD_M) { this.ensureBody(v); this.placeParked(v); bodies++; } else if (d > FAR_DESTROY_M && v.body) { v.body.destroy(); v.body = null; }
      else if (v.body) bodies++;
    }
    this.stats_.parked = this.parked.length;
    this.stats_.bodies = bodies;
  }

  // ------------------------------------------------------------------------------------------------ enter / exit

  async enter(v: ParkedVehicle): Promise<void> {
    if (this.active) return;
    const spec = vehicleSpec(v.kind);
    const body = this.ensureBody(v);
    body.setInteriorVisible(true);
    const modes = this.engine.modes;
    this.active = v;
    this.spec = spec;
    this.gear = 'P';
    this.idleS = 0;
    this.lastSpeed = 0;
    this.lastPos = null;
    this.indicator = 'off';
    this.headlightOverride = null;
    this.stuck.reset();
    modes.driveParams = { ...spec.drive };
    modes.setVehicleBody(body.primitive);
    modes.setMode('drive');
    this.pushHud(true);
    const ground = v.groundM ?? (await this.engine.terrainHeight(v.lat, v.lon));
    if (this.active !== v) return;
    modes.setBody(v.lat, v.lon, v.headingDeg, ground);
    this.applyCamera();
    this.audio = new VehicleAudio(spec.audio, () => this.engine.audio.bus('vehicle'));
    this.engine.traffic?.setPlayer(() => this.playerForTraffic());
    this.pushHud(true);
  }

  exit(): void {
    const v = this.active;
    if (!v || !this.spec) return;
    const modes = this.engine.modes;
    const { lat, lon } = modes.bodyLatLon();
    const headingDeg = CMath.toDegrees(modes.getHeading());
    v.lat = lat; v.lon = lon; v.headingDeg = ((headingDeg % 360) + 360) % 360;
    this.ground.forget(v.id);
    v.groundM = this.engine.groundHeightAt(lat, lon) ?? v.groundM;
    v.damage = v.body?.damageLevel ?? v.damage;
    const door = offsetFromVehicle(lat, lon, v.headingDeg, this.spec.door.x, this.spec.door.y - (this.spec.door.y < 0 ? 0.9 : -0.9));
    if (this.trial) this.endTrial(false);
    modes.setVehicleBody(null);
    modes.setMode('walk');
    modes.setBody(door.lat, door.lon, v.headingDeg, v.groundM ?? undefined);
    modes.setView('third');
    if (v.body) {
      v.body.setInteriorVisible(false);
      v.body.setLamps({ headlights: false, brake: false, indicatorLeft: false, indicatorRight: false, roof: false });
      v.body.setWipers(false);
      this.placeParked(v);
      v.body.show = true;
    }
    this.audio?.destroy();
    this.audio = null;
    this.active = null;
    this.spec = null;
    this.horn = false;
    if (this.spray) this.spray.emissionRate = 0;
    useTerraStore.getState().setGameplay({ vehicle: null, status: null });
  }

  private applyCamera(): void {
    if (!this.spec) return;
    const modes = this.engine.modes;
    const base = this.spec.drive;
    if (this.camera === 'third') { modes.driveParams.eyeHeightM = base.eyeHeightM; modes.setView('third'); }
    else if (this.camera === 'first') { modes.driveParams.eyeHeightM = base.eyeHeightM; modes.setView('first'); }
    else { modes.driveParams.eyeHeightM = base.eyeHeightM - 0.12; modes.setView('first'); }
  }

  // ------------------------------------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active || this.engine.modes.getMode() !== 'drive') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (useTerraStore.getState().gameplay.overlay) return;
    switch (e.code) {
      case 'KeyH':
        // While driving, H is the horn (the UI-hide shortcut is suspended); block the engine's default handler.
        e.stopPropagation();
        this.horn = down;
        this.audio?.setHorn(down);
        return;
      case 'KeyC': if (down && !e.repeat) { this.camera = this.camera === 'third' ? 'first' : this.camera === 'first' ? 'dashboard' : 'third'; this.applyCamera(); } return;
      case 'KeyL': if (down && !e.repeat) { const on = headlightsOn(this.sunEl, this.headlightOverride); this.headlightOverride = !on; } return;
      case 'KeyQ': if (down && !e.repeat) this.indicator = this.indicator === 'left' ? 'off' : 'left'; return;
      case 'KeyR': if (down && !e.repeat) this.indicator = this.indicator === 'right' ? 'off' : 'right'; return;
      case 'KeyZ': if (down && !e.repeat) this.indicator = this.indicator === 'hazard' ? 'off' : 'hazard'; return;
      default: return;
    }
  }

  /** Test hook: same effect as the key shortcuts. */
  command(cmd: 'camera' | 'headlights' | 'left' | 'right' | 'hazard' | 'horn-on' | 'horn-off'): void {
    const fake = (code: string, down: boolean) => this.onKey(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }), down);
    if (cmd === 'camera') fake('KeyC', true);
    else if (cmd === 'headlights') fake('KeyL', true);
    else if (cmd === 'left') fake('KeyQ', true);
    else if (cmd === 'right') fake('KeyR', true);
    else if (cmd === 'hazard') fake('KeyZ', true);
    else if (cmd === 'horn-on') fake('KeyH', true);
    else fake('KeyH', false);
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(ctx: GameplayContext): void {
    const p = ctx.player;
    this.updateFade(ctx.dt);
    this.markers.update(p.lat, p.lon, ctx.nowMs);
    if (p.embodied || this.engine.viewer.camera.positionCartographic.height < 4000) this.syncParked(p.lat, p.lon, ctx.nowMs);
    if (ctx.nowMs - this.lastSunCheck > 1000) {
      this.lastSunCheck = ctx.nowMs;
      this.sunEl = this.engine.environment.sunElevationDeg(p.lat, p.lon);
      this.wetness = this.engine.environment.getWeather().wetness;
    }
    if (!this.active || !this.spec) return;
    const modes = this.engine.modes;
    if (modes.getMode() !== 'drive') {
      // Something else switched modes (fast travel, a journey, the user pressing 3): leave the vehicle where it is.
      if (modes.getMode() !== 'cinematic') this.exit();
      return;
    }
    const body = this.active.body!;
    const keys = modes.input.keys;
    const throttle = keys.has('KeyW') || keys.has('ArrowUp');
    const reverse = keys.has('KeyS') || keys.has('ArrowDown');
    const brake = keys.has('Space') || keys.has('KeyX');
    const steerInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    // Signed speed from the body displacement projected on the heading.
    const pos = modes.bodyPosition();
    const heading = modes.getHeading();
    let speed = 0;
    if (this.lastPos && ctx.dt > 0 && Cartesian3.distance(pos, this.lastPos) > this.spec.drive.maxSpeedMs * ctx.dt * 3 + 5) {
      // A teleport (fast travel, reset, test hook) is not motion: restart the speed estimate.
      this.lastSpeed = 0;
      this.stuck.reset();
    } else if (this.lastPos && ctx.dt > 0) {
      Cartesian3.subtract(pos, this.lastPos, scratchDelta);
      Transforms.eastNorthUpToFixedFrame(pos, undefined, scratchEnu);
      const east = Matrix4.multiplyByPointAsVector(scratchEnu, Cartesian3.UNIT_X, scratchFwd);
      const eastDot = Cartesian3.dot(scratchDelta, east);
      const north = Matrix4.multiplyByPointAsVector(scratchEnu, Cartesian3.UNIT_Y, scratchFwd);
      const northDot = Cartesian3.dot(scratchDelta, north);
      speed = (eastDot * Math.sin(heading) + northDot * Math.cos(heading)) / ctx.dt;
    }
    this.lastPos = Cartesian3.clone(pos, this.lastPos ?? new Cartesian3());
    // Wet grip.
    const grip = wetGrip(this.wetness);
    modes.driveParams.accelMs2 = this.spec.drive.accelMs2 * grip.accel;
    modes.driveParams.turnRate = this.spec.drive.turnRate * grip.turn;
    modes.driveParams.maxSpeedMs = this.spec.drive.maxSpeedMs;
    // Gear, damage, stuck.
    if (!throttle && !reverse && Math.abs(speed) < 0.35) this.idleS += ctx.dt; else this.idleS = 0;
    this.gear = selectGear(this.gear, { speedMs: speed, throttle, reverse, brake, idleS: this.idleS });
    const dmg = impactDamage(this.lastSpeed, speed, ctx.dt);
    if (dmg > 0) { body.setDamage(body.damageLevel + dmg); this.stats_.impacts++; }
    if (!this.resetting && this.stuck.update(throttle, speed, ctx.dt)) void this.resetStuck();
    // Lamps.
    const night = this.sunEl < 2;
    const lit = indicatorLit(ctx.nowMs);
    this.brakeLight = brake || (reverse && speed > 0.3) || (this.lastSpeed - speed) / Math.max(ctx.dt, 1e-3) > 3;
    body.setLamps({
      headlights: headlightsOn(this.sunEl, this.headlightOverride),
      night,
      brake: this.brakeLight,
      indicatorLeft: lit && (this.indicator === 'left' || this.indicator === 'hazard'),
      indicatorRight: lit && (this.indicator === 'right' || this.indicator === 'hazard'),
      roof: night,
    });
    // Wipers when it rains, spray when the road is wet.
    const rain = this.engine.environment.getWeather().precipitation > 0.08;
    body.setWipers(rain);
    this.updateSpray(body, speed);
    // Wheels: steering angle eases toward the input; spin from the signed speed.
    this.steer += (steerInput * 0.45 - this.steer) * Math.min(1, ctx.dt * 8);
    body.setPose(pos, heading, ctx.dt, speed, this.steer);
    this.audio?.update(speed, throttle ? 1 : 0, this.wetness > 0.3);
    this.lastSpeed = speed;
    this.updateTrial(p.lat, p.lon, ctx.nowMs);
    if (ctx.nowMs - this.lastHud > 120) { this.lastHud = ctx.nowMs; this.pushHud(false, speed, heading); }
  }

  private pushHud(force: boolean, speedMs = 0, headingRad = this.engine.modes.getHeading()): void {
    if (!this.active || !this.spec) return;
    const { lat, lon } = this.engine.modes.bodyLatLon();
    const headingDeg = ((CMath.toDegrees(headingRad) % 360) + 360) % 360;
    const dest = this.trial ? (() => { const c = TIME_TRIAL_COURSES[this.trial!.courseIdx]; const cp = nextCheckpoint(c, this.trial!.state); return { name: cp.name ?? 'checkpoint', lat: cp.lat, lon: cp.lon }; })() : this.active.destination;
    const destination = dest ? { name: dest.name, bearingDeg: bearingDeg(lat, lon, dest.lat, dest.lon), distanceM: distanceM(lat, lon, dest.lat, dest.lon) } : null;
    const prev = useTerraStore.getState().gameplay.vehicle;
    const next = { name: this.spec.name, speedKmh: Math.abs(speedMs) * 3.6, headlights: headlightsOn(this.sunEl, this.headlightOverride), indicator: this.indicator, gear: this.gear, headingDeg: Math.round(headingDeg), destination: destination ? { ...destination, bearingDeg: Math.round(destination.bearingDeg), distanceM: Math.round(destination.distanceM) } : null, camera: this.camera, damage: Math.round((this.active.body?.damageLevel ?? 0) * 100) / 100 };
    if (force || !prev || prev.gear !== next.gear || Math.abs(prev.speedKmh - next.speedKmh) > 0.6 || prev.headlights !== next.headlights || prev.indicator !== next.indicator || prev.headingDeg !== next.headingDeg || JSON.stringify(prev.destination) !== JSON.stringify(next.destination) || prev.camera !== next.camera || prev.damage !== next.damage) {
      useTerraStore.getState().setGameplay({ vehicle: next });
    }
  }

  // ------------------------------------------------------------------------------------------------ spray / fade

  private updateSpray(body: VehicleBody, speed: number): void {
    const want = this.wetness > 0.3 && Math.abs(speed) > 3;
    if (!this.spray && !want) return;
    const spray: ParticleSystem = this.spray ?? this.createSpray();
    this.spray = spray;
    const rear = body.spec.wheels.filter((w) => !w.steers);
    const rx = rear.length ? rear.reduce((a, w) => a + w.x, 0) / rear.length : -1;
    // Emitter behind the rear axle, cone pointing backwards and slightly up (emitter +z is the cone axis).
    spray.modelMatrix = body.modelMatrix;
    SPRAY_TRS.translation.x = rx - 0.4; SPRAY_TRS.translation.z = 0.25;
    spray.emitterModelMatrix = Matrix4.fromTranslationRotationScale(SPRAY_TRS, spray.emitterModelMatrix);
    spray.emissionRate = want ? Math.min(90, Math.abs(speed) * 3) * this.wetness : 0;
  }

  private createSpray(): ParticleSystem {
    const scratch = new Cartesian3();
    return this.collection.add(new ParticleSystem({
        image: makeSprayTexture(),
        emitter: new ConeEmitter(CMath.toRadians(35)),
        emissionRate: 0,
        lifetime: 0.7,
        minimumParticleLife: 0.4,
        maximumParticleLife: 0.8,
        minimumSpeed: 2,
        maximumSpeed: 5,
        startScale: 0.6,
        endScale: 2.2,
        startColor: Color.WHITE.withAlpha(0.35),
        endColor: Color.WHITE.withAlpha(0),
        imageSize: new Cartesian2(0.35, 0.35),
        updateCallback: (particle: Particle, dt: number) => {
          const down = Cartesian3.normalize(particle.position, scratch);
          Cartesian3.multiplyByScalar(down, -6 * dt, down);
          Cartesian3.add(particle.velocity, down, particle.velocity);
        },
      })) as ParticleSystem;
  }

  private ensureFade(): PostProcessStage | null {
    if (this.fade) return this.fade;
    try {
      const stage = new PostProcessStage({
        fragmentShader: 'uniform sampler2D colorTexture; uniform float u_fade; in vec2 v_textureCoordinates; void main() { vec4 c = texture(colorTexture, v_textureCoordinates); out_FragColor = vec4(c.rgb * (1.0 - u_fade), c.a); }',
        uniforms: { u_fade: () => this.fadeAmount },
      });
      this.engine.viewer.scene.postProcessStages.add(stage);
      stage.enabled = false;
      this.fade = stage;
    } catch { this.fade = null; }
    return this.fade;
  }

  private updateFade(dt: number): void {
    if (!this.fade) return;
    this.fadeAmount += (this.fadeTarget - this.fadeAmount) * Math.min(1, dt * 6);
    if (this.fadeTarget === 0 && this.fadeAmount < 0.02) { this.fadeAmount = 0; this.fade.enabled = false; }
  }

  /** Stuck for 4 s: fade out, move to the nearest road point (or 5 m back), fade in. */
  private async resetStuck(): Promise<void> {
    if (!this.active) return;
    this.resetting = true;
    this.stats_.resets++;
    const stage = this.ensureFade();
    if (stage) { stage.enabled = true; this.fadeTarget = 1; }
    useTerraStore.getState().setGameplay({ status: 'Vehicle stuck — resetting to the road…' });
    await new Promise((r) => window.setTimeout(r, stage ? 450 : 50));
    if (!this.active) { this.resetting = false; this.fadeTarget = 0; return; }
    const modes = this.engine.modes;
    const { lat, lon } = modes.bodyLatLon();
    const headingDeg = CMath.toDegrees(modes.getHeading());
    const roads = (this.engine.osm?.loadedTiles ?? []).flatMap((t) => t.roads);
    const road = nearestRoadPoint(lat, lon, roads, 80);
    const target = road ?? { ...pointBehind(lat, lon, headingDeg, 5), headingDeg };
    const ground = this.engine.groundHeightAt(target.lat, target.lon) ?? undefined;
    modes.setBody(target.lat, target.lon, target.headingDeg, ground);
    this.lastPos = null;
    this.lastSpeed = 0;
    this.stuck.reset();
    useTerraStore.getState().setGameplay({ status: road ? 'Back on the road.' : 'Moved back 5 m.' });
    window.setTimeout(() => { const s = useTerraStore.getState(); if (/Back on the road|Moved back/.test(s.gameplay.status ?? '')) s.setGameplay({ status: this.trial ? s.gameplay.status : null }); }, 2000);
    this.fadeTarget = 0;
    this.resetting = false;
  }

  // ------------------------------------------------------------------------------------------------ time trial

  private startTrial(courseIdx: number, nowMs: number): void {
    const course = TIME_TRIAL_COURSES[courseIdx];
    this.trial = { state: startTimeTrial(course, nowMs), courseIdx };
    this.engine.traffic?.setExclusion({ lat: course.checkpoints[0].lat, lon: course.checkpoints[0].lon, radiusM: 6000 });
    this.markers.setActive(course, 1);
    useTerraStore.getState().setGameplay({ status: `Time trial started — ${course.name} · ${course.checkpoints.length - 1} checkpoints, closed course` });
  }

  private endTrial(finished: boolean): void {
    if (!this.trial) return;
    const course = TIME_TRIAL_COURSES[this.trial.courseIdx];
    this.engine.traffic?.setExclusion(null);
    this.markers.setActive(null, 0);
    if (finished && this.trial.state.finishedMs !== null) {
      const lap = this.trial.state.finishedMs - this.trial.state.startedMs;
      const record = saveBestTime(course.id, lap, safeStorage());
      const best = loadBestTime(course.id, safeStorage());
      this.engine.gameplay.showOverlay({
        title: 'Lap complete',
        lines: [`${course.name}`, `Lap time ${formatLapTime(lap)}${record ? ' — new best!' : ''}`, `Best ${best === null ? '—' : formatLapTime(best)}`, ...this.trial.state.splitsMs.map((s, i) => `Split ${i + 1}: ${formatLapTime(s)}`)],
        actions: [{ id: 'close', label: 'Close' }],
        note: course.note,
      }, () => this.engine.gameplay.closeOverlay());
    }
    this.trial = null;
    useTerraStore.getState().setGameplay({ status: null });
  }

  private updateTrial(lat: number, lon: number, nowMs: number): void {
    if (!this.trial) return;
    const course = TIME_TRIAL_COURSES[this.trial.courseIdx];
    const next = advanceTimeTrial(course, this.trial.state, lat, lon, nowMs);
    if (next !== this.trial.state) {
      this.trial.state = next;
      if (next.finishedMs !== null) { this.endTrial(true); return; }
      this.markers.setActive(course, next.next);
    }
    const cp = nextCheckpoint(course, this.trial.state);
    const elapsed = nowMs - this.trial.state.startedMs;
    const status = `Time trial ${formatLapTime(elapsed)} · next: ${cp.name ?? `checkpoint ${this.trial.state.next}`} · ${Math.round(distanceM(lat, lon, cp.lat, cp.lon))} m`;
    if (useTerraStore.getState().gameplay.status !== status && Math.floor(nowMs / 200) % 1 === 0) useTerraStore.getState().setGameplay({ status });
  }

  // ------------------------------------------------------------------------------------------------ interactions

  interactions(ctx: GameplayContext): Interaction[] {
    const out: Interaction[] = [];
    const p = ctx.player;
    if (this.active) {
      const speed = Math.abs(this.lastSpeed);
      if (speed < 0.5) out.push({ id: 'vehicle:exit', label: 'Exit vehicle', lat: p.lat, lon: p.lon, radiusM: 50, modes: ['drive'], run: () => this.exit() });
      TIME_TRIAL_COURSES.forEach((c, i) => {
        const s = c.checkpoints[0];
        if (this.trial) out.push({ id: `trial:${c.id}:abort`, label: 'Abort time trial', lat: p.lat, lon: p.lon, radiusM: 50, modes: ['drive'], priority: -1, run: () => this.endTrial(false) });
        else out.push({ id: `trial:${c.id}:start`, label: `Start time trial — ${c.name} (closed course)`, lat: s.lat, lon: s.lon, radiusM: 30, modes: ['drive'], priority: 2, run: () => this.startTrial(i, performance.now()) });
      });
      return out;
    }
    for (const v of this.parked) {
      if (!v.body || v.groundM === null) continue;
      if (distanceM(p.lat, p.lon, v.lat, v.lon) > 60) continue;
      const spec = vehicleSpec(v.kind);
      out.push({ id: `vehicle:enter:${v.id}`, label: `Enter ${spec.name}`, lat: v.lat, lon: v.lon, radiusM: Math.max(4.5, spec.lengthM / 2 + 2.2), modes: ['walk'], run: () => this.enter(v) });
    }
    return out;
  }

  onSpawn(lat: number, lon: number): void {
    if (this.active) this.exit();
    this.lastPoolSync = 0;
    this.syncParked(lat, lon, performance.now());
  }

  // ------------------------------------------------------------------------------------------------ traffic hooks

  private playerForTraffic(): { lat: number; lon: number; headingDeg: number; speedMs: number } | null {
    const modes = this.engine.modes;
    const mode = modes.getMode();
    if (mode !== 'walk' && mode !== 'drive') return null;
    const { lat, lon } = modes.bodyLatLon();
    return { lat, lon, headingDeg: CMath.toDegrees(modes.getHeading()), speedMs: mode === 'drive' ? this.lastSpeed : 0 };
  }

  /** Lends primitive vehicle bodies to the ambient traffic layer for the vehicles nearest the player. */
  private installTrafficPool(): void {
    const traffic = this.engine.traffic;
    if (!traffic) return;
    const max = this.engine.getQuality() === 'low' ? 8 : 16;
    const kinds: VehicleKind[] = ['hatchback', 'hatchback', 'sedan', 'suv', 'taxi', 'taxi', 'rickshaw', 'rickshaw', 'rickshaw', 'bus', 'truck'];
    traffic.setPlayer(() => this.playerForTraffic());
    traffic.setBodyPool({
      acquire: (hint) => {
        let b = this.trafficPool.free.pop() ?? null;
        if (!b) {
          if (this.trafficPool.bodies.length >= max) return null;
          const kind = hint.kind && VEHICLE_CATALOG.some((v) => v.id === hint.kind) ? (hint.kind as VehicleKind) : kinds[hint.seed % kinds.length];
          const spec = vehicleSpec(kind);
          b = new VehicleBody(this.collection, spec, spec.colours[hint.seed % spec.colours.length], { interior: false, shadows: false });
          this.trafficPool.bodies.push(b);
        }
        b.show = true;
        return b;
      },
      release: (b) => { const body = b as VehicleBody; body.show = false; if (!this.trafficPool.free.includes(body)) this.trafficPool.free.push(body); },
    });
  }

  // ------------------------------------------------------------------------------------------------ misc

  stats(): Record<string, string | number> {
    return {
      driving: this.active ? `${vehicleSpec(this.active.kind).name} · ${this.gear} · ${this.camera} camera` : 'no',
      'parked (records/bodies)': `${this.stats_.parked} / ${this.stats_.bodies}`,
      'traffic bodies lent': `${this.trafficPool.bodies.length - this.trafficPool.free.length} of ${this.trafficPool.bodies.length}`,
      'impacts / resets': `${this.stats_.impacts} / ${this.stats_.resets}`,
      'time trial': this.trial ? `running (next ${this.trial.state.next})` : 'idle',
      damage: this.active?.body ? this.active.body.damageLevel.toFixed(2) : '—',
      horn: this.horn ? 'on' : 'off',
    };
  }

  /** Test/diagnostic snapshot. */
  snapshot(): { active: string | null; camera: CameraMode; gear: Gear; speedMs: number; parkedNear: number; parked: { kind: VehicleKind; lat: number; lon: number; headingDeg: number }[]; trial: TimeTrialState | null; indicator: Indicator; damage: number; headlights: boolean; resets: number } {
    return {
      active: this.active?.kind ?? null, camera: this.camera, gear: this.gear, speedMs: this.lastSpeed, parkedNear: this.stats_.bodies,
      parked: this.parked.filter((v) => v.body && v !== this.active).map((v) => ({ kind: v.kind, lat: v.lat, lon: v.lon, headingDeg: v.headingDeg })),
      trial: this.trial?.state ?? null, indicator: this.indicator, damage: this.active?.body?.damageLevel ?? 0, headlights: headlightsOn(this.sunEl, this.headlightOverride), resets: this.stats_.resets,
    };
  }

  destroy(): void {
    if (this.active) this.exit();
    this.offRequests();
    window.removeEventListener('keydown', this.keyDown, true);
    window.removeEventListener('keyup', this.keyUp, true);
    for (const v of this.parked) v.body?.destroy();
    for (const b of this.trafficPool.bodies) b.destroy();
    this.parked = [];
    this.markers.destroy();
    if (this.fade) this.engine.viewer.scene.postProcessStages.remove(this.fade);
    this.engine.viewer.scene.primitives.remove(this.collection);
  }
}

/** Emitter frame: +z (cone axis) rotated to point backwards (−x) and 30° upwards. */
const SPRAY_TRS = new TranslationRotationScale(new Cartesian3(-1, 0, 0.25), Quaternion.fromAxisAngle(Cartesian3.UNIT_Y, CMath.toRadians(-60)), new Cartesian3(1, 1, 1));

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function makeSprayTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(235,240,245,0.9)');
  g.addColorStop(0.6, 'rgba(235,240,245,0.35)');
  g.addColorStop(1, 'rgba(235,240,245,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  return c;
}

