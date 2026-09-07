/**
 * Procedural food/market stalls around crowd hotspots (counter, poles, striped awning, generic Marathi/English sign
 * board), optional festival string lights, all built in the hotspot's local east-north-up frame with one primitive
 * per hotspot. Stalls are original procedural props — the labels say so.
 */
import { BoxGeometry, Cartesian2, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, DistanceDisplayCondition, GeometryInstance, HorizontalOrigin, LabelCollection, LabelStyle, Matrix4, PerInstanceColorAppearance, PointPrimitiveCollection, Primitive, ShadowMode, Transforms, VertexFormat, VerticalOrigin, type Scene } from 'cesium';
import { STALL_SIGNS, type CrowdHotspot } from '@/data/maharashtra/living';
import { fnv1a, Rng } from '@/util/hash';
import { offsetToLonLat } from '@/util/geo';

const AWNING = ['#e53935', '#fb8c00', '#1e88e5', '#43a047', '#8e24aa', '#fdd835'];
const LIGHT_COLOURS = [Color.fromCssColorString('#ff9933'), Color.fromCssColorString('#ffffff'), Color.fromCssColorString('#138808'), Color.fromCssColorString('#ff4fa3'), Color.fromCssColorString('#ffd54f'), Color.fromCssColorString('#4fc3f7')];

export interface StallSpot { lat: number; lon: number; /** Direction (rad from north) a customer faces to look at the counter. */ facing: number; hotspot: string }

interface Built { hotspot: CrowdHotspot; primitive: Primitive; labels: LabelCollection; lights: PointPrimitiveCollection; spots: StallSpot[] }

export class StallLayer {
  private built = new Map<string, Built>();
  private festival = false;
  private frame = 0;

  constructor(private readonly scene: Scene) {}

  get festivalLights(): boolean { return this.festival; }

  setFestivalLights(on: boolean): void {
    this.festival = on;
    for (const b of this.built.values()) b.lights.show = on;
  }

  /** Customer spots (in front of counters) of every built stall within `radiusM` of the point. */
  spotsNear(lat: number, lon: number, radiusM: number, out: StallSpot[] = []): StallSpot[] {
    out.length = 0;
    const dLat = radiusM / 111_132, dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
    for (const b of this.built.values()) for (const s of b.spots) if (Math.abs(s.lat - lat) < dLat && Math.abs(s.lon - lon) < dLon) out.push(s);
    return out;
  }

  /** Builds stalls for hotspots within 700 m of the point and removes those beyond 1.4 km. */
  sync(lat: number, lon: number, hotspots: CrowdHotspot[]): void {
    const near = new Set<string>();
    for (const h of hotspots) {
      const d = Math.hypot((h.lat - lat) * 111_132, (h.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180));
      if (d < 700 && h.stalls > 0) { near.add(h.id); if (!this.built.has(h.id)) this.build(h); }
      else if (d > 1400 && this.built.has(h.id)) this.remove(h.id);
    }
  }

  private build(h: CrowdHotspot): void {
    const carto = Cartographic.fromDegrees(h.lon, h.lat);
    const ground = this.scene.globe.getHeight(carto);
    if (ground === undefined) return; // terrain not yet loaded — retried on the next sync
    const rng = new Rng(fnv1a(`stalls:${h.id}`));
    const anchor = Cartesian3.fromDegrees(h.lon, h.lat, ground);
    const frame = Transforms.eastNorthUpToFixedFrame(anchor);
    const instances: GeometryInstance[] = [];
    const labels = new LabelCollection({ scene: this.scene });
    const lights = new PointPrimitiveCollection();
    const spots: StallSpot[] = [];
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, css: string) => {
      const m = Matrix4.multiply(Matrix4.fromTranslation(new Cartesian3(x, y, z)), rotZ(rot), new Matrix4());
      instances.push(new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(sx, sy, sz), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), modelMatrix: m, attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(css)) } }));
    };
    const n = Math.min(10, h.stalls);
    const startAngle = rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      // Stalls sit on an arc 16–28 m from the anchor, spaced ~5 m apart, facing the anchor.
      const r = 16 + rng.range(0, 12);
      const a = startAngle + (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const local = this.scene.globe.getHeight(Cartographic.fromCartesian(Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, 0), new Cartesian3())));
      const z = local === undefined ? 0 : local - ground;
      const facing = Math.atan2(-y, -x); // toward the anchor, in ENU (x east, y north)
      const awning = rng.pick(AWNING);
      box(x, y, z + 0.45, 2.2, 0.9, 0.9, facing, rng.pick(['#8d6e63', '#a1887f', '#6d4c41', '#bcaaa4']));
      box(x, y, z + 1.0, 2.3, 1.0, 0.1, facing, '#eceff1');
      for (const [px, py] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]] as [number, number][]) {
        const rx = px * Math.cos(facing) - py * Math.sin(facing), ry = px * Math.sin(facing) + py * Math.cos(facing);
        box(x + rx, y + ry, z + 1.2, 0.06, 0.06, 2.4, facing, '#455a64');
      }
      box(x, y, z + 2.45, 2.6, 1.6, 0.06, facing, awning);
      box(x, y, z + 2.5, 2.6, 0.3, 0.08, facing, '#ffffff');
      const sign = STALL_SIGNS[(fnv1a(`${h.id}:${i}`) >>> 0) % STALL_SIGNS.length];
      const signPos = Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, z + 2.9), new Cartesian3());
      labels.add({ position: signPos, text: `${sign.marathi} · ${sign.english}\nprocedural stall`, font: '600 13px system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.fromCssColorString('#3e2723').withAlpha(0.9), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -2), distanceDisplayCondition: new DistanceDisplayCondition(0, 140), scale: 0.9 });
      // Festival string lights along the awning edge.
      for (let k = 0; k < 8; k++) {
        const t = -1.2 + (k / 7) * 2.4;
        const lx = t * Math.cos(facing) - (-0.8) * Math.sin(facing), ly = t * Math.sin(facing) + (-0.8) * Math.cos(facing);
        lights.add({ position: Matrix4.multiplyByPoint(frame, new Cartesian3(x + lx, y + ly, z + 2.35 - Math.abs(t) * 0.05), new Cartesian3()), pixelSize: 5, color: LIGHT_COLOURS[(k + i) % LIGHT_COLOURS.length], disableDepthTestDistance: 0 });
      }
      // Customer spot 1.6 m in front of the counter (toward the anchor).
      const cx = x + Math.cos(facing) * 1.6, cy = y + Math.sin(facing) * 1.6;
      const ll = offsetToLonLat(h.lat, h.lon, cx, cy);
      spots.push({ lat: ll.lat, lon: ll.lon, facing: Math.atan2(Math.cos(facing), Math.sin(facing)) + Math.PI, hotspot: h.id });
    }
    // A festive ring of lights around the anchor at 4 m for hotspots with several stalls.
    if (n >= 3) for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      lights.add({ position: Matrix4.multiplyByPoint(frame, new Cartesian3(Math.cos(a) * 12, Math.sin(a) * 12, 4 + Math.sin(k * 1.7) * 0.3), new Cartesian3()), pixelSize: 4, color: LIGHT_COLOURS[k % LIGHT_COLOURS.length] });
    }
    lights.show = this.festival;
    const primitive = new Primitive({ geometryInstances: instances, modelMatrix: frame, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows: ShadowMode.ENABLED, allowPicking: false });
    this.scene.primitives.add(primitive);
    this.scene.primitives.add(labels);
    this.scene.primitives.add(lights);
    this.built.set(h.id, { hotspot: h, primitive, labels, lights, spots });
  }

  /** Slow twinkle for festival lights (called a few times per second). */
  twinkle(): void {
    if (!this.festival) return;
    this.frame++;
    for (const b of this.built.values()) {
      const n = b.lights.length;
      for (let i = 0; i < n; i++) b.lights.get(i).show = ((i + this.frame) % 7) !== 0;
    }
  }

  private remove(id: string): void {
    const b = this.built.get(id);
    if (!b) return;
    this.scene.primitives.remove(b.primitive);
    this.scene.primitives.remove(b.labels);
    this.scene.primitives.remove(b.lights);
    this.built.delete(id);
  }

  stats(): { hotspots: number; stalls: number; lights: number } {
    let stalls = 0, lights = 0;
    for (const b of this.built.values()) { stalls += b.spots.length; lights += b.lights.length; }
    return { hotspots: this.built.size, stalls, lights };
  }

  destroy(): void {
    for (const id of [...this.built.keys()]) this.remove(id);
  }
}

function rotZ(rad: number): Matrix4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Matrix4(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
