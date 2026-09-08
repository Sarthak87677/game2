/**
 * Cheap vehicle bodies built from boxes and cylinders in a local frame (+x forward, +y left, +z up) as a single
 * Primitive whose model matrix is updated each frame (Entities with per-frame positions never render). Matrices are
 * pooled — no per-frame allocation.
 */
import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, CylinderGeometry, GeometryInstance, HeadingPitchRoll, Matrix3, Matrix4, PerInstanceColorAppearance, Primitive, ShadowMode, Transforms, type Viewer } from 'cesium';

export interface BoxPart { kind: 'box'; size: [number, number, number]; at: [number, number, number]; color: string; yawDeg?: number }
export interface CylinderPart { kind: 'cylinder'; radius: number; topRadius?: number; length: number; at: [number, number, number]; axis: 'x' | 'y' | 'z'; color: string }
export type BodyPart = BoxPart | CylinderPart;

const VF = PerInstanceColorAppearance.VERTEX_FORMAT;
const scratchHpr = new HeadingPitchRoll();
const scratchM4 = new Matrix4();
const scratchM4b = new Matrix4();

function partMatrix(at: [number, number, number], rot?: Matrix3): Matrix4 {
  const m = Matrix4.fromTranslation(new Cartesian3(at[0], at[1], at[2]));
  if (rot) Matrix4.multiplyByMatrix3(m, rot, m);
  return m;
}

function instance(part: BodyPart): GeometryInstance {
  const color = ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(part.color));
  if (part.kind === 'box') {
    const rot = part.yawDeg ? Matrix3.fromRotationZ((part.yawDeg * Math.PI) / 180) : undefined;
    return new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(part.size[0], part.size[1], part.size[2]), vertexFormat: VF }), modelMatrix: partMatrix(part.at, rot), attributes: { color } });
  }
  const rot = part.axis === 'x' ? Matrix3.fromRotationY(Math.PI / 2) : part.axis === 'y' ? Matrix3.fromRotationX(Math.PI / 2) : undefined;
  return new GeometryInstance({ geometry: new CylinderGeometry({ length: part.length, bottomRadius: part.radius, topRadius: part.topRadius ?? part.radius, vertexFormat: VF, slices: 12 }), modelMatrix: partMatrix(part.at, rot), attributes: { color } });
}

/** A posable rigid body. `setPose` takes an ECEF position, heading (rad, clockwise from north), pitch and roll. */
export class BodyModel {
  readonly primitive: Primitive;
  private disposed = false;
  constructor(private readonly viewer: Viewer, parts: BodyPart[], opts: { translucent?: boolean; shadows?: boolean } = {}) {
    this.primitive = viewer.scene.primitives.add(new Primitive({
      geometryInstances: parts.map(instance),
      appearance: new PerInstanceColorAppearance({ translucent: opts.translucent ?? false, closed: true }),
      asynchronous: false,
      shadows: opts.shadows === false ? ShadowMode.DISABLED : ShadowMode.ENABLED,
      allowPicking: false,
    }));
    this.primitive.show = false;
  }

  get show(): boolean { return this.primitive.show; }
  set show(v: boolean) { if (!this.disposed) this.primitive.show = v; }

  setPose(position: Cartesian3, headingRad: number, pitchRad = 0, rollRad = 0): void {
    if (this.disposed) return;
    // Cesium's HPR heading is measured from north but the local +x axis points east, hence the −90°.
    scratchHpr.heading = headingRad - Math.PI / 2;
    scratchHpr.pitch = pitchRad;
    scratchHpr.roll = rollRad;
    Transforms.headingPitchRollToFixedFrame(position, scratchHpr, undefined, undefined, this.primitive.modelMatrix);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.viewer.scene.primitives.remove(this.primitive);
  }
}

/** Builds the world matrix (heading from north) for a pose; pooled result for one-off local→world transforms. */
export function poseMatrix(position: Cartesian3, headingRad: number, pitchRad = 0, rollRad = 0, result: Matrix4 = scratchM4): Matrix4 {
  scratchHpr.heading = headingRad - Math.PI / 2;
  scratchHpr.pitch = pitchRad;
  scratchHpr.roll = rollRad;
  return Transforms.headingPitchRollToFixedFrame(position, scratchHpr, undefined, undefined, result);
}

/** Transforms a local offset (forward, left, up) of a posed body into ECEF. */
export function localToWorld(position: Cartesian3, headingRad: number, forward: number, left: number, up: number, result: Cartesian3, pitchRad = 0, rollRad = 0): Cartesian3 {
  const m = poseMatrix(position, headingRad, pitchRad, rollRad, scratchM4b);
  const local = Cartesian3.fromElements(forward, left, up, result);
  return Matrix4.multiplyByPoint(m, local, result);
}

/** Inverse: ECEF point → local (forward, left, up) of a posed body. */
export function worldToLocal(position: Cartesian3, headingRad: number, world: Cartesian3, result: Cartesian3): Cartesian3 {
  const m = poseMatrix(position, headingRad, 0, 0, scratchM4b);
  const inv = Matrix4.inverseTransformation(m, scratchM4);
  return Matrix4.multiplyByPoint(inv, world, result);
}

