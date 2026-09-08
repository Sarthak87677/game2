/**
 * Renders an `InteriorPlan` as Cesium primitives in a local east-north-up frame and answers the walking-collision
 * queries (`groundOverride`, `moveFilter`) for the ModeController. Everything is built in the building frame; the
 * primitive model matrix (ENU × rotation) places it on the globe, so positions stay small and precise.
 *
 * Structure (slabs, stairs, elevator shaft) is one primitive for all floors. Walls, furniture, lights, door frames and
 * labels are built lazily per floor and only the current floor ±1 is shown — a simple LOD that also bounds the cost of
 * tall towers on software rendering.
 */
import { BoxGeometry, Cartesian2, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, DistanceDisplayCondition, GeometryInstance, HorizontalOrigin, LabelCollection, LabelStyle, Matrix3, Matrix4, NearFarScalar, PerInstanceColorAppearance, Primitive, PrimitiveCollection, ShadowMode, Transforms, VerticalOrigin, type Viewer, Math as CMath } from 'cesium';
import type { InteriorPlan, FloorPlan, Rect } from './types';
import { DOOR_HEIGHT_M, RAILING_HEIGHT_M } from './grammar';
import { filterMove, floorIndexForZ, insideUsable, nearestSurface, pointInFootprint, wallPieces } from './collision';
import { lonLatToPlan, planToLonLat, type PlanFrame } from './frame';
import { INTERIOR_VOCABULARY } from '@/data/maharashtra/interiorGrammar';

const SLAB_M = 0.25;
const FLOOR_WINDOW = 1; // floors above/below the current one that stay built and visible
const MAX_BUILT_FLOORS = 5;

interface BoxSpec { cx: number; cy: number; cz: number; w: number; d: number; h: number; colour: Color; rotY?: number }

interface FloorBuild { collection: PrimitiveCollection; labels: LabelCollection; boxes: number }

export interface InteriorLevelOptions {
  /** Height above the ellipsoid of the ground-floor walking surface. */
  baseHeightM: number;
  frame: PlanFrame;
}

export interface InteriorLevelStats { floor: number; builtFloors: number; boxes: number; labels: number }

export class InteriorLevel {
  readonly plan: InteriorPlan;
  readonly frame: PlanFrame;
  readonly baseHeightM: number;
  private readonly root: PrimitiveCollection;
  private readonly modelMatrix: Matrix4;
  private readonly floors = new Map<number, FloorBuild>();
  private structureBoxes = 0;
  private refZ = 0;
  private forcedRefZ: number | null = null;
  private currentFloor = 0;
  private destroyed = false;
  private readonly palette;
  private readonly scratchCarto = new Cartographic();
  /** Building-frame position of the walker (updated each frame by `update`). */
  readonly player = { x: 0, y: 0, z: 0 };

  constructor(private readonly viewer: Viewer, plan: InteriorPlan, opts: InteriorLevelOptions) {
    this.plan = plan;
    this.frame = opts.frame;
    this.baseHeightM = opts.baseHeightM;
    this.palette = INTERIOR_VOCABULARY[plan.category]?.palette ?? INTERIOR_VOCABULARY.office.palette;
    const origin = Cartesian3.fromDegrees(opts.frame.origin.lon, opts.frame.origin.lat, opts.baseHeightM);
    const enu = Transforms.eastNorthUpToFixedFrame(origin);
    const rot = Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(opts.frame.rotationRad), Cartesian3.ZERO);
    this.modelMatrix = Matrix4.multiply(enu, rot, new Matrix4());
    this.root = viewer.scene.primitives.add(new PrimitiveCollection());
    this.buildStructure();
    this.ensureFloors(0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Collision API (bound to ModeController.groundOverride / moveFilter by the gameplay system)

  /** Walking surface at a lat/lon (height above the ellipsoid) or null outside the building. */
  groundOverride = (lat: number, lon: number): number | null => {
    const p = lonLatToPlan(this.frame, lat, lon);
    const ref = this.forcedRefZ ?? this.refZ;
    const h = nearestSurface(this.plan, p.x, p.y, ref);
    if (h !== null) return this.baseHeightM + h;
    // Just outside the walls (doorways, the strip between the usable rectangle and the true footprint): ground level,
    // so an exiting walker never pops onto the exterior roof before the exit teleport runs.
    if (pointInFootprint(this.plan, p.x, p.y, 3)) return this.baseHeightM;
    return null;
  };

  moveFilter = (from: { lat: number; lon: number }, to: { lat: number; lon: number }): { lat: number; lon: number } | null => {
    const a = lonLatToPlan(this.frame, from.lat, from.lon);
    const b = lonLatToPlan(this.frame, to.lat, to.lon);
    const r = filterMove(this.plan, this.currentFloor, a, b);
    if (r === null) return null;
    if (r === b) return to;
    return planToLonLat(this.frame, r.x, r.y);
  };

  /** Pins the reference height for the next surface queries (teleports between floors). */
  forceReference(floorIndex: number): void {
    const f = this.plan.floors[Math.max(0, Math.min(this.plan.floors.length - 1, floorIndex))];
    this.forcedRefZ = f.z;
    this.refZ = f.z;
    this.currentFloor = f.index;
    this.ensureFloors(f.index);
  }

  /** Per-frame: tracks the walker and swaps floor detail; returns true when the current floor changed. */
  update(bodyEcef: Cartesian3): boolean {
    if (this.destroyed) return false;
    const c = Cartographic.fromCartesian(bodyEcef, undefined, this.scratchCarto);
    const p = lonLatToPlan(this.frame, CMath.toDegrees(c.latitude), CMath.toDegrees(c.longitude));
    this.player.x = p.x; this.player.y = p.y; this.player.z = c.height - this.baseHeightM;
    this.refZ = this.player.z;
    this.forcedRefZ = null;
    const f = floorIndexForZ(this.plan, this.player.z - 0.4);
    if (f !== this.currentFloor) { this.currentFloor = f; this.ensureFloors(f); return true; }
    return false;
  }

  floorIndex(): number { return this.currentFloor; }
  floor(): FloorPlan { return this.plan.floors[this.currentFloor]; }

  /** True when the walker has left the laid-out rectangle (walked through an exterior door). */
  playerOutside(): boolean {
    return !insideUsable(this.plan, this.player.x, this.player.y, 0.05);
  }

  /** Lat/lon of a building-frame point. */
  toLonLat(x: number, y: number): { lat: number; lon: number } { return planToLonLat(this.frame, x, y); }

  /** Room the walker stands in (or the corridor), for the HUD status line. */
  roomAtPlayer(): string | null {
    const f = this.floor();
    for (const r of f.rooms) if (inRect(r.rect, this.player.x, this.player.y)) return r.label;
    for (const c of f.corridors) if (inRect(c.rect, this.player.x, this.player.y)) return 'Corridor';
    for (const s of f.stairs) if (inRect(s.core, this.player.x, this.player.y)) return 'Stairs';
    return null;
  }

  stats(): InteriorLevelStats {
    let boxes = this.structureBoxes, labels = 0;
    for (const f of this.floors.values()) { boxes += f.boxes; labels += f.labels.length; }
    return { floor: this.currentFloor, builtFloors: this.floors.size, boxes, labels };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewer.scene.primitives.remove(this.root);
    this.floors.clear();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rendering

  private colour(css: string): Color { return Color.fromCssColorString(css); }

  private primitive(boxes: BoxSpec[], flat = false): Primitive | null {
    if (boxes.length === 0) return null;
    const instances = boxes.map((b) => {
      const geometry = BoxGeometry.fromDimensions({ dimensions: new Cartesian3(b.w, b.d, b.h), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT });
      const translation = Matrix4.fromTranslation(new Cartesian3(b.cx, b.cy, b.cz));
      const modelMatrix = b.rotY ? Matrix4.multiply(translation, Matrix4.fromRotationTranslation(Matrix3.fromRotationY(b.rotY), Cartesian3.ZERO), new Matrix4()) : translation;
      return new GeometryInstance({ geometry, modelMatrix, attributes: { color: ColorGeometryInstanceAttribute.fromColor(b.colour) } });
    });
    return new Primitive({ geometryInstances: instances, modelMatrix: this.modelMatrix, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true, flat }), asynchronous: false, allowPicking: false, shadows: flat ? ShadowMode.DISABLED : ShadowMode.ENABLED, releaseGeometryInstances: true });
  }

  private buildStructure(): void {
    const plan = this.plan;
    const U = plan.usable;
    const boxes: BoxSpec[] = [];
    const floorC = this.colour(this.palette.floor), ceilC = this.colour(this.palette.ceiling), stairC = this.colour(this.palette.accent).brighten(0.2, new Color()), shaftC = this.colour(this.palette.wall).darken(0.15, new Color());
    const margin = 0.3;
    const w = U.x1 - U.x0 + margin * 2, d = U.y1 - U.y0 + margin * 2;
    const cx = (U.x0 + U.x1) / 2, cy = (U.y0 + U.y1) / 2;
    for (const f of plan.floors) {
      // Slab: top face is the walking surface; the underside doubles as the ceiling of the floor below.
      // Slab top sits 3 cm above the walking surface so it wins over any exterior ground plane at the same height.
      boxes.push({ cx, cy, cz: f.z - SLAB_M / 2 + 0.03, w, d, h: SLAB_M, colour: f.kind === 'terrace' ? ceilC.darken(0.25, new Color()) : floorC });
      if (f.kind === 'floor' && f.index === plan.floors.length - 1) {
        // No terrace above: add a roof slab.
        boxes.push({ cx, cy, cz: f.z + plan.floorHeightM - SLAB_M / 2, w, d, h: SLAB_M, colour: ceilC });
      }
      for (const st of f.stairs) {
        const half = plan.floorHeightM / 2;
        const laneW = st.laneA.y1 - st.laneA.y0;
        const L = Math.abs(st.nearX - st.farX);
        const dir = Math.sign(st.farX - st.nearX);
        const slope = Math.atan2(half, L);
        const len = Math.hypot(L, half);
        // Flight A rises from near (z) to far (z + half); flight B from far (z + half) to near (z + H).
        const yA = (st.laneA.y0 + st.laneA.y1) / 2, yB = (st.laneB.y0 + st.laneB.y1) / 2;
        const midX = (st.nearX + st.farX) / 2;
        boxes.push({ cx: midX, cy: yA, cz: f.z + half / 2 - 0.1, w: len, d: laneW - 0.1, h: 0.2, colour: stairC, rotY: -dir * slope });
        boxes.push({ cx: midX, cy: yB, cz: f.z + half + half / 2 - 0.1, w: len, d: laneW - 0.1, h: 0.2, colour: stairC, rotY: dir * slope });
        // Half landing.
        boxes.push({ cx: (st.landing.x0 + st.landing.x1) / 2, cy: (st.landing.y0 + st.landing.y1) / 2, cz: f.z + half - 0.1, w: st.landing.x1 - st.landing.x0, d: st.landing.y1 - st.landing.y0, h: 0.2, colour: stairC });
        // Handrails along the outer edges of each flight.
        const railH = 0.9;
        for (const [y, zc] of [[st.laneA.y0 + 0.05, f.z + half / 2], [st.laneB.y1 - 0.05, f.z + half + half / 2]] as [number, number][]) {
          boxes.push({ cx: midX, cy: y, cz: zc + railH / 2, w: len, d: 0.06, h: railH, colour: shaftC, rotY: y < (st.laneA.y0 + st.laneB.y1) / 2 ? -dir * slope : dir * slope });
        }
      }
      for (const el of f.elevators) {
        if (f.index !== 0) continue; // the shaft is drawn once, full height
        const sh = el.shaft;
        const shaftH = plan.heightM;
        const scx = (sh.x0 + sh.x1) / 2, scy = (sh.y0 + sh.y1) / 2;
        // Cabin floor per served floor: a bright inset slab.
        for (const fi of el.servesFloors) boxes.push({ cx: scx, cy: scy, cz: plan.floors[fi].z + 0.02, w: sh.x1 - sh.x0 - 0.4, d: sh.y1 - sh.y0 - 0.4, h: 0.04, colour: stairC });
        void shaftH;
      }
    }
    const p = this.primitive(boxes);
    if (p) this.root.add(p);
    this.structureBoxes = boxes.length;
  }

  private ensureFloors(current: number): void {
    const wanted = new Set<number>();
    for (let i = current - FLOOR_WINDOW; i <= current + FLOOR_WINDOW; i++) if (i >= 0 && i < this.plan.floors.length) wanted.add(i);
    for (const i of wanted) if (!this.floors.has(i)) this.buildFloor(this.plan.floors[i]);
    for (const [i, f] of this.floors) {
      const show = wanted.has(i);
      f.collection.show = show;
      f.labels.show = show;
    }
    // Evict far floors beyond the budget (furthest first).
    if (this.floors.size > MAX_BUILT_FLOORS) {
      const far = [...this.floors.keys()].filter((i) => !wanted.has(i)).sort((a, b) => Math.abs(b - current) - Math.abs(a - current));
      for (const i of far) {
        if (this.floors.size <= MAX_BUILT_FLOORS) break;
        const f = this.floors.get(i)!;
        this.root.remove(f.collection);
        this.root.remove(f.labels);
        this.floors.delete(i);
      }
    }
  }

  private buildFloor(f: FloorPlan): void {
    const plan = this.plan;
    const H = plan.floorHeightM;
    const wallC = this.colour(this.palette.wall), accentC = this.colour(this.palette.accent), doorC = this.colour(this.palette.door), railC = Color.fromCssColorString('#6f7680');
    const boxes: BoxSpec[] = [];
    const wallHeight = f.kind === 'terrace' ? RAILING_HEIGHT_M : H - SLAB_M;
    for (const b of wallPieces(f, wallHeight)) {
      const colour = b.kind === 'railing' ? railC : b.kind === 'lintel' ? wallC.darken(0.06, new Color()) : wallC;
      boxes.push({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, cz: f.z + (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.y1 - b.y0, h: b.z1 - b.z0, colour });
    }
    // Door frames (jambs + head) and closed panels for decorative doors.
    for (const d of f.doors) {
      const along = d.axis === 'x';
      const jamb = 0.08, depth = 0.26;
      const h = Math.min(DOOR_HEIGHT_M, wallHeight - 0.1);
      for (const s of [-1, 1]) {
        const off = s * (d.widthM / 2 + jamb / 2);
        boxes.push({ cx: d.x + (along ? off : 0), cy: d.y + (along ? 0 : off), cz: f.z + h / 2, w: along ? jamb : depth, d: along ? depth : jamb, h, colour: doorC });
      }
      boxes.push({ cx: d.x, cy: d.y, cz: f.z + h + 0.05, w: along ? d.widthM + jamb * 2 : depth, d: along ? depth : d.widthM + jamb * 2, h: 0.1, colour: doorC });
      if (d.decorative) boxes.push({ cx: d.x, cy: d.y, cz: f.z + h / 2, w: along ? d.widthM : 0.05, d: along ? 0.05 : d.widthM, h, colour: doorC.brighten(0.25, new Color()) });
      else if (d.exterior) boxes.push({ cx: d.x + (along ? d.widthM / 2 - 0.04 : 0), cy: d.y + (along ? 0 : d.widthM / 2 - 0.04), cz: f.z + h / 2, w: along ? 0.08 : 0.05, d: along ? 0.05 : 0.08, h, colour: accentC });
    }
    // Furniture blocks.
    for (const fu of f.furniture) boxes.push({ cx: (fu.rect.x0 + fu.rect.x1) / 2, cy: (fu.rect.y0 + fu.rect.y1) / 2, cz: f.z + fu.heightM / 2, w: fu.rect.x1 - fu.rect.x0, d: fu.rect.y1 - fu.rect.y0, h: fu.heightM, colour: this.colour(fu.colour) });
    // Elevator: door leaves (open) and a call panel at the lobby.
    for (const el of f.elevators) {
      boxes.push({ cx: el.lobby.x + 0.9, cy: el.door.y - 0.12, cz: f.z + 1.1, w: 0.12, d: 0.04, h: 0.25, colour: accentC });
    }
    const collection = new PrimitiveCollection();
    const solid = this.primitive(boxes);
    if (solid) collection.add(solid);
    // Emissive ceiling lights: flat-shaded white slabs just under the ceiling.
    if (f.kind === 'floor') {
      const lights: BoxSpec[] = f.lights.map((l) => ({ cx: l.x, cy: l.y, cz: f.z + H - SLAB_M - 0.06, w: l.wM, d: l.dM, h: 0.06, colour: Color.fromCssColorString('#fff6dc') }));
      const lp = this.primitive(lights, true);
      if (lp) collection.add(lp);
    }
    this.root.add(collection);
    // Labels: room names, floor name at the stair mouth, signs on decorative doors and the lift.
    const labels = this.root.add(new LabelCollection({ modelMatrix: this.modelMatrix }));
    const style = { font: '15px system-ui, sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: Color.BLACK, horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.CENTER, distanceDisplayCondition: new DistanceDisplayCondition(0, 70), scaleByDistance: new NearFarScalar(5, 1.0, 60, 0.55), pixelOffset: new Cartesian2(0, 0), disableDepthTestDistance: 0 };
    for (const r of f.rooms) {
      labels.add({ ...style, position: new Cartesian3((r.rect.x0 + r.rect.x1) / 2, (r.rect.y0 + r.rect.y1) / 2, f.z + 2.05), text: r.label, fillColor: Color.WHITE, id: { kind: 'room', label: r.label } });
    }
    for (const st of f.stairs) {
      labels.add({ ...style, position: new Cartesian3(st.nearX + Math.sign(st.farX - st.nearX) * 0.6, (st.core.y0 + st.core.y1) / 2, f.z + 2.3), text: `${f.name} · stairs ↑ ${plan.floors[st.toFloor]?.name ?? ''}`, fillColor: Color.fromCssColorString('#ffe9a8'), font: '13px system-ui, sans-serif' });
    }
    for (const d of f.doors) {
      if (d.decorative) labels.add({ ...style, position: new Cartesian3(d.x, d.y + (d.axis === 'x' ? 0.25 : 0), f.z + 1.55), text: 'decorative door', fillColor: Color.fromCssColorString('#d9d9d9'), font: '11px system-ui, sans-serif', distanceDisplayCondition: new DistanceDisplayCondition(0, 14) });
    }
    for (const el of f.elevators) {
      labels.add({ ...style, position: new Cartesian3(el.door.x, el.door.y - 0.3, f.z + 2.35), text: 'Lift', fillColor: Color.fromCssColorString('#ffe9a8'), font: '13px system-ui, sans-serif' });
    }
    if (f.kind === 'terrace') labels.add({ ...style, position: new Cartesian3((plan.usable.x0 + plan.usable.x1) / 2, (plan.usable.y0 + plan.usable.y1) / 2, f.z + 2.4), text: 'Terrace — railed, keep back from the edge', fillColor: Color.fromCssColorString('#ffe9a8') });
    this.floors.set(f.index, { collection, labels, boxes: boxes.length });
  }
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}
