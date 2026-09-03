import { Cartesian3, Cartographic, Color, HeadingPitchRoll, JulianDate, Math as CMath, Matrix4, Transforms, type Entity, type Viewer } from 'cesium';
import { InputManager } from './input';
import { flyTo, type CameraTarget } from '@/engine/camera';

export type ModeId = 'orbit' | 'fly' | 'walk' | 'drive' | 'cinematic';
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
const EYE_HEIGHT_DRIVE = 1.35;
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
  private avatar: Entity | null = null;
  private vehicle: Entity | null = null;
  private removePreUpdate: () => void;
  private lastTime: number | null = null;
  private tour: TourKeyframe[] | null = null;
  private tourIndex = 0;
  private tourCancel = false;
  private onGround = false;
  onChange?: (s: ModeState) => void;
  /** Optional extra collision height sampler (e.g. buildings) returning height above ellipsoid or null. */
  extraHeightSampler: ((lat: number, lon: number) => number | null) | null = null;

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
    this.input.pointerLockWanted = mode === 'fly' || mode === 'walk' || mode === 'drive';
    if (!this.input.pointerLockWanted) this.input.releasePointerLock();
    this.heading = this.viewer.camera.heading;
    this.pitch = this.viewer.camera.pitch;
    this.verticalVel = 0;
    this.driveSpeed = 0;
    if (mode === 'walk' || mode === 'drive') this.enterGround();
    this.updateAvatars();
    this.emit();
  }

  getMode(): ModeId { return this.mode; }

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
    const eye = this.mode === 'drive' ? EYE_HEIGHT_DRIVE : EYE_HEIGHT_WALK;
    const h = ground !== undefined ? ground + eye : Math.min(cam.height, (ground ?? 0) + eye + 50);
    this.bodyPos = Cartesian3.fromRadians(cam.longitude, cam.latitude, h);
    this.bodyHeightAgl = h - (ground ?? h);
    this.pitch = Math.max(this.pitch, CMath.toRadians(-20));
  }

  private updateAvatars(): void {
    const showWalker = this.mode === 'walk' && this.view === 'third';
    const showCar = this.mode === 'drive' && this.view === 'third';
    if (showWalker && !this.avatar) {
      this.avatar = this.viewer.entities.add({
        id: 'terra-avatar',
        cylinder: { length: 1.5, topRadius: 0.28, bottomRadius: 0.28, material: Color.fromCssColorString('#3b6ea5'), outline: false },
      });
    }
    if (this.avatar) this.avatar.show = showWalker;
    if (showCar && !this.vehicle) {
      this.vehicle = this.viewer.entities.add({
        id: 'terra-vehicle',
        box: { dimensions: new Cartesian3(4.3, 1.85, 1.4), material: Color.fromCssColorString('#b8352a'), outline: true, outlineColor: Color.BLACK.withAlpha(0.4) },
      });
    }
    if (this.vehicle) this.vehicle.show = showCar;
  }

  private update(time: JulianDate): void {
    const now = performance.now();
    const dt = this.lastTime === null ? 0.016 : Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    void time;
    if (this.mode === 'orbit' || this.mode === 'cinematic') return;
    const frame = this.input.poll();
    const lookSens = 0.0025;
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
    const g = this.viewer.scene.globe.getHeight(carto);
    let h = g === undefined ? null : g;
    if (this.extraHeightSampler) {
      const extra = this.extraHeightSampler(CMath.toDegrees(carto.latitude), CMath.toDegrees(carto.longitude));
      if (extra !== null && (h === null || extra > h)) h = extra;
    }
    return h;
  }

  private updateGround(frame: ReturnType<InputManager['poll']>, dt: number): void {
    const camera = this.viewer.camera;
    const isDrive = this.mode === 'drive';
    const eye = isDrive ? EYE_HEIGHT_DRIVE : EYE_HEIGHT_WALK;
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
      const accel = 5 * this.speed;
      const maxSpeed = 45 * this.speed;
      if (frame.moveY > 0) this.driveSpeed += accel * dt * frame.moveY;
      else if (frame.moveY < 0) this.driveSpeed -= (this.driveSpeed > 0 ? accel * 2 : accel * 0.6) * dt;
      else this.driveSpeed *= Math.max(0, 1 - 0.8 * dt);
      if (frame.brake) this.driveSpeed *= Math.max(0, 1 - 4 * dt);
      this.driveSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.driveSpeed));
      // Steering: turn rate scales with speed; heading also follows mouse look for camera aiming.
      const steer = frame.moveX * Math.min(1, Math.abs(this.driveSpeed) / 6) * 1.4 * (this.driveSpeed < 0 ? -1 : 1);
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
    if (this.bodyHeightAgl <= 0) { this.bodyHeightAgl = 0; this.verticalVel = 0; this.onGround = true; } else this.onGround = false;
    const next = Cartesian3.add(this.bodyPos, move, new Cartesian3());
    const nextCarto = Cartographic.fromCartesian(next);
    const nextGround = this.groundAt(nextCarto) ?? g;
    // Block walking up walls steeper than ~60° (buildings) — keep the previous position.
    const rise = nextGround - g;
    const dist = Cartesian3.magnitude(move);
    if (dist > 0 && rise > 0 && rise / dist > 1.7 && this.bodyHeightAgl < rise) {
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
      const back = isDrive ? 9 : 5;
      const upOff = isDrive ? 3.2 : 2.2;
      const f = this.frameVectors(this.bodyPos);
      const fwd = Cartesian3.add(Cartesian3.multiplyByScalar(f.east, sinH, new Cartesian3()), Cartesian3.multiplyByScalar(f.north, cosH, new Cartesian3()), new Cartesian3());
      const camPos = Cartesian3.add(this.bodyPos, Cartesian3.multiplyByScalar(fwd, -back, new Cartesian3()), new Cartesian3());
      Cartesian3.add(camPos, Cartesian3.multiplyByScalar(f.up, upOff, new Cartesian3()), camPos);
      const camCarto = Cartographic.fromCartesian(camPos);
      const camGround = this.groundAt(camCarto);
      if (camGround !== null && camCarto.height < camGround + 1) camPos.x = Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, camGround + 1).x;
      camera.setView({ destination: camPos, orientation: { heading: this.heading, pitch: Math.min(this.pitch, CMath.toRadians(-8)), roll: 0 } });
    }
    const ent = isDrive ? this.vehicle : this.avatar;
    if (ent && ent.show) {
      const hpr = new HeadingPitchRoll(this.heading - Math.PI / 2, 0, 0);
      const pos = Cartesian3.fromRadians(bodyCarto.longitude, bodyCarto.latitude, bodyCarto.height + (isDrive ? 0.7 : 0.75));
      (ent.position as unknown as { setValue?: (v: Cartesian3) => void }).setValue?.(pos);
      ent.position = pos as never;
      ent.orientation = Transforms.headingPitchRollQuaternion(pos, hpr) as never;
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
    if (this.avatar) this.viewer.entities.remove(this.avatar);
    if (this.vehicle) this.viewer.entities.remove(this.vehicle);
  }
}
