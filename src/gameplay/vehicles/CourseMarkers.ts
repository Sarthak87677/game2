import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, GeometryInstance, HeadingPitchRoll, LabelCollection, LabelStyle, Math as CMath, Matrix4, PerInstanceColorAppearance, Primitive, Transforms, VerticalOrigin, type PrimitiveCollection } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { distanceM } from '@/gameplay/GameplayHost';
import type { TimeTrialCourse } from './logic';
import { TIME_TRIAL_COURSES } from './courses';
import { bearingDeg } from './logic';

interface Gate { course: TimeTrialCourse; index: number; prim: Primitive | null; groundM: number | null; label: number }

const POST = Color.fromCssColorString('#f2f2f2');
const BANNER = Color.fromCssColorString('#2f6db5');
const ACTIVE = Color.fromCssColorString('#ffb400');
const VF = PerInstanceColorAppearance.VERTEX_FORMAT;

/**
 * Checkpoint gates (two posts and a banner) for the closed-course time trial, built when the player is within a few
 * kilometres and disposed when far. The next gate of a running lap is highlighted.
 */
export class CourseMarkers {
  private gates: Gate[] = [];
  private labels: LabelCollection;
  private lastSync = 0;
  private activeCourse: TimeTrialCourse | null = null;
  private activeIndex = 0;

  constructor(private readonly collection: PrimitiveCollection, private readonly engine: TerraEngine) {
    this.labels = collection.add(new LabelCollection());
    for (const course of TIME_TRIAL_COURSES) course.checkpoints.forEach((_, index) => {
      const cp = course.checkpoints[index];
      const label = this.labels.add({ position: Cartesian3.fromDegrees(cp.lon, cp.lat, 6), text: `${cp.name ?? `Checkpoint ${index}`}\n(fictional course marker)`, font: '13px system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK.withAlpha(0.8), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, show: false, disableDepthTestDistance: 100 });
      this.gates.push({ course, index, prim: null, groundM: null, label: this.labels.length - 1 });
      void label;
    });
  }

  setActive(course: TimeTrialCourse | null, nextIndex: number): void {
    this.activeCourse = course;
    this.activeIndex = nextIndex;
    for (const g of this.gates) this.recolour(g);
  }

  private recolour(g: Gate): void {
    if (!g.prim?.ready) return;
    const active = this.activeCourse === g.course && (this.activeIndex % g.course.checkpoints.length) === g.index;
    const attrs = g.prim.getGeometryInstanceAttributes('banner');
    if (attrs) attrs.color = ColorGeometryInstanceAttribute.toValue(active ? ACTIVE : BANNER, attrs.color);
  }

  update(lat: number, lon: number, nowMs: number): void {
    if (nowMs - this.lastSync < 1200) return;
    this.lastSync = nowMs;
    for (const g of this.gates) {
      const cp = g.course.checkpoints[g.index];
      const d = distanceM(lat, lon, cp.lat, cp.lon);
      const label = this.labels.get(g.label);
      if (d < 4000) {
        const ground = this.engine.groundHeightAt(cp.lat, cp.lon);
        if (ground !== null && ground !== g.groundM) {
          g.groundM = ground;
          if (g.prim) { this.collection.remove(g.prim); g.prim = null; }
        }
        if (!g.prim && g.groundM !== null) g.prim = this.build(g, g.groundM);
        if (g.prim) this.recolour(g);
        label.show = g.groundM !== null && d < 1500;
        if (g.groundM !== null) label.position = Cartesian3.fromDegrees(cp.lon, cp.lat, g.groundM + 6.5);
      } else if (g.prim) { this.collection.remove(g.prim); g.prim = null; label.show = false; }
    }
  }

  private build(g: Gate, groundM: number): Primitive {
    const cps = g.course.checkpoints;
    const cp = cps[g.index];
    const nxt = cps[(g.index + 1) % cps.length];
    const heading = CMath.toRadians(bearingDeg(cp.lat, cp.lon, nxt.lat, nxt.lon));
    const frame = Transforms.headingPitchRollToFixedFrame(Cartesian3.fromDegrees(cp.lon, cp.lat, groundM), new HeadingPitchRoll(heading - Math.PI / 2, 0, 0));
    const box = (x: number, y: number, z: number, l: number, w: number, h: number, c: Color, id?: string) => new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(l, w, h), vertexFormat: VF }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(x, y, z)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(c) }, id });
    // Gate spans the road: posts 8 m apart (perpendicular to travel = local y), banner 5 m up.
    const instances = [box(0, 4.2, 2.6, 0.3, 0.3, 5.2, POST), box(0, -4.2, 2.6, 0.3, 0.3, 5.2, POST), box(0, 0, 5.0, 0.25, 8.7, 0.9, BANNER, 'banner')];
    return this.collection.add(new Primitive({ geometryInstances: instances, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), modelMatrix: frame, asynchronous: false, allowPicking: false }));
  }

  destroy(): void {
    for (const g of this.gates) if (g.prim) this.collection.remove(g.prim);
    this.collection.remove(this.labels);
    this.gates = [];
  }
}
