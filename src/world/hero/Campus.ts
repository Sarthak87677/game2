/**
 * Exterior of the SGIS-inspired hero campus: a landscaped platform with gate, internal roads, gardens, box trees,
 * parked buses and cars, courts, a sports field with a low-wall parkour course, and the campus buildings as shells
 * (facades with window bands, entrance canopies, parapet railings). Everything is built once in a local ENU frame
 * anchored on the terrain at the campus origin and disposed when the camera is far away. Interiors are separate
 * levels (see `InteriorSystem`); while the player is inside a building its shell is hidden.
 *
 * The campus is an original, fictionalised layout — labels say so on the gate and in the HUD.
 */
import { BoxGeometry, Cartesian2, Cartesian3, Color, ColorGeometryInstanceAttribute, DistanceDisplayCondition, GeometryInstance, HorizontalOrigin, LabelCollection, LabelStyle, Matrix3, Matrix4, NearFarScalar, PerInstanceColorAppearance, Primitive, PrimitiveCollection, ShadowMode, Transforms, VerticalOrigin, type Viewer, Math as CMath } from 'cesium';
import { SGIS_CAMPUS, campusBuildingFootprint, type CampusBuildingSpec, type CampusSpec } from '@/data/maharashtra/campus';
import { enuOffsetM, haversineM, offsetToLonLat } from '@/util/geo';
import { pointInRing } from '@/world/interiors/grammar';
import { Rng } from '@/util/hash';

interface BoxSpec { cx: number; cy: number; cz: number; w: number; d: number; h: number; colour: string; rotZ?: number }

export interface CampusOptions {
  spec?: CampusSpec;
  /** Distance (m) from the camera within which the campus is built. */
  buildRadiusM?: number;
  /** Loaded-terrain height sampler (null until tiles stream in). */
  groundHeight: (lat: number, lon: number) => number | null;
  /** Fallback height (terrain provider sample / climate atlas) used to place the campus before tiles are loaded. */
  terrainHeight?: (lat: number, lon: number) => Promise<number>;
}

export interface CampusStats { placed: boolean; baseM: number | null; boxes: number; hiddenBuilding: string | null }

const PLATFORM_LIFT = 0.35;

export class Campus {
  readonly spec: CampusSpec;
  private readonly root: PrimitiveCollection;
  private shells = new Map<string, Primitive>();
  private baseM: number | null = null;
  private boxes = 0;
  private hidden: string | null = null;
  private lastTick = 0;
  private destroyed = false;
  private readonly buildRadiusM: number;
  private readonly footprints: { id: string; ring: [number, number][]; top: number }[] = [];
  private fallbackGround: number | null = null;
  private fallbackPending = false;
  private placedFromFallback = false;

  constructor(private readonly viewer: Viewer, private readonly opts: CampusOptions) {
    this.spec = opts.spec ?? SGIS_CAMPUS;
    this.buildRadiusM = opts.buildRadiusM ?? 2500;
    this.root = viewer.scene.primitives.add(new PrimitiveCollection());
    for (const b of this.spec.buildings) this.footprints.push({ id: b.id, ring: campusBuildingFootprint(b), top: b.heightM });
  }

  get placed(): boolean { return this.baseM !== null; }
  /** Height above the ellipsoid of the campus platform surface (null until placed). */
  baseHeight(): number | null { return this.baseM === null ? null : this.baseM; }

  stats(): CampusStats { return { placed: this.placed, baseM: this.baseM === null ? null : Math.round(this.baseM * 10) / 10, boxes: this.boxes, hiddenBuilding: this.hidden }; }

  /** Campus metres (east, north) of a lat/lon. */
  toLocal(lat: number, lon: number): { east: number; north: number } {
    const o = enuOffsetM(this.spec.origin.lat, this.spec.origin.lon, lat, lon);
    return { east: o.east, north: o.north };
  }

  toLonLat(east: number, north: number): { lat: number; lon: number } {
    return offsetToLonLat(this.spec.origin.lat, this.spec.origin.lon, east, north);
  }

  /** True when the point is on the landscaped platform. */
  onCampus(lat: number, lon: number): boolean {
    const p = this.toLocal(lat, lon);
    const pl = this.spec.platform;
    return p.east >= pl.e0 && p.east <= pl.e1 && p.north >= pl.n0 && p.north <= pl.n1;
  }

  /**
   * Height sampler for the ModeController: the platform, parkour blocks (with a 0.4 m step-up apron = jump assist)
   * and building roofs (so the walker cannot pass through a shell from outside). Null off the campus.
   */
  heightAt = (lat: number, lon: number): number | null => {
    if (this.baseM === null) return null;
    const p = this.toLocal(lat, lon);
    const pl = this.spec.platform;
    if (p.east < pl.e0 || p.east > pl.e1 || p.north < pl.n0 || p.north > pl.n1) return null;
    let h = this.baseM;
    for (const f of this.footprints) {
      if (f.id === this.hidden) continue;
      if (pointInRing(f.ring, p.east, p.north)) return this.baseM + f.top;
    }
    for (const b of this.spec.parkour.blocks) {
      const apron = 0.4;
      if (p.east >= b.e - b.w / 2 - apron && p.east <= b.e + b.w / 2 + apron && p.north >= b.n - b.d / 2 - apron && p.north <= b.n + b.d / 2 + apron) h = Math.max(h, this.baseM + b.h);
    }
    return h;
  };

  /** Hides/shows a building shell (the interior level draws its own walls while the player is inside). */
  setBuildingHidden(id: string | null): void {
    this.hidden = id;
    for (const [bid, p] of this.shells) p.show = bid !== id;
  }

  /** Called every frame by the owning system; cheap until the camera comes within range. */
  update(): void {
    if (this.destroyed) return;
    const now = performance.now();
    if (now - this.lastTick < 500) return;
    this.lastTick = now;
    const cam = this.viewer.camera.positionCartographic;
    const lat = CMath.toDegrees(cam.latitude), lon = CMath.toDegrees(cam.longitude);
    const d = haversineM(lat, lon, this.spec.origin.lat, this.spec.origin.lon);
    if (d > this.buildRadiusM * 1.6 || cam.height > 30_000) { if (this.placed) this.unload(); return; }
    if (d > this.buildRadiusM) return;
    const loaded = this.groundAtOrigin();
    if (loaded === null && this.fallbackGround === null) { this.requestFallback(); return; }
    const g = loaded ?? this.fallbackGround!;
    if (!this.placed) { this.build(g); this.placedFromFallback = loaded === null; return; }
    // Re-anchor once real terrain arrives (or moves) while nobody is inside a building.
    if (this.hidden === null && Math.abs(g - (this.baseM! - PLATFORM_LIFT)) > 0.8 && (loaded !== null || !this.placedFromFallback)) { this.unload(); this.build(g); this.placedFromFallback = loaded === null; }
  }

  private requestFallback(): void {
    if (this.fallbackPending || !this.opts.terrainHeight) return;
    this.fallbackPending = true;
    this.opts.terrainHeight(this.spec.origin.lat, this.spec.origin.lon).then((h) => { if (!this.destroyed && Number.isFinite(h)) this.fallbackGround = h; }, () => undefined).finally(() => { this.fallbackPending = false; });
  }

  private groundAtOrigin(): number | null {
    // Highest loaded terrain height among the platform corners and centre keeps the slab above the ground.
    const pts: [number, number][] = [[0, 0], [this.spec.platform.e0, this.spec.platform.n0], [this.spec.platform.e1, this.spec.platform.n0], [this.spec.platform.e0, this.spec.platform.n1], [this.spec.platform.e1, this.spec.platform.n1]];
    let best: number | null = null;
    for (const [e, n] of pts) {
      const ll = this.toLonLat(e, n);
      const h = this.opts.groundHeight(ll.lat, ll.lon);
      if (h === null) continue;
      best = best === null ? h : Math.max(best, h);
    }
    return best;
  }

  private unload(): void {
    this.root.removeAll();
    this.shells.clear();
    this.baseM = null;
    this.boxes = 0;
  }

  private build(groundM: number): void {
    const base = groundM + PLATFORM_LIFT;
    this.baseM = base;
    const s = this.spec;
    const origin = Cartesian3.fromDegrees(s.origin.lon, s.origin.lat, base);
    const modelMatrix = Transforms.eastNorthUpToFixedFrame(origin);
    const ground: BoxSpec[] = [];
    const pl = s.platform;
    // Platform (landscaped grounds) — slightly below the walking surface so roads/courts sit on top.
    ground.push({ cx: (pl.e0 + pl.e1) / 2, cy: (pl.n0 + pl.n1) / 2, cz: -0.6, w: pl.e1 - pl.e0, d: pl.n1 - pl.n0, h: 1.2, colour: '#6f9a4f' });
    for (const r of s.roads) for (let i = 0; i < r.points.length - 1; i++) {
      const [x0, y0] = r.points[i], [x1, y1] = r.points[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      ground.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: 0.02, w: len, d: r.widthM, h: 0.04, colour: '#5e6169', rotZ: Math.atan2(y1 - y0, x1 - x0) });
      // Kerb lines.
      for (const sgn of [-1, 1]) ground.push({ cx: (x0 + x1) / 2 + sgn * (r.widthM / 2) * -Math.sin(Math.atan2(y1 - y0, x1 - x0)), cy: (y0 + y1) / 2 + sgn * (r.widthM / 2) * Math.cos(Math.atan2(y1 - y0, x1 - x0)), cz: 0.06, w: len, d: 0.25, h: 0.12, colour: '#d7d2c4', rotZ: Math.atan2(y1 - y0, x1 - x0) });
    }
    for (const p of s.parking) {
      ground.push({ cx: p.east, cy: p.north, cz: 0.02, w: p.wM, d: p.dM, h: 0.04, colour: '#70737a' });
      const rng = new Rng(p.east * 31 + p.north);
      for (let i = 0; i < p.buses; i++) {
        const x = p.east - p.wM / 2 + 6 + i * (p.wM - 8) / Math.max(1, p.buses - 1);
        const y = p.north;
        ground.push({ cx: x, cy: y, cz: 1.6, w: 3.0, d: 11, h: 3.0, colour: '#e0b23a' });
        ground.push({ cx: x, cy: y, cz: 2.1, w: 3.06, d: 9.4, h: 0.9, colour: '#2c3440' });
        for (const sy of [-3.6, 3.6]) for (const sx of [-1.3, 1.3]) ground.push({ cx: x + sx, cy: y + sy, cz: 0.45, w: 0.35, d: 1.0, h: 0.9, colour: '#222' });
      }
      for (let i = 0; i < p.cars; i++) {
        const x = p.east - p.wM / 2 + 3 + i * (p.wM - 6) / Math.max(1, p.cars - 1);
        const y = p.north + (i % 2 === 0 ? -4 : 4);
        const colour = ['#b8352a', '#d9dbe0', '#2f4f7f', '#8b8f96', '#3d6b4f'][Math.floor(rng.next() * 5)];
        ground.push({ cx: x, cy: y, cz: 0.75, w: 1.8, d: 4.3, h: 0.7, colour });
        ground.push({ cx: x, cy: y - 0.2, cz: 1.35, w: 1.7, d: 2.2, h: 0.6, colour: '#2b2f36' });
      }
    }
    for (const c of s.courts) {
      const colour = c.kind === 'field' ? '#4f8a3c' : c.kind === 'basketball' ? '#b77a4a' : '#c9a86a';
      ground.push({ cx: c.east, cy: c.north, cz: 0.03, w: c.wM, d: c.dM, h: 0.06, colour });
      // Boundary lines.
      const lw = 0.12;
      for (const [dx, dy, w, d] of [[0, c.dM / 2, c.wM, lw], [0, -c.dM / 2, c.wM, lw], [c.wM / 2, 0, lw, c.dM], [-c.wM / 2, 0, lw, c.dM]] as [number, number, number, number][]) ground.push({ cx: c.east + dx, cy: c.north + dy, cz: 0.08, w, d, h: 0.04, colour: '#f4f4f0' });
      if (c.kind === 'field') for (const sgn of [-1, 1]) { ground.push({ cx: c.east + sgn * (c.wM / 2 - 0.2), cy: c.north, cz: 1.25, w: 0.12, d: 7.3, h: 2.44, colour: '#f4f4f0' }); }
      if (c.kind === 'basketball') for (const sgn of [-1, 1]) { ground.push({ cx: c.east + sgn * (c.wM / 2 - 1.2), cy: c.north, cz: 1.8, w: 0.15, d: 0.15, h: 3.6, colour: '#3a3f47' }); ground.push({ cx: c.east + sgn * (c.wM / 2 - 1.8), cy: c.north, cz: 3.4, w: 0.1, d: 1.8, h: 1.05, colour: '#eef0f2' }); }
      if (c.kind === 'volleyball') ground.push({ cx: c.east, cy: c.north, cz: 1.6, w: 0.06, d: c.dM + 0.6, h: 1.0, colour: '#eef0f2' });
    }
    for (const g of s.gardens) {
      ground.push({ cx: g.east, cy: g.north, cz: 0.15, w: g.radiusM * 2, d: g.radiusM * 2, h: 0.3, colour: '#8a6d4d' });
      ground.push({ cx: g.east, cy: g.north, cz: 0.32, w: g.radiusM * 1.7, d: g.radiusM * 1.7, h: 0.08, colour: '#3f8f3a' });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ground.push({ cx: g.east + Math.cos(a) * g.radiusM * 0.55, cy: g.north + Math.sin(a) * g.radiusM * 0.55, cz: 0.6, w: 0.6, d: 0.6, h: 0.5, colour: ['#c8425a', '#e6a83a', '#d9d9e8'][i % 3] }); }
    }
    // Parkour course: low walls with a sign.
    const pk = s.parkour;
    ground.push({ cx: pk.east, cy: pk.north, cz: 0.02, w: 80, d: 6, h: 0.04, colour: '#a67c52' });
    for (const b of pk.blocks) ground.push({ cx: b.e, cy: b.n, cz: b.h / 2, w: b.w, d: b.d, h: b.h, colour: '#c9c2b0' });
    // Gate: pillars, beam, low boundary wall along the front.
    const gate = s.gate;
    for (const sgn of [-1, 1]) ground.push({ cx: gate.east + sgn * gate.widthM / 2, cy: gate.north, cz: 2.4, w: 1.2, d: 1.2, h: 4.8, colour: '#c9b18a' });
    ground.push({ cx: gate.east, cy: gate.north, cz: 4.9, w: gate.widthM + 1.2, d: 1.0, h: 0.8, colour: '#c9b18a' });
    const leftW = gate.east - gate.widthM / 2 - 0.6 - pl.e0, rightW = pl.e1 - (gate.east + gate.widthM / 2 + 0.6);
    ground.push({ cx: pl.e0 + leftW / 2, cy: gate.north, cz: 0.9, w: leftW, d: 0.3, h: 1.8, colour: '#b9a684' });
    ground.push({ cx: pl.e1 - rightW / 2, cy: gate.north, cz: 0.9, w: rightW, d: 0.3, h: 1.8, colour: '#b9a684' });
    this.addPrimitive(ground, modelMatrix);
    // Trees: trunk + two canopy boxes.
    const trees: BoxSpec[] = [];
    for (const t of s.trees) {
      const h = t.heightM;
      trees.push({ cx: t.east, cy: t.north, cz: h * 0.3, w: 0.35, d: 0.35, h: h * 0.6, colour: '#6b4a2e' });
      trees.push({ cx: t.east, cy: t.north, cz: h * 0.62, w: h * 0.55, d: h * 0.55, h: h * 0.5, colour: '#3f7a35', rotZ: 0.4 });
      trees.push({ cx: t.east, cy: t.north, cz: h * 0.85, w: h * 0.35, d: h * 0.35, h: h * 0.3, colour: '#4d8f3d' });
    }
    this.addPrimitive(trees, modelMatrix);
    // Building shells, one primitive each so a shell can be hidden while its interior is active.
    for (const b of s.buildings) {
      const p = this.addPrimitive(this.buildingShell(b), modelMatrix);
      if (p) { this.shells.set(b.id, p); p.show = this.hidden !== b.id; }
    }
    // Labels.
    const labels = this.root.add(new LabelCollection({ modelMatrix }));
    const style = { font: '14px system-ui, sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: Color.BLACK, horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.BOTTOM, scaleByDistance: new NearFarScalar(50, 1.0, 600, 0.45), distanceDisplayCondition: new DistanceDisplayCondition(0, 900), pixelOffset: new Cartesian2(0, 0) };
    labels.add({ ...style, position: new Cartesian3(gate.east, gate.north, 5.6), text: `${s.name}\n${s.note}`, fillColor: Color.fromCssColorString('#ffe9a8'), font: '15px system-ui, sans-serif' });
    for (const b of s.buildings) labels.add({ ...style, position: new Cartesian3(b.east, b.north, b.heightM + 2.2), text: `${b.name}\n(procedural interior)`, fillColor: Color.WHITE });
    for (const c of s.courts) labels.add({ ...style, position: new Cartesian3(c.east, c.north, 1.5), text: c.label, fillColor: Color.fromCssColorString('#d8f0d0'), distanceDisplayCondition: new DistanceDisplayCondition(0, 300) });
    labels.add({ ...style, position: new Cartesian3(pk.east, pk.north + 3.5, 2.0), text: pk.label, fillColor: Color.fromCssColorString('#ffe9a8'), distanceDisplayCondition: new DistanceDisplayCondition(0, 300) });
    labels.add({ ...style, position: new Cartesian3(s.parking[0].east, s.parking[0].north, 4.5), text: 'Bus parking', fillColor: Color.fromCssColorString('#d8d8d8'), distanceDisplayCondition: new DistanceDisplayCondition(0, 300) });
  }

  private buildingShell(b: CampusBuildingSpec): BoxSpec[] {
    const out: BoxSpec[] = [];
    const rot = (b.rotationDeg * Math.PI) / 180;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const local = (x: number, y: number): [number, number] => [b.east + x * c - y * sn, b.north + x * sn + y * c];
    const push = (x: number, y: number, cz: number, w: number, d: number, h: number, colour: string) => { const [cx, cy] = local(x, y); out.push({ cx, cy, cz, w, d, h, colour, rotZ: rot }); };
    const wallC = b.colour, bandC = '#3a4652', trimC = '#f3efe6', roofC = '#9a8f80';
    // Body slightly smaller than the footprint so the interior walls (at the inscribed rectangle) coincide with it.
    push(0, 0, b.heightM / 2, b.wM, b.dM, b.heightM, wallC);
    // Window bands per storey on the long facades and the ends.
    const storey = b.heightM / b.floors;
    for (let f = 0; f < b.floors; f++) {
      const z = f * storey + storey * 0.55;
      const bandH = Math.min(1.4, storey * 0.42);
      const n = Math.max(1, Math.floor((b.wM - 2) / 3));
      for (let i = 0; i < n; i++) {
        const x = -b.wM / 2 + 1 + (i + 0.5) * ((b.wM - 2) / n);
        for (const side of [-1, 1]) push(x, side * (b.dM / 2 + 0.03), z, 1.5, 0.06, bandH, bandC);
      }
      const m = Math.max(1, Math.floor((b.dM - 2) / 3));
      for (let i = 0; i < m; i++) {
        const y = -b.dM / 2 + 1 + (i + 0.5) * ((b.dM - 2) / m);
        for (const side of [-1, 1]) push(side * (b.wM / 2 + 0.03), y, z, 0.06, 1.5, bandH, bandC);
      }
      // Floor line trim.
      if (f > 0) { for (const side of [-1, 1]) push(0, side * (b.dM / 2 + 0.05), f * storey, b.wM + 0.1, 0.1, 0.18, trimC); }
    }
    // Roof slab and parapet railings (terrace with barriers).
    push(0, 0, b.heightM + 0.1, b.wM + 0.2, b.dM + 0.2, 0.2, roofC);
    const railH = 1.1;
    push(0, b.dM / 2, b.heightM + 0.2 + railH / 2, b.wM + 0.2, 0.15, railH, trimC);
    push(0, -b.dM / 2, b.heightM + 0.2 + railH / 2, b.wM + 0.2, 0.15, railH, trimC);
    push(b.wM / 2, 0, b.heightM + 0.2 + railH / 2, 0.15, b.dM + 0.2, railH, trimC);
    push(-b.wM / 2, 0, b.heightM + 0.2 + railH / 2, 0.15, b.dM + 0.2, railH, trimC);
    // Entrance: dark door recess and a canopy on the entrance side.
    const e = b.entrance;
    const ex = e === 'east' ? b.wM / 2 : e === 'west' ? -b.wM / 2 : 0;
    const ey = e === 'north' ? b.dM / 2 : e === 'south' ? -b.dM / 2 : 0;
    const alongX = e === 'north' || e === 'south';
    push(ex + (alongX ? 0 : Math.sign(ex) * 0.04), ey + (alongX ? Math.sign(ey) * 0.04 : 0), 1.15, alongX ? 2.4 : 0.08, alongX ? 0.08 : 2.4, 2.3, '#2a2f38');
    push(ex + (alongX ? 0 : Math.sign(ex) * 1.3), ey + (alongX ? Math.sign(ey) * 1.3 : 0), 2.6, alongX ? 4.5 : 2.6, alongX ? 2.6 : 4.5, 0.15, trimC);
    for (const sgn of [-1, 1]) push(ex + (alongX ? sgn * 2.0 : Math.sign(ex) * 2.4), ey + (alongX ? Math.sign(ey) * 2.4 : sgn * 2.0), 1.3, 0.15, 0.15, 2.6, trimC);
    return out;
  }

  private addPrimitive(boxes: BoxSpec[], modelMatrix: Matrix4): Primitive | null {
    if (boxes.length === 0) return null;
    const instances = boxes.map((b) => {
      const geometry = BoxGeometry.fromDimensions({ dimensions: new Cartesian3(b.w, b.d, b.h), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT });
      const m = b.rotZ ? Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(b.rotZ), new Cartesian3(b.cx, b.cy, b.cz)) : Matrix4.fromTranslation(new Cartesian3(b.cx, b.cy, b.cz));
      return new GeometryInstance({ geometry, modelMatrix: m, attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(b.colour)) } });
    });
    const p = new Primitive({ geometryInstances: instances, modelMatrix, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, allowPicking: false, shadows: ShadowMode.ENABLED, releaseGeometryInstances: true });
    this.root.add(p);
    this.boxes += boxes.length;
    return p;
  }

  destroy(): void {
    this.destroyed = true;
    this.viewer.scene.primitives.remove(this.root);
  }
}
