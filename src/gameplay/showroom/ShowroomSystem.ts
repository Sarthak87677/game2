import { BoxGeometry, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, GeometryInstance, HeadingPitchRoll, LabelCollection, LabelStyle, Math as CMath, Matrix4, PerInstanceColorAppearance, Primitive, PrimitiveCollection, Transforms, VerticalOrigin } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { distanceM } from '@/gameplay/GameplayHost';
import { useTerraStore } from '@/state/store';
import { MAHARASHTRA_SHOWROOMS, SHOWROOM_NOTE, type Showroom } from '@/data/maharashtra/showrooms';
import { specSheet, vehicleSpec, type VehicleKind } from '@/gameplay/vehicles/catalog';
import { VehicleBody } from '@/gameplay/vehicles/VehicleBody';
import { requestVehicle } from '@/gameplay/vehicles/requests';
import { offsetFromVehicle } from '@/gameplay/vehicles/logic';
import { buildShowroomLayout, PLINTH_HEIGHT_M, type ShowroomLayout } from './showroomLayout';

const DISPLAY: VehicleKind[] = ['hatchback', 'sedan', 'suv', 'sports', 'taxi', 'rickshaw'];
const BUILD_M = 1200;
const DESTROY_M = 2000;
const INTERIOR_NOTE = 'Original showroom interior — not the dealer\'s real interior. Vehicles are generic original designs.';
type CameraMode = 'orbit' | 'interior' | 'dashboard' | 'cinematic';

interface Instance {
  showroom: Showroom;
  layout: ShowroomLayout;
  frame: Matrix4;
  groundM: number;
  prims: Primitive[];
  labels: LabelCollection;
  vehicles: { body: VehicleBody; kind: VehicleKind; position: Cartesian3; headingRad: number; plinth: number }[];
  /** Lat/lon of interactive spots. */
  spots: { plinths: { lat: number; lon: number }[]; stands: { lat: number; lon: number }[]; reception: { lat: number; lon: number }; testDrive: { lat: number; lon: number; headingDeg: number } };
}

const VF = PerInstanceColorAppearance.VERTEX_FORMAT;
const scratch = new Cartesian3();

/**
 * Generated car showrooms at curated approximate positions (plus OSM `shop=car` nodes when online): display floor
 * with catalog vehicles on plinths, reception, information stands, workshop bay, parking and a test-drive exit.
 * "Inspect" offers exterior-orbit / interior / dashboard / cinematic cameras; "Test drive" asks the vehicle system to
 * spawn the vehicle at the exit. Registered as `showroom`.
 */
export class ShowroomSystem implements GameplaySystem {
  readonly id = 'showroom';
  readonly label = 'Showroom';
  private collection: PrimitiveCollection;
  private instances = new Map<string, Instance>();
  private osmShowrooms: Showroom[] = [];
  private lastSync = 0;
  private lastOsm = 0;
  private inspect: { inst: Instance; index: number; mode: CameraMode; t: number; saved: { lat: number; lon: number; headingDeg: number } } | null = null;

  constructor(private readonly engine: TerraEngine) {
    this.collection = engine.viewer.scene.primitives.add(new PrimitiveCollection());
  }

  private allShowrooms(): Showroom[] { return [...MAHARASHTRA_SHOWROOMS, ...this.osmShowrooms]; }

  /** Real dealership positions from OpenStreetMap `shop=car` nodes (when the adapter is online); interiors stay original. */
  private syncOsm(lat: number, lon: number): void {
    const osm = this.engine.osm;
    if (!osm) return;
    const found: Showroom[] = [];
    for (const t of osm.loadedTiles) for (const p of t.pois) {
      if (p.kind !== 'car_showroom') continue;
      if (distanceM(lat, lon, p.lat, p.lon) > 3000) continue;
      if (MAHARASHTRA_SHOWROOMS.some((s) => distanceM(s.lat, s.lon, p.lat, p.lon) < 150)) continue;
      found.push({ id: `osm:${p.id}`, name: `${p.name} (position from OpenStreetMap)`, city: '', district: '', lat: p.lat, lon: p.lon, headingDeg: 0, source: 'osm', dataNote: 'Position measured (OpenStreetMap shop=car). Building, name display and interior are original procedural content, not the real premises.' });
      if (found.length >= 6) break;
    }
    this.osmShowrooms = found;
  }

  private sync(lat: number, lon: number): void {
    for (const s of this.allShowrooms()) {
      const d = distanceM(lat, lon, s.lat, s.lon);
      const inst = this.instances.get(s.id);
      if (d < BUILD_M) {
        const ground = this.engine.groundHeightAt(s.lat, s.lon);
        if (ground === null) continue;
        if (inst && Math.abs(inst.groundM - ground) > 0.6) this.dispose(s.id);
        if (!this.instances.has(s.id)) this.build(s, ground);
      } else if (d > DESTROY_M && inst) this.dispose(s.id);
    }
    for (const id of [...this.instances.keys()]) if (!this.allShowrooms().some((s) => s.id === id)) this.dispose(id);
  }

  private build(s: Showroom, groundM: number): void {
    const layout = buildShowroomLayout(DISPLAY);
    const frame = Transforms.headingPitchRollToFixedFrame(Cartesian3.fromDegrees(s.lon, s.lat, groundM), new HeadingPitchRoll(CMath.toRadians(s.headingDeg) - Math.PI / 2, 0, 0));
    const opaque: GeometryInstance[] = [];
    const glass: GeometryInstance[] = [];
    for (const b of layout.blocks) {
      const inst = new GeometryInstance({ geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(b.l, b.w, b.h), vertexFormat: VF }), modelMatrix: Matrix4.fromTranslation(new Cartesian3(b.x, b.y, b.z)), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(b.colour).withAlpha(b.translucent ? 0.35 : 1)) }, id: b.id });
      (b.translucent ? glass : opaque).push(inst);
    }
    const prims: Primitive[] = [];
    prims.push(this.collection.add(new Primitive({ geometryInstances: opaque, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), modelMatrix: frame, asynchronous: false, allowPicking: false })));
    prims.push(this.collection.add(new Primitive({ geometryInstances: glass, appearance: new PerInstanceColorAppearance({ translucent: true, closed: false }), modelMatrix: frame, asynchronous: false, allowPicking: false })));
    const toWorld = (x: number, y: number, z: number) => Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, z), new Cartesian3());
    const toLatLon = (x: number, y: number) => { const c = Cartographic.fromCartesian(toWorld(x, y, 0)); return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude) }; };
    const headingRad = CMath.toRadians(s.headingDeg);
    const vehicles: Instance['vehicles'] = [];
    layout.plinths.forEach((p, i) => {
      const spec = vehicleSpec(p.kind);
      const body = new VehicleBody(this.collection, spec, spec.colours[i % spec.colours.length], { interior: true, shadows: false });
      const position = toWorld(p.x, p.y, 0.2 + PLINTH_HEIGHT_M);
      const hr = headingRad + CMath.toRadians(p.headingDeg);
      body.setPose(position, hr);
      body.setLamps({ headlights: true, night: false, roof: true });
      vehicles.push({ body, kind: p.kind, position, headingRad: hr, plinth: i });
    });
    const ws = vehicleSpec(layout.workshop.kind);
    const wsBody = new VehicleBody(this.collection, ws, ws.colours[Math.min(1, ws.colours.length - 1)], { interior: false, shadows: false });
    wsBody.setPose(toWorld(layout.workshop.x, layout.workshop.y, 0.2 + 1.1), headingRad);
    vehicles.push({ body: wsBody, kind: layout.workshop.kind, position: toWorld(layout.workshop.x, layout.workshop.y, 1.3), headingRad, plinth: -1 });
    const labels = this.collection.add(new LabelCollection());
    const label = (x: number, y: number, z: number, text: string, big = false) => labels.add({ position: toWorld(x, y, z), text, font: big ? '600 18px system-ui, sans-serif' : '13px system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK.withAlpha(0.85), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: 60 });
    label(layout.floor.l / 2 + 0.5, 0, 6.4, `${s.name}\n${INTERIOR_NOTE}`, true);
    for (const l of layout.labels) if (l.text) label(l.x, l.y, l.z, l.text);
    layout.plinths.forEach((p, i) => label(p.x, p.y, 2.6, `${vehicleSpec(p.kind).name}\n(original generic design)${i === 0 ? '' : ''}`));
    const td = layout.testDrive;
    const tdLatLon = toLatLon(td.x, td.y);
    const inst: Instance = {
      showroom: s, layout, frame, groundM, prims, labels, vehicles,
      spots: { plinths: layout.plinths.map((p) => toLatLon(p.x, p.y)), stands: layout.stands.map((p) => toLatLon(p.x, p.y)), reception: toLatLon(layout.reception.x, layout.reception.y), testDrive: { ...tdLatLon, headingDeg: (s.headingDeg + td.headingLocalDeg + 360) % 360 } },
    };
    this.instances.set(s.id, inst);
  }

  private dispose(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (this.inspect?.inst === inst) this.endInspect();
    for (const p of inst.prims) this.collection.remove(p);
    this.collection.remove(inst.labels);
    for (const v of inst.vehicles) v.body.destroy();
    this.instances.delete(id);
  }

  // ------------------------------------------------------------------------------------------------ inspection

  private openInspect(inst: Instance, index: number): void {
    const v = inst.vehicles[index];
    const spec = vehicleSpec(v.kind);
    const inspecting = this.inspect?.inst === inst && this.inspect.index === index;
    this.engine.gameplay.showOverlay({
      title: `Inspect — ${spec.name}`,
      lines: [...specSheet(spec), `Paint: ${v.body.paintCss}`],
      actions: [
        { id: 'orbit', label: 'Exterior orbit camera' },
        { id: 'interior', label: 'Interior camera' },
        { id: 'dashboard', label: 'Dashboard camera' },
        { id: 'cinematic', label: 'Cinematic camera' },
        { id: 'testdrive', label: 'Test drive (spawns at the exit)' },
        ...(inspecting ? [{ id: 'back', label: 'Back to the showroom floor' }] : []),
      ],
      note: `${spec.note} ${INTERIOR_NOTE}`,
    }, (id) => {
      this.engine.gameplay.closeOverlay();
      if (id === 'testdrive') { this.testDrive(inst, v.kind, v.body.paintCss); return; }
      if (id === 'back') { this.endInspect(); return; }
      this.startInspect(inst, index, id as CameraMode);
    });
  }

  private startInspect(inst: Instance, index: number, mode: CameraMode): void {
    const modes = this.engine.modes;
    if (!this.inspect) {
      const { lat, lon } = modes.bodyLatLon();
      this.inspect = { inst, index, mode, t: 0, saved: { lat, lon, headingDeg: CMath.toDegrees(modes.getHeading()) } };
      modes.setMode('cinematic');
    } else { this.inspect.mode = mode; this.inspect.index = index; this.inspect.t = 0; }
    const label = mode === 'orbit' ? 'exterior orbit' : mode === 'interior' ? 'interior' : mode === 'dashboard' ? 'dashboard' : 'cinematic';
    useTerraStore.getState().setGameplay({ status: `Inspecting ${vehicleSpec(inst.vehicles[index].kind).name} — ${label} camera · E for cameras / back` });
  }

  private endInspect(): void {
    const ins = this.inspect;
    if (!ins) return;
    this.inspect = null;
    const modes = this.engine.modes;
    if (modes.getMode() === 'cinematic') modes.setMode('walk');
    modes.setBody(ins.saved.lat, ins.saved.lon, ins.saved.headingDeg, ins.inst.groundM);
    modes.setView('third');
    useTerraStore.getState().setGameplay({ status: null });
  }

  private updateInspectCamera(dt: number): void {
    const ins = this.inspect;
    if (!ins) return;
    if (this.engine.modes.getMode() !== 'cinematic') { this.inspect = null; useTerraStore.getState().setGameplay({ status: null }); return; }
    ins.t += dt;
    const v = ins.inst.vehicles[ins.index];
    const spec = vehicleSpec(v.kind);
    const cam = this.engine.viewer.camera;
    const enu = Transforms.eastNorthUpToFixedFrame(v.position);
    const east = Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_X, new Cartesian3());
    const north = Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_Y, new Cartesian3());
    const up = Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_Z, new Cartesian3());
    const place = (az: number, dist: number, height: number, lookHeight: number) => {
      const pos = Cartesian3.clone(v.position, scratch);
      Cartesian3.add(pos, Cartesian3.multiplyByScalar(east, Math.sin(az) * dist, new Cartesian3()), pos);
      Cartesian3.add(pos, Cartesian3.multiplyByScalar(north, Math.cos(az) * dist, new Cartesian3()), pos);
      Cartesian3.add(pos, Cartesian3.multiplyByScalar(up, height, new Cartesian3()), pos);
      cam.setView({ destination: pos, orientation: { heading: az + Math.PI, pitch: -Math.atan2(height - lookHeight, dist), roll: 0 } });
    };
    if (ins.mode === 'orbit') place(v.headingRad + ins.t * 0.35, spec.lengthM * 1.4 + 2, 1.9, spec.heightM * 0.5);
    else if (ins.mode === 'cinematic') place(v.headingRad + 0.6 + ins.t * 0.18, spec.lengthM * 0.9 + 1.5 + Math.sin(ins.t / 4) * 1.2, 0.7 + (1 + Math.sin(ins.t / 6)) * 0.8, spec.heightM * 0.45);
    else {
      // Seat camera: forward offset in the vehicle frame, looking ahead (interior) or down at the dashboard.
      const fwd = Cartesian3.add(Cartesian3.multiplyByScalar(east, Math.sin(v.headingRad), new Cartesian3()), Cartesian3.multiplyByScalar(north, Math.cos(v.headingRad), new Cartesian3()), new Cartesian3());
      const pos = Cartesian3.clone(v.position, scratch);
      Cartesian3.add(pos, Cartesian3.multiplyByScalar(fwd, 0.1, new Cartesian3()), pos);
      Cartesian3.add(pos, Cartesian3.multiplyByScalar(up, spec.drive.eyeHeightM - (ins.mode === 'dashboard' ? 0.1 : 0), new Cartesian3()), pos);
      const look = ins.mode === 'interior' ? Math.sin(ins.t * 0.5) * 0.7 : 0;
      cam.setView({ destination: pos, orientation: { heading: v.headingRad + look, pitch: ins.mode === 'dashboard' ? CMath.toRadians(-24) : CMath.toRadians(-4), roll: 0 } });
    }
  }

  private testDrive(inst: Instance, kind: VehicleKind, paint: string): void {
    if (this.inspect) this.endInspect();
    const td = inst.spots.testDrive;
    requestVehicle({ kind, paint, lat: td.lat, lon: td.lon, headingDeg: td.headingDeg, enter: true, key: `showroom:${inst.showroom.id}`, destination: { name: `${inst.showroom.name} (return)`, lat: inst.showroom.lat, lon: inst.showroom.lon } });
    useTerraStore.getState().setGameplay({ status: `Test drive — ${vehicleSpec(kind).name}. Return to the showroom when done (bearing on the HUD).` });
    window.setTimeout(() => { const s = useTerraStore.getState(); if (s.gameplay.status?.startsWith('Test drive')) s.setGameplay({ status: null }); }, 6000);
  }

  // ------------------------------------------------------------------------------------------------ system hooks

  update(ctx: GameplayContext): void {
    const p = ctx.player;
    if (ctx.nowMs - this.lastSync > 1000) {
      this.lastSync = ctx.nowMs;
      if (ctx.nowMs - this.lastOsm > 5000) { this.lastOsm = ctx.nowMs; this.syncOsm(p.lat, p.lon); }
      this.sync(p.lat, p.lon);
    }
    this.updateInspectCamera(ctx.dt);
  }

  interactions(ctx: GameplayContext): Interaction[] {
    const out: Interaction[] = [];
    const p = ctx.player;
    if (this.inspect) {
      const ins = this.inspect;
      out.push({ id: `showroom:${ins.inst.showroom.id}:cameras`, label: 'Cameras / back to the floor', lat: p.lat, lon: p.lon, radiusM: 100, modes: ['cinematic'], priority: 5, run: () => this.openInspect(ins.inst, ins.index) });
      return out;
    }
    for (const inst of this.instances.values()) {
      if (distanceM(p.lat, p.lon, inst.showroom.lat, inst.showroom.lon) > 120) continue;
      inst.spots.plinths.forEach((s, i) => out.push({ id: `showroom:${inst.showroom.id}:inspect:${i}`, label: `Inspect ${vehicleSpec(inst.vehicles[i].kind).name}`, lat: s.lat, lon: s.lon, radiusM: 4.8, modes: ['walk'], run: () => this.openInspect(inst, i) }));
      inst.spots.stands.forEach((s, i) => out.push({ id: `showroom:${inst.showroom.id}:stand:${i}`, label: `Read specs — ${vehicleSpec(inst.layout.stands[i].kind).name}`, lat: s.lat, lon: s.lon, radiusM: 2.2, modes: ['walk'], priority: 1, run: () => this.showSpecs(inst, i) }));
      out.push({ id: `showroom:${inst.showroom.id}:reception`, label: 'Reception — about this showroom', lat: inst.spots.reception.lat, lon: inst.spots.reception.lon, radiusM: 3.2, modes: ['walk'], run: () => this.showAbout(inst) });
    }
    return out;
  }

  private showSpecs(inst: Instance, i: number): void {
    const spec = vehicleSpec(inst.layout.stands[i].kind);
    this.engine.gameplay.showOverlay({ title: `${spec.name} — information stand`, lines: specSheet(spec), actions: [{ id: 'close', label: 'Close' }], note: `${spec.note} ${INTERIOR_NOTE}` }, () => this.engine.gameplay.closeOverlay());
  }

  private showAbout(inst: Instance): void {
    const s = inst.showroom;
    this.engine.gameplay.showOverlay({
      title: s.name,
      lines: [`${s.city ? `${s.city} · ` : ''}${inst.vehicles.length - 1} vehicles on display, workshop bay, parking and a test-drive exit.`, 'Walk to a plinth and press E to inspect a vehicle or start a test drive; information stands show the spec sheets.'],
      actions: [{ id: 'close', label: 'Close' }],
      note: `${s.dataNote} ${s.source === 'curated' ? '' : SHOWROOM_NOTE}`.trim(),
    }, () => this.engine.gameplay.closeOverlay());
  }

  onSpawn(lat: number, lon: number): void {
    if (this.inspect) this.endInspect();
    this.lastSync = 0;
    this.sync(lat, lon);
  }

  stats(): Record<string, string | number> {
    return { built: this.instances.size, 'osm positions': this.osmShowrooms.length, inspecting: this.inspect ? `${vehicleSpec(this.inspect.inst.vehicles[this.inspect.index].kind).name} (${this.inspect.mode})` : 'no' };
  }

  /** Test/diagnostic snapshot. */
  snapshot(): { built: string[]; inspecting: string | null; plinths: { lat: number; lon: number }[] } {
    const first = [...this.instances.values()][0];
    return { built: [...this.instances.keys()], inspecting: this.inspect ? this.inspect.mode : null, plinths: first ? first.spots.plinths : [] };
  }

  destroy(): void {
    if (this.inspect) this.endInspect();
    for (const id of [...this.instances.keys()]) this.dispose(id);
    this.engine.viewer.scene.primitives.remove(this.collection);
  }
}

// Keep a helper import used by the parking/test-drive geometry in one place for potential re-use.
export { offsetFromVehicle };
