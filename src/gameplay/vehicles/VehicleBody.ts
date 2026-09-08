import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, CylinderGeometry, GeometryInstance, HeadingPitchRoll, Matrix3, Matrix4, PerInstanceColorAppearance, Primitive, ShadowMode, Transforms, type PrimitiveCollection } from 'cesium';
import type { LampKind, PartTone, VehicleSpec } from './catalog';

export interface LampState {
  headlights: boolean;
  brake: boolean;
  indicatorLeft: boolean;
  indicatorRight: boolean;
  /** Roof beacon (taxi/rickshaw/bus destination light). */
  roof: boolean;
  /** Night: running lights and headlight beams. */
  night: boolean;
}

const OFF: LampState = { headlights: false, brake: false, indicatorLeft: false, indicatorRight: false, roof: false, night: false };

const TONES: Record<Exclude<PartTone, 'paint' | 'accent'>, string> = { glass: '#4c6f8f', dark: '#1e2226', chrome: '#c7ccd2', canvas: '#c9b48a', wood: '#8a6a44' };
const TYRE = Color.fromCssColorString('#1b1c1e');
const RIM = Color.fromCssColorString('#b7bcc2');
const LAMP_COLOURS: Record<LampKind, { off: string; on: string; dim?: string }> = {
  head: { off: '#c8d3da', on: '#fff7d0' },
  tail: { off: '#6e1c1c', on: '#ff2d1a', dim: '#b8200f' },
  indicatorLeft: { off: '#a86d2c', on: '#ffb400' },
  indicatorRight: { off: '#a86d2c', on: '#ffb400' },
  roof: { off: '#d8cf8a', on: '#fff4a8' },
};

const VF = PerInstanceColorAppearance.VERTEX_FORMAT;
const scratchHpr = new HeadingPitchRoll();
const scratchM3a = new Matrix3();
const scratchM3b = new Matrix3();
const scratchM3c = new Matrix3();
const scratchM4 = new Matrix4();
const scratchT = new Cartesian3();
const scratchColor = new Color();
const ROT_X90 = Matrix3.fromRotationX(Math.PI / 2);

function box(x: number, y: number, z: number, l: number, w: number, h: number, colour: Color, id?: string): GeometryInstance {
  return new GeometryInstance({
    geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(l, w, h), vertexFormat: VF }),
    modelMatrix: Matrix4.fromTranslation(new Cartesian3(x, y, z)),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(colour) },
    id,
  });
}

/**
 * Primitive-built vehicle: chassis/cabin boxes, wheels that spin and steer, lamps (head, tail/brake, indicators, roof
 * beacon), optional interior (dashboard, steering wheel, wipers) and headlight beams. Geometry is built once; every
 * frame only model matrices change (an Entity with per-frame positions never renders in Cesium).
 */
export class VehicleBody {
  readonly primitive: Primitive;
  private wheels: { spin: number; prim: Primitive; x: number; y: number; r: number; steers: boolean }[] = [];
  private lamps: Primitive;
  private beams: Primitive;
  private interior: Primitive | null = null;
  private wipers: Primitive | null = null;
  private wiperPivot = { x: 0, y: 0, z: 0 };
  private wiperAngle = -0.2;
  private wiperActive = false;
  private frame = new Matrix4();
  private lampState: LampState = { ...OFF };
  private lampApplied = false;
  private damage = 0;
  private appliedDamage = -1;
  private paintIds: string[] = [];
  private paint: Color;
  private visible = true;
  private interiorVisible = false;
  private destroyed = false;

  constructor(private readonly collection: PrimitiveCollection, readonly spec: VehicleSpec, readonly paintCss: string = spec.colours[0], opts: { interior?: boolean; shadows?: boolean } = {}) {
    const shadows = opts.shadows === false ? ShadowMode.DISABLED : ShadowMode.ENABLED;
    this.paint = Color.fromCssColorString(paintCss);
    const accent = Color.fromCssColorString(spec.accent);
    const instances: GeometryInstance[] = spec.parts.map((p, i) => {
      const colour = p.tone === 'paint' ? this.paint : p.tone === 'accent' ? accent : Color.fromCssColorString(TONES[p.tone]);
      const id = p.tone === 'paint' ? `paint:${i}` : undefined;
      if (id) this.paintIds.push(id);
      return box(p.x, p.y, p.z, p.l, p.w, p.h, colour, id);
    });
    this.primitive = collection.add(new Primitive({ geometryInstances: instances, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows, allowPicking: false }));
    for (const w of spec.wheels) {
      const tyre = new GeometryInstance({ geometry: new CylinderGeometry({ length: w.widthM, topRadius: w.radiusM, bottomRadius: w.radiusM, slices: 16, vertexFormat: VF }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(TYRE) } });
      const spoke = box(0, 0, 0, w.radiusM * 1.5, 0.06, w.widthM + 0.01, RIM);
      const hub = new GeometryInstance({ geometry: new CylinderGeometry({ length: w.widthM + 0.02, topRadius: w.radiusM * 0.35, bottomRadius: w.radiusM * 0.35, slices: 10, vertexFormat: VF }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(RIM) } });
      const prim = collection.add(new Primitive({ geometryInstances: [tyre, spoke, hub], appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows, allowPicking: false }));
      this.wheels.push({ spin: 0, prim, x: w.x, y: w.y, r: w.radiusM, steers: w.steers });
    }
    const lampInstances = spec.lamps.map((l, i) => box(l.x, l.y, l.z, l.sizeM * 0.35, l.sizeM, l.sizeM * 0.8, Color.fromCssColorString(LAMP_COLOURS[l.kind].off), `lamp:${l.kind}:${i}`));
    this.lamps = collection.add(new Primitive({ geometryInstances: lampInstances, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, allowPicking: false }));
    const heads = spec.lamps.filter((l) => l.kind === 'head');
    const beamColour = Color.fromCssColorString('#fff2b0').withAlpha(0.16);
    const beamInstances = heads.map((l) => box(l.x + 3.6, l.y, l.z - 0.15, 7, 1.1, 0.5, beamColour));
    this.beams = collection.add(new Primitive({ geometryInstances: beamInstances, appearance: new PerInstanceColorAppearance({ translucent: true, closed: false }), asynchronous: false, allowPicking: false, show: false }));
    if (opts.interior) this.buildInterior();
  }

  /** Dashboard, steering wheel and wipers seen from the driver's seat (visible in first-person/dashboard cameras). */
  private buildInterior(): void {
    const s = this.spec;
    const windscreen = s.parts.filter((p) => p.tone === 'glass').sort((a, b) => (b.x + b.l / 2) - (a.x + a.l / 2))[0];
    const frontX = windscreen ? windscreen.x + windscreen.l / 2 : s.lengthM / 2 - 0.6;
    const cabinW = windscreen ? windscreen.w - 0.2 : s.widthM - 0.3;
    const eye = s.drive.eyeHeightM;
    const dark = Color.fromCssColorString('#2a2d31');
    const cluster = Color.fromCssColorString('#101418');
    const dash = box(frontX - 0.3, 0, eye - 0.32, 0.5, cabinW, 0.22, dark);
    const clusterBox = box(frontX - 0.42, -0.36, eye - 0.16, 0.08, 0.34, 0.14, cluster);
    const wheelRot = Matrix3.fromRotationY(Math.PI / 2 - 0.35);
    const wheelPos = new Cartesian3(frontX - 0.75, -0.36, eye - 0.2);
    const wheel = new GeometryInstance({ geometry: new CylinderGeometry({ length: 0.03, topRadius: 0.19, bottomRadius: 0.19, slices: 24, vertexFormat: VF }), modelMatrix: Matrix4.fromRotationTranslation(wheelRot, wheelPos), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#3a3d42')) } });
    const hub = new GeometryInstance({ geometry: new CylinderGeometry({ length: 0.06, topRadius: 0.06, bottomRadius: 0.06, slices: 12, vertexFormat: VF }), modelMatrix: Matrix4.fromRotationTranslation(wheelRot, wheelPos), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#5a5e64')) } });
    const seatL = box(-0.2, 0.36, 0.55, 0.5, 0.5, 0.5, Color.fromCssColorString('#4a4f56'));
    const seatR = box(-0.2, -0.36, 0.55, 0.5, 0.5, 0.5, Color.fromCssColorString('#4a4f56'));
    this.interior = this.collection.add(new Primitive({ geometryInstances: [dash, clusterBox, wheel, hub, seatL, seatR], appearance: new PerInstanceColorAppearance({ translucent: false, closed: false }), asynchronous: false, allowPicking: false, show: false }));
    // Two wiper blades: thin boxes hinged at the base of the windscreen, swept by rotating about the vehicle x-axis.
    this.wiperPivot = { x: frontX + 0.03, y: 0, z: eye - 0.42 };
    const blade = Color.fromCssColorString('#111214');
    const bladeL = box(0, 0.32, 0.28, 0.02, 0.025, 0.56, blade);
    const bladeR = box(0, -0.28, 0.28, 0.02, 0.025, 0.56, blade);
    this.wipers = this.collection.add(new Primitive({ geometryInstances: [bladeL, bladeR], appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, allowPicking: false, show: false }));
  }

  get show(): boolean { return this.visible; }
  set show(v: boolean) {
    this.visible = v;
    this.primitive.show = v;
    this.lamps.show = v;
    for (const w of this.wheels) w.prim.show = v;
    this.beams.show = v && this.lampState.headlights && this.lampState.night;
    if (this.interior) this.interior.show = v && this.interiorVisible;
    if (this.wipers) this.wipers.show = v && this.interiorVisible;
  }

  /** Interior parts are only worth drawing for the vehicle the player sits in. */
  setInteriorVisible(v: boolean): void {
    this.interiorVisible = v;
    if (this.interior) this.interior.show = v && this.visible;
    if (this.wipers) this.wipers.show = v && this.visible;
  }

  setWipers(active: boolean): void { this.wiperActive = active; }

  /** Current vehicle frame (ECEF ← vehicle) as set by the last setPose. */
  get modelMatrix(): Matrix4 { return this.frame; }

  /**
   * Places the vehicle with its origin at `position` (on the ground) facing `headingRad` (Cesium heading from north),
   * spins the wheels by the distance travelled and steers the front wheels.
   */
  setPose(position: Cartesian3, headingRad: number, dt = 0, speedMs = 0, steerRad = 0): void {
    if (this.destroyed) return;
    scratchHpr.heading = headingRad - Math.PI / 2; scratchHpr.pitch = 0; scratchHpr.roll = 0;
    Transforms.headingPitchRollToFixedFrame(position, scratchHpr, undefined, undefined, this.frame);
    this.primitive.modelMatrix = this.frame;
    this.lamps.modelMatrix = this.frame;
    this.beams.modelMatrix = this.frame;
    if (this.interior) this.interior.modelMatrix = this.frame;
    for (const w of this.wheels) {
      if (dt > 0) w.spin = (w.spin + (speedMs * dt) / w.r) % (Math.PI * 2);
      // local = T(x, y, r) · Rz(steer) · Rx(90°) · Rz(spin)  (cylinder axis z → axle along y)
      Matrix3.fromRotationZ(w.spin, scratchM3a);
      Matrix3.multiply(ROT_X90, scratchM3a, scratchM3b);
      if (w.steers && steerRad !== 0) { Matrix3.fromRotationZ(steerRad, scratchM3a); Matrix3.multiply(scratchM3a, scratchM3b, scratchM3c); } else Matrix3.clone(scratchM3b, scratchM3c);
      scratchT.x = w.x; scratchT.y = w.y; scratchT.z = w.r;
      Matrix4.fromRotationTranslation(scratchM3c, scratchT, scratchM4);
      w.prim.modelMatrix = Matrix4.multiply(this.frame, scratchM4, w.prim.modelMatrix);
    }
    if (this.wipers && this.wipers.show) {
      const target = this.wiperActive ? this.wiperAngle : -0.2;
      if (this.wiperActive) this.wiperAngle = -0.2 + (Math.sin(performance.now() / 350) + 1) * 0.65;
      else this.wiperAngle += (target - this.wiperAngle) * Math.min(1, dt * 6);
      Matrix3.fromRotationX(this.wiperAngle, scratchM3a);
      scratchT.x = this.wiperPivot.x; scratchT.y = this.wiperPivot.y; scratchT.z = this.wiperPivot.z;
      Matrix4.fromRotationTranslation(scratchM3a, scratchT, scratchM4);
      this.wipers.modelMatrix = Matrix4.multiply(this.frame, scratchM4, this.wipers.modelMatrix);
    }
    this.applyPending();
  }

  setLamps(s: Partial<LampState>): void {
    let changed = false;
    for (const k of Object.keys(s) as (keyof LampState)[]) {
      const v = s[k];
      if (v !== undefined && this.lampState[k] !== v) { this.lampState[k] = v; changed = true; }
    }
    if (changed) { this.lampApplied = false; this.beams.show = this.visible && this.lampState.headlights && this.lampState.night; }
  }

  /** Non-graphic damage 0..1: paint darkens/scuffs after hard impacts. */
  setDamage(d: number): void { this.damage = Math.max(0, Math.min(1, d)); }
  get damageLevel(): number { return this.damage; }

  /** Per-instance colour changes only work once the primitive has been rendered once. */
  private applyPending(): void {
    if (!this.lampApplied && this.lamps.ready) {
      const st = this.lampState;
      this.spec.lamps.forEach((l, i) => {
        const attrs = this.lamps.getGeometryInstanceAttributes(`lamp:${l.kind}:${i}`);
        if (!attrs) return;
        const c = LAMP_COLOURS[l.kind];
        const on = l.kind === 'head' ? st.headlights : l.kind === 'tail' ? st.brake : l.kind === 'indicatorLeft' ? st.indicatorLeft : l.kind === 'indicatorRight' ? st.indicatorRight : st.roof;
        const css = on ? c.on : l.kind === 'tail' && st.night && c.dim ? c.dim : c.off;
        attrs.color = ColorGeometryInstanceAttribute.toValue(Color.fromCssColorString(css, scratchColor), attrs.color);
      });
      this.lampApplied = true;
    }
    if (this.appliedDamage !== this.damage && this.primitive.ready) {
      const k = 1 - 0.55 * this.damage;
      Color.multiplyByScalar(this.paint, k, scratchColor);
      scratchColor.alpha = 1;
      for (const id of this.paintIds) {
        const attrs = this.primitive.getGeometryInstanceAttributes(id);
        if (attrs) attrs.color = ColorGeometryInstanceAttribute.toValue(scratchColor, attrs.color);
      }
      this.appliedDamage = this.damage;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const c = this.collection;
    c.remove(this.primitive);
    c.remove(this.lamps);
    c.remove(this.beams);
    for (const w of this.wheels) c.remove(w.prim);
    if (this.interior) c.remove(this.interior);
    if (this.wipers) c.remove(this.wipers);
    this.wheels = [];
  }
}
