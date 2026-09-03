import { Cartesian3, Cartographic, Color, PointPrimitiveCollection, type PointPrimitive, type Viewer, Math as CMath, NearFarScalar } from 'cesium';
import type { RoadKind } from '@/data/adapters/features/types';
import { haversineM } from '@/util/geo';
import { fnv1a, Rng } from '@/util/hash';
import type { OsmLayer } from '@/world/osm/OsmLayer';
import type { EnvironmentController } from '@/engine/environment';

const SPEED_MS: Partial<Record<RoadKind, number>> = { motorway: 30, trunk: 25, primary: 16, secondary: 14, tertiary: 12, residential: 9 };
const SPACING_M: Partial<Record<RoadKind, number>> = { motorway: 55, trunk: 70, primary: 90, secondary: 120, tertiary: 160, residential: 260 };
const LAMP_SPACING_M = 34;
const BODY_COLOURS = ['#d9d9d9', '#2b2f36', '#9aa3ad', '#b8352a', '#2f5fa8', '#e0c04a', '#5b6b7a', '#f2f2f2'];

interface Road { id: string; kind: RoadKind; pts: { lon: number; lat: number; h: number | null }[]; cum: number[]; length: number; tile: string }
interface Vehicle { road: Road; t: number; dir: 1 | -1; speed: number; body: PointPrimitive; light: PointPrimitive; tail: PointPrimitive }

/**
 * Ambient traffic and street lighting derived from loaded OpenStreetMap roads: vehicles move along polylines at
 * class-dependent speeds (bodies by day; headlights/tail-lights at night), and lamps line residential-and-larger
 * roads after dark. Everything is simulated — not observed traffic.
 */
export class TrafficLayer {
  private roads = new Map<string, Road[]>();
  private vehicles: Vehicle[] = [];
  private lamps = new Map<string, PointPrimitive[]>();
  private bodies: PointPrimitiveCollection;
  private lights: PointPrimitiveCollection;
  private lampCollection: PointPrimitiveCollection;
  private remove: () => void;
  private lastUpdate = 0;
  private lastSync = 0;
  private night = 0;
  enabled = true;
  maxVehicles = 500;
  maxLamps = 2500;

  constructor(private viewer: Viewer, private osm: OsmLayer, private environment: EnvironmentController) {
    const p = viewer.scene.primitives;
    this.bodies = p.add(new PointPrimitiveCollection());
    this.lights = p.add(new PointPrimitiveCollection({ blendOption: undefined }));
    this.lampCollection = p.add(new PointPrimitiveCollection());
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  stats(): { vehicles: number; lamps: number; roads: number } {
    let roads = 0;
    for (const r of this.roads.values()) roads += r.length;
    return { vehicles: this.vehicles.length, lamps: this.lampCollection.length, roads };
  }

  private update(): void {
    const now = performance.now();
    const dt = Math.min(0.2, (now - this.lastUpdate) / 1000);
    if (now - this.lastUpdate < 50) return;
    this.lastUpdate = now;
    const cam = this.viewer.camera.positionCartographic;
    const agl = cam.height - (this.viewer.scene.globe.getHeight(cam) ?? 0);
    const visible = this.enabled && agl < 3500;
    this.bodies.show = visible;
    this.lights.show = visible;
    this.lampCollection.show = visible;
    if (!visible) return;
    if (now - this.lastSync > 1500) { this.lastSync = now; this.syncRoads(); }
    const lat = CMath.toDegrees(cam.latitude), lon = CMath.toDegrees(cam.longitude);
    const sun = this.environment.sunElevationDeg(lat, lon);
    this.night = 1 - Math.min(1, Math.max(0, (sun + 4) / 8));
    for (const v of this.vehicles) this.advance(v, dt);
    for (const list of this.lamps.values()) for (const l of list) l.show = this.night > 0.15;
  }

  private syncRoads(): void {
    const tiles = this.osm.loadedTiles;
    const present = new Set(tiles.map((t) => t.key));
    for (const key of [...this.roads.keys()]) if (!present.has(key)) this.unloadTile(key);
    for (const t of tiles) {
      if (this.roads.has(t.key)) continue;
      const roads: Road[] = [];
      for (const r of t.roads) {
        if (!SPEED_MS[r.kind] || r.coords.length < 2 || r.tunnel) continue;
        const pts = r.coords.map(([lon, lat]) => ({ lon, lat, h: null as number | null }));
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
        roads.push({ id: r.id, kind: r.kind, pts, cum, length: cum[cum.length - 1], tile: t.key });
      }
      this.roads.set(t.key, roads);
      this.spawn(roads, t.key);
    }
  }

  private heightAt(road: Road, i: number): number {
    const p = road.pts[i];
    if (p.h === null) {
      const h = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat));
      if (h !== undefined) p.h = h;
    }
    return p.h ?? 0;
  }

  private positionAt(road: Road, t: number): Cartesian3 {
    let i = 1;
    while (i < road.cum.length - 1 && road.cum[i] < t) i++;
    const a = road.pts[i - 1], b = road.pts[i];
    const seg = Math.max(0.01, road.cum[i] - road.cum[i - 1]);
    const f = Math.max(0, Math.min(1, (t - road.cum[i - 1]) / seg));
    const ha = this.heightAt(road, i - 1), hb = this.heightAt(road, i);
    return Cartesian3.fromDegrees(a.lon + (b.lon - a.lon) * f, a.lat + (b.lat - a.lat) * f, ha + (hb - ha) * f + 0.9);
  }

  private spawn(roads: Road[], tile: string): void {
    const rng = new Rng(fnv1a(tile));
    const lamps: PointPrimitive[] = [];
    for (const road of roads) {
      const spacing = SPACING_M[road.kind] ?? 200;
      const n = Math.min(40, Math.floor(road.length / spacing));
      for (let k = 0; k < n && this.vehicles.length < this.maxVehicles; k++) {
        const t = rng.range(0, road.length);
        const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
        const speed = (SPEED_MS[road.kind] ?? 10) * rng.range(0.75, 1.2);
        const pos = this.positionAt(road, t);
        const body = this.bodies.add({ position: pos, pixelSize: 4, color: Color.fromCssColorString(rng.pick(BODY_COLOURS)), scaleByDistance: new NearFarScalar(200, 1.6, 3000, 0.4), translucencyByDistance: new NearFarScalar(1500, 1, 3500, 0) });
        const light = this.lights.add({ position: pos, pixelSize: 5, color: Color.fromBytes(255, 245, 210, 0), scaleByDistance: new NearFarScalar(200, 1.8, 3000, 0.6) });
        const tail = this.lights.add({ position: pos, pixelSize: 3, color: Color.fromBytes(255, 40, 30, 0), scaleByDistance: new NearFarScalar(200, 1.5, 3000, 0.5) });
        this.vehicles.push({ road, t, dir, speed, body, light, tail });
      }
      if (road.kind !== 'motorway' && road.kind !== 'trunk') {
        for (let t = LAMP_SPACING_M / 2; t < road.length && this.lampCollection.length < this.maxLamps; t += LAMP_SPACING_M) {
          const pos = this.positionAt(road, t);
          const lifted = Cartesian3.add(pos, Cartesian3.multiplyByScalar(Cartesian3.normalize(pos, new Cartesian3()), 6.5, new Cartesian3()), new Cartesian3());
          lamps.push(this.lampCollection.add({ position: lifted, pixelSize: 6, color: Color.fromBytes(255, 214, 150, 220), show: false, scaleByDistance: new NearFarScalar(100, 1.5, 3000, 0.5), translucencyByDistance: new NearFarScalar(800, 1, 3500, 0) }));
        }
      }
    }
    this.lamps.set(tile, lamps);
  }

  private advance(v: Vehicle, dt: number): void {
    v.t += v.speed * dt * v.dir;
    if (v.t >= v.road.length) { v.t = v.road.length; v.dir = -1; }
    if (v.t <= 0) { v.t = 0; v.dir = 1; }
    const pos = this.positionAt(v.road, v.t);
    v.body.position = pos;
    v.light.position = pos;
    v.tail.position = pos;
    const n = this.night;
    v.body.color = Color.fromAlpha(v.body.color, 1 - n * 0.6, v.body.color);
    v.light.color = Color.fromBytes(255, 245, 210, Math.round(230 * n));
    v.tail.color = Color.fromBytes(255, 40, 30, Math.round(200 * n));
  }

  private unloadTile(key: string): void {
    this.roads.delete(key);
    const keep: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.road.tile === key) { this.bodies.remove(v.body); this.lights.remove(v.light); this.lights.remove(v.tail); } else keep.push(v);
    }
    this.vehicles = keep;
    for (const l of this.lamps.get(key) ?? []) this.lampCollection.remove(l);
    this.lamps.delete(key);
  }

  destroy(): void {
    this.remove();
    const p = this.viewer.scene.primitives;
    p.remove(this.bodies);
    p.remove(this.lights);
    p.remove(this.lampCollection);
    this.vehicles = [];
    this.roads.clear();
  }
}
