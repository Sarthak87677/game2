import { BoxGeometry, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, CylinderGeometry, EllipsoidGeometry, GeometryInstance, HeadingPitchRoll, JulianDate, Math as CMath, Matrix4, PerInstanceColorAppearance, Primitive, ShadowMode, Transforms, VertexFormat, type Viewer } from 'cesium';
import { InputManager } from './input';
import { flyTo, type CameraTarget } from '@/engine/camera';

export type ModeId = 'orbit' | 'fly' | 'walk' | 'drive' | 'cinematic' | 'passenger';

/** Tunables of the ground vehicle currently being driven (set by the vehicle system when the player boards one). */
export interface DriveParams {
  /** Acceleration in m/s² at full throttle. */
  accelMs2: number;
  /** Top speed in m/s. */
  maxSpeedMs: number;
  /** Steering rate in rad/s at speed. */
  turnRate: number;
  /** Driver eye height above the ground in metres. */
  eyeHeightM: number;
  /** Third-person camera distance/height in metres. */
  followBackM: number;
  followUpM: number;
}

export const DEFAULT_DRIVE_PARAMS: DriveParams = { accelMs2: 5, maxSpeedMs: 45, turnRate: 1.4, eyeHeightM: 1.35, followBackM: 12, followUpM: 4.2 };
export type CameraView = 'first' | 'third';

export interface ModeState {
  mode: ModeId;
  view: CameraView;
  /** Speed multiplier 0.1..100. */
  speed: number;
  /** Vehicle/walker speed in m/s (for HUD). */
  groundSpeedMs: number;
  onGround: boolean;
}

export interface TourKeyframe extends CameraTarget { durationS?: number }

const EYE_HEIGHT_WALK = 1.7;
const GRAVITY = 9.81;

/**
 * Exploration modes. Orbit delegates to Cesium's screen-space controller; fly/walk/drive drive the camera directly
 * in a local east-north-up frame with terrain collision and gravity; cinematic plays keyframe tours.
 */
export class ModeController {
  readonly input: InputManager;
  private mode: ModeId = 'orbit';
  private view: CameraView = 'first';
  private speed = 1;
  private heading = 0;
  private pitch = 0;
  /** Walker/vehicle position on the ground (ECEF) and vertical velocity. */
  private bodyPos = new Cartesian3();
  private bodyHeightAgl = 0;
  private verticalVel = 0;
  private driveSpeed = 0;
  private lastGround: number | null = null;
  private avatar: Primitive | null = null;
  private vehicle: Primitive | null = null;
  private removePreUpdate: () => void;
  private lastTime: number | null = null;
  private tour: TourKeyframe[] | null = null;
  private tourIndex = 0;
  private tourCancel = false;
  private onGround = false;
  onChange?: (s: ModeState) => void;
  /** Optional extra collision height sampler (e.g. buildings) returning height above ellipsoid or null. */
  extraHeightSampler: ((lat: number, lon: number) => number | null) | null = null;
  /** Additional height samplers (vehicle decks, campus geometry…); the highest non-null answer wins. */
  private readonly heightSamplers = new Set<(lat: number, lon: number) => number | null>();
  /**
   * When set (e.g. inside a building), this sampler REPLACES terrain and all other samplers wherever it answers, so floors,
   * stairs and elevators define the walking surface. Return null to fall back to the normal world.
   */
  groundOverride: ((lat: number, lon: number) => number | null) | null = null;
  /** Optional movement filter (wall collision): returns the allowed destination, or null to block the step entirely. */
  moveFilter: ((from: { lat: number; lon: number }, to: { lat: number; lon: number }) => { lat: number; lon: number } | null) | null = null;
  /** Called when the walker lands after a fall of more than a few metres (fall protection / respawn hooks). */
  onFall?: (fallM: number) => void;
  private fallStartHeight: number | null = null;
  /** Ground vehicle tunables (defaults describe the built-in car). */
  driveParams: DriveParams = { ...DEFAULT_DRIVE_PARAMS };
  private customVehicle: Primitive | null = null;
  /** Passenger pose (train, aircraft, ferry…): set every frame by a journey system while mode === 'passenger'. */
  private passengerPose: { position: Cartesian3; headingRad: number } | null = null;
  private lookOffset = 0;

  constructor(private viewer: Viewer, onCommand?: (code: string) => void) {
    this.input = new InputManager({ element: viewer.canvas, onCommand: (code) => { if (this.mode === 'cinematic' && code !== 'Escape') { /* handled by tour loop */ } onCommand?.(code); } });
    this.removePreUpdate = viewer.scene.preUpdate.addEventListener((_s: unknown, time: JulianDate) => this.update(time));
  }

  getState(): ModeState {
    return { mode: this.mode, view: this.view, speed: this.speed, groundSpeedMs: this.mode === 'drive' ? Math.abs(this.driveSpeed) : 0, onGround: this.onGround };
  }

  private emit(): void { this.onChange?.(this.getState()); }

  setSpeed(mult: number): void { this.speed = Math.max(0.05, Math.min(200, mult)); this.emit(); }
  getSpeed(): number { return this.speed; }

  setView(v: CameraView): void {
    this.view = v;
    this.updateAvatars();
    this.emit();
  }

  setMode(mode: ModeId): void {
    if (mode === this.mode) return;
    const ssc = this.viewer.scene.screenSpaceCameraController;
    this.tourCancel = true;
    this.tour = null;
    this.mode = mode;
    ssc.enableInputs = mode === 'orbit';
    this.input.pointerLockWanted = mode === 'fly' || mode === 'walk' || mode === 'drive' || mode === 'passenger';
    if (!this.input.pointerLockWanted) this.input.releasePointerLock();
    this.heading = this.viewer.camera.heading;
    this.pitch = this.viewer.camera.pitch;
    this.verticalVel = 0;
    this.driveSpeed = 0;
    if (mode === 'walk' || mode === 'drive') this.enterGround();
    if (mode === 'passenger') { this.lookOffset = 0; this.pitch = Math.max(CMath.toRadians(-20), Math.min(CMath.toRadians(15), this.pitch)); }
    this.updateAvatars();
    this.emit();
  }

  getMode(): ModeId { return this.mode; }
  getHeading(): number { return this.heading; }
  setHeading(rad: number): void { this.heading = rad; }
  getPitch(): number { return this.pitch; }

  /** Registers an additional height sampler; returns a disposer. */
  addHeightSampler(fn: (lat: number, lon: number) => number | null): () => void {
    this.heightSamplers.add(fn);
    return () => { this.heightSamplers.delete(fn); };
  }

  /** ECEF position of the walker/vehicle body (copy). */
  bodyPosition(): Cartesian3 { return Cartesian3.clone(this.bodyPos); }

  /** Moves the body by an ECEF delta (used to ride moving platforms such as ship decks). */
  translateBody(delta: Cartesian3): void {
    Cartesian3.add(this.bodyPos, delta, this.bodyPos);
    const c = Cartographic.fromCartesian(this.bodyPos);
    this.lastGround = c.height - this.bodyHeightAgl;
  }

  /**
   * Places the body at a lat/lon on the ground (spawn, teleport, leaving a vehicle or a building). Uses the loaded
   * terrain plus samplers; when nothing has streamed yet the optional heightM is used, else the previous height.
   */
  setBody(lat: number, lon: number, headingDeg?: number, heightM?: number): void {
    const carto = Cartographic.fromDegrees(lon, lat);
    const g = this.groundAt(carto) ?? heightM ?? this.lastGround ?? Cartographic.fromCartesian(this.bodyPos).height;
    this.lastGround = g;
    this.bodyHeightAgl = 0;
    this.verticalVel = 0;
    this.fallStartHeight = null;
    this.bodyPos = Cartesian3.fromDegrees(lon, lat, g);
    if (headingDeg !== undefined) this.heading = CMath.toRadians(headingDeg);
    if (this.mode === 'walk' || this.mode === 'drive') this.updateGround({ moveX: 0, moveY: 0, moveZ: 0, lookDx: 0, lookDy: 0, sprint: false, jump: false, brake: false, keys: new Set() }, 0);
  }

  /** Replaces the built-in car body with a vehicle primitive (null restores the default). Ownership stays with the caller. */
  setVehicleBody(primitive: Primitive | null): void {
    if (this.customVehicle && this.customVehicle !== primitive) this.customVehicle.show = false;
    this.customVehicle = primitive;
    this.updateAvatars();
  }

  /** Sets the camera pose for passenger mode (called each frame by train/aircraft/boat journeys). */
  setPassengerPose(position: Cartesian3, headingRad: number): void {
    this.passengerPose = { position: Cartesian3.clone(position, this.passengerPose?.position), headingRad };
    if (this.mode === 'passenger') this.applyPassengerCamera();
  }

  private applyPassengerCamera(): void {
    if (!this.passengerPose) return;
    this.viewer.camera.setView({ destination: this.passengerPose.position, orientation: { heading: this.passengerPose.headingRad + this.lookOffset, pitch: this.pitch, roll: 0 } });
  }

  /** Start a cinematic tour; null → auto orbit around the current view target. */
  async startTour(keyframes: TourKeyframe[] | null): Promise<void> {
    this.setMode('cinematic');
    this.tourCancel = false;
    const frames = keyframes && keyframes.length > 0 ? keyframes : this.autoOrbitKeyframes();
    this.tour = frames;
    this.tourIndex = 0;
    while (!this.tourCancel && this.tour) {
      const kf = frames[this.tourIndex % frames.length];
      const ok = await flyTo(this.viewer, kf, kf.durationS ?? 8);
      if (!ok || this.tourCancel) break;
      this.tourIndex++;
    }
  }

  stopTour(): void { this.tourCancel = true; this.tour = null; }

  private autoOrbitKeyframes(): TourKeyframe[] {
    const c = this.viewer.camera.positionCartographic;
    const lat = CMath.toDegrees(c.latitude);
    const lon = CMath.toDegrees(c.longitude);
    const h = Math.max(300, c.height);
    const frames: TourKeyframe[] = [];
    const r = (h * 0.8) / 111_000;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      frames.push({ lat: lat + Math.cos(a) * r, lon: lon + (Math.sin(a) * r) / Math.max(0.2, Math.cos(c.latitude)), heightM: h, headingDeg: ((a * 180) / Math.PI + 180) % 360, pitchDeg: -35, durationS: 6 });
    }
    return frames;
  }

  private enterGround(): void {
    const cam = this.viewer.camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(cam);
    this.lastGround = ground ?? null;
    const eye = this.mode === 'drive' ? this.driveParams.eyeHeightM : EYE_HEIGHT_WALK;
    const h = ground !== undefined ? ground + eye : Math.min(cam.height, (ground ?? 0) + eye + 50);
    this.bodyPos = Cartesian3.fromRadians(cam.longitude, cam.latitude, h);
    this.bodyHeightAgl = h - (ground ?? h);
    // Keep a generous slice of sky in view when dropping to the ground from a steep flight.
    this.pitch = Math.max(this.pitch, CMath.toRadians(-10));
  }

  /**
   * Third-person bodies are plain primitives whose model matrix is updated every frame. (An Entity with a position
   * that changes every frame rebuilds an asynchronous primitive each frame and never becomes visible.)
   */
  private updateAvatars(): void {
    const showWalker = this.mode === 'walk' && this.view === 'third';
    const showCar = this.mode === 'drive' && this.view === 'third';
    if (showWalker && !this.avatar) {
      const body = new GeometryInstance({ geometry: new CylinderGeometry({ length: 1.5, topRadius: 0.26, bottomRadius: 0.3, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 0.75)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#3b6ea5')) } });
      const head = new GeometryInstance({ geometry: new EllipsoidGeometry({ radii: new Cartesian3(0.14, 0.14, 0.16), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 1.68)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#d9b38c')) } });
      this.avatar = this.viewer.scene.primitives.add(new Primitive({ geometryInstances: [body, head], appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows: ShadowMode.ENABLED, allowPicking: false }));
    }
    if (this.avatar) this.avatar.show = showWalker;
    if (showCar && !this.vehicle) {
      const chassis = new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(4.3, 1.85, 0.7), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 0.55)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#b8352a')) } });
      const cabin = new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(2.2, 1.7, 0.65), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(-0.3, 0, 1.2)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#2b2f36')) } });
      this.vehicle = this.viewer.scene.primitives.add(new Primitive({ geometryInstances: [chassis, cabin], appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows: ShadowMode.ENABLED, allowPicking: false }));
    }
    if (this.vehicle) this.vehicle.show = showCar && !this.customVehicle;
    if (this.customVehicle) this.customVehicle.show = this.mode === 'drive';
  }

  private update(time: JulianDate): void {
    const now = performance.now();
    const dt = this.lastTime === null ? 0.016 : Math.min(0.25, (now - this.lastTime) / 1000);
    this.lastTime = now;
    void time;
    if (this.mode === 'orbit' || this.mode === 'cinematic') return;
    const frame = this.input.poll();
    const lookSens = 0.0025;
    if (this.mode === 'passenger') {
      // Free look from a seat/window: the journey owns the position and base heading.
      this.lookOffset = Math.max(-2.6, Math.min(2.6, this.lookOffset + frame.lookDx * lookSens));
      this.pitch = Math.max(CMath.toRadians(-60), Math.min(CMath.toRadians(60), this.pitch - frame.lookDy * lookSens));
      this.applyPassengerCamera();
      this.emit();
      return;
    }
    this.heading = (this.heading + frame.lookDx * lookSens) % (Math.PI * 2);
    this.pitch = Math.max(CMath.toRadians(-89), Math.min(CMath.toRadians(89), this.pitch - frame.lookDy * lookSens));
    if (this.mode === 'fly') this.updateFly(frame, dt);
    else this.updateGround(frame, dt);
  }

  private frameVectors(position: Cartesian3): { east: Cartesian3; north: Cartesian3; up: Cartesian3 } {
    const enu = Transforms.eastNorthUpToFixedFrame(position);
    return {
      east: Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_X, new Cartesian3()),
      north: Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_Y, new Cartesian3()),
      up: Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_Z, new Cartesian3()),
    };
  }

  private updateFly(frame: ReturnType<InputManager['poll']>, dt: number): void {
    const camera = this.viewer.camera;
    const carto = camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(carto);
    const agl = ground === undefined ? carto.height : carto.height - ground;
    const base = Math.max(3, Math.abs(agl) * 0.5) * this.speed * (frame.sprint ? 3 : 1);
    const { east, north, up } = this.frameVectors(camera.position);
    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    const forwardH = Cartesian3.add(Cartesian3.multiplyByScalar(east, sinH, new Cartesian3()), Cartesian3.multiplyByScalar(north, cosH, new Cartesian3()), new Cartesian3());
    const right = Cartesian3.add(Cartesian3.multiplyByScalar(east, cosH, new Cartesian3()), Cartesian3.multiplyByScalar(north, -sinH, new Cartesian3()), new Cartesian3());
    const forward = Cartesian3.add(Cartesian3.multiplyByScalar(forwardH, Math.cos(this.pitch), new Cartesian3()), Cartesian3.multiplyByScalar(up, Math.sin(this.pitch), new Cartesian3()), new Cartesian3());
    const move = new Cartesian3();
    Cartesian3.add(move, Cartesian3.multiplyByScalar(forward, frame.moveY * base * dt, new Cartesian3()), move);
    Cartesian3.add(move, Cartesian3.multiplyByScalar(right, frame.moveX * base * dt, new Cartesian3()), move);
    Cartesian3.add(move, Cartesian3.multiplyByScalar(up, frame.moveZ * base * dt, new Cartesian3()), move);
    const next = Cartesian3.add(camera.position, move, new Cartesian3());
    const nextCarto = Cartographic.fromCartesian(next);
    const nextGround = this.viewer.scene.globe.getHeight(nextCarto);
    const minH = (nextGround ?? -100) + 2;
    if (nextCarto.height < minH) nextCarto.height = minH;
    camera.setView({ destination: Cartesian3.fromRadians(nextCarto.longitude, nextCarto.latitude, nextCarto.height), orientation: { heading: this.heading, pitch: this.pitch, roll: 0 } });
  }

  private groundAt(carto: Cartographic): number | null {
    const lat = CMath.toDegrees(carto.latitude), lon = CMath.toDegrees(carto.longitude);
    if (this.groundOverride) {
      const o = this.groundOverride(lat, lon);
      if (o !== null) return o;
    }
    const g = this.viewer.scene.globe.getHeight(carto);
    let h = g === undefined ? null : g;
    if (this.extraHeightSampler) {
      const extra = this.extraHeightSampler(lat, lon);
      if (extra !== null && (h === null || extra > h)) h = extra;
    }
    for (const fn of this.heightSamplers) {
      const extra = fn(lat, lon);
      if (extra !== null && (h === null || extra > h)) h = extra;
    }
    return h;
  }

  private updateGround(frame: ReturnType<InputManager['poll']>, dt: number): void {
    const camera = this.viewer.camera;
    const isDrive = this.mode === 'drive';
    const eye = isDrive ? this.driveParams.eyeHeightM : EYE_HEIGHT_WALK;
    const carto = Cartographic.fromCartesian(this.bodyPos);
    const ground = this.groundAt(carto);
    if (ground !== null) this.lastGround = ground;
    const g = this.lastGround ?? carto.height - eye;
    const { east, north, up } = this.frameVectors(this.bodyPos);
    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    const forward = Cartesian3.add(Cartesian3.multiplyByScalar(east, sinH, new Cartesian3()), Cartesian3.multiplyByScalar(north, cosH, new Cartesian3()), new Cartesian3());
    const right = Cartesian3.add(Cartesian3.multiplyByScalar(east, cosH, new Cartesian3()), Cartesian3.multiplyByScalar(north, -sinH, new Cartesian3()), new Cartesian3());
    const move = new Cartesian3();
    if (isDrive) {
      const accel = this.driveParams.accelMs2 * this.speed;
      const maxSpeed = this.driveParams.maxSpeedMs * this.speed;
      if (frame.moveY > 0) this.driveSpeed += accel * dt * frame.moveY;
      else if (frame.moveY < 0) this.driveSpeed -= (this.driveSpeed > 0 ? accel * 2 : accel * 0.6) * dt;
      else this.driveSpeed *= Math.max(0, 1 - 0.45 * dt);
      if (frame.brake) this.driveSpeed *= Math.max(0, 1 - 4 * dt);
      this.driveSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.driveSpeed));
      // Steering: turn rate scales with speed; heading also follows mouse look for camera aiming.
      const steer = frame.moveX * Math.min(1, Math.abs(this.driveSpeed) / 6) * this.driveParams.turnRate * (this.driveSpeed < 0 ? -1 : 1);
      this.heading = (this.heading + steer * dt) % (Math.PI * 2);
      Cartesian3.add(move, Cartesian3.multiplyByScalar(forward, this.driveSpeed * dt, new Cartesian3()), move);
    } else {
      const walk = (frame.sprint ? 5.5 : 1.6) * this.speed;
      Cartesian3.add(move, Cartesian3.multiplyByScalar(forward, frame.moveY * walk * dt, new Cartesian3()), move);
      Cartesian3.add(move, Cartesian3.multiplyByScalar(right, frame.moveX * walk * dt, new Cartesian3()), move);
      if (frame.jump && this.onGround) this.verticalVel = 4.5;
    }
    // Gravity and terrain collision.
    this.verticalVel -= GRAVITY * dt;
    this.bodyHeightAgl += this.verticalVel * dt;
    if (this.verticalVel < -1 && this.fallStartHeight === null) this.fallStartHeight = g + this.bodyHeightAgl;
    if (this.bodyHeightAgl <= 0) {
      this.bodyHeightAgl = 0; this.verticalVel = 0; this.onGround = true;
      if (this.fallStartHeight !== null) { const fall = this.fallStartHeight - g; this.fallStartHeight = null; if (fall > 4) this.onFall?.(fall); }
    } else this.onGround = false;
    let next = Cartesian3.add(this.bodyPos, move, new Cartesian3());
    let nextCarto = Cartographic.fromCartesian(next);
    if (this.moveFilter && Cartesian3.magnitude(move) > 0) {
      const filtered = this.moveFilter({ lat: CMath.toDegrees(carto.latitude), lon: CMath.toDegrees(carto.longitude) }, { lat: CMath.toDegrees(nextCarto.latitude), lon: CMath.toDegrees(nextCarto.longitude) });
      if (!filtered) { next = Cartesian3.clone(this.bodyPos); nextCarto = Cartographic.fromCartesian(next); if (isDrive) this.driveSpeed *= 0.2; }
      else { nextCarto = Cartographic.fromDegrees(filtered.lon, filtered.lat, nextCarto.height); next = Cartesian3.fromRadians(nextCarto.longitude, nextCarto.latitude, nextCarto.height); }
    }
    const nextGround = this.groundAt(nextCarto) ?? g;
    // Block walking up walls steeper than ~60° (buildings) — keep the previous position.
    const rise = nextGround - g;
    const dist = Cartesian3.magnitude(move);
    if (dist > 0 && rise > 2.5 && rise / dist > 1.7 && this.bodyHeightAgl < rise) {
      if (isDrive) this.driveSpeed = 0;
    } else {
      this.lastGround = nextGround;
      this.bodyPos = Cartesian3.fromRadians(nextCarto.longitude, nextCarto.latitude, nextGround + this.bodyHeightAgl);
    }
    void up;
    // Camera placement.
    const bodyCarto = Cartographic.fromCartesian(this.bodyPos);
    if (this.view === 'first') {
      camera.setView({ destination: Cartesian3.fromRadians(bodyCarto.longitude, bodyCarto.latitude, bodyCarto.height + eye), orientation: { heading: this.heading, pitch: this.pitch, roll: 0 } });
    } else {
      const back = isDrive ? this.driveParams.followBackM : 7.5;
      const upOff = isDrive ? this.driveParams.followUpM : 3;
      const f = this.frameVectors(this.bodyPos);
      const fwd = Cartesian3.add(Cartesian3.multiplyByScalar(f.east, sinH, new Cartesian3()), Cartesian3.multiplyByScalar(f.north, cosH, new Cartesian3()), new Cartesian3());
      const camPos = Cartesian3.add(this.bodyPos, Cartesian3.multiplyByScalar(fwd, -back, new Cartesian3()), new Cartesian3());
      Cartesian3.add(camPos, Cartesian3.multiplyByScalar(f.up, upOff, new Cartesian3()), camPos);
      const camCarto = Cartographic.fromCartesian(camPos);
      const camGround = this.groundAt(camCarto);
      if (camGround !== null && camCarto.height < camGround + 1.2) Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, camGround + 1.2, undefined, camPos);
      camera.setView({ destination: camPos, orientation: { heading: this.heading, pitch: Math.min(this.pitch, CMath.toRadians(-8)), roll: 0 } });
    }
    const body = isDrive ? (this.customVehicle ?? this.vehicle) : this.avatar;
    if (body && body.show) {
      // Cesium's heading is measured from north; the box/cylinder frames point +x east, so rotate by heading − 90°.
      const hpr = new HeadingPitchRoll(this.heading - Math.PI / 2, 0, 0);
      const pos = Cartesian3.fromRadians(bodyCarto.longitude, bodyCarto.latitude, bodyCarto.height);
      body.modelMatrix = Transforms.headingPitchRollToFixedFrame(pos, hpr);
    }
    this.emit();
  }

  /** Current ground body position (lat/lon) in walk/drive modes. */
  bodyLatLon(): { lat: number; lon: number } {
    const c = Cartographic.fromCartesian(this.bodyPos);
    return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude) };
  }

  destroy(): void {
    this.removePreUpdate();
    this.input.destroy();
    if (this.avatar) this.viewer.scene.primitives.remove(this.avatar);
    if (this.vehicle) this.viewer.scene.primitives.remove(this.vehicle);
  }
}
