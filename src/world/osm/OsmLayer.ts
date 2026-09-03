import { Cartesian3, Cartographic, ClassificationType, Color, ColorGeometryInstanceAttribute, CornerType, CorridorGeometry, GeometryInstance, GroundPrimitive, PerInstanceColorAppearance, PolygonGeometry, Primitive, PrimitiveCollection, sampleTerrain, ShadowMode, type Viewer, Math as CMath } from 'cesium';
import { buildBuildingMesh, type BuildingInput } from './osmBuildingGeometry';
import { createBuildingAppearance } from './buildingAppearance';
import type { FeatureAdapter, FeatureTile, LandUseKind, OsmBuilding, RoadKind } from '@/data/adapters/features/types';
import { haversineM, lonLatToTile, tileBounds } from '@/util/geo';
import { fnv1a } from '@/util/hash';
import { pointInPolygon } from '@/data/naturalEarth/geometry';

const ROAD_COLOURS: Record<RoadKind, string> = { motorway: '#3f4550', trunk: '#454b55', primary: '#4b5058', secondary: '#525860', tertiary: '#585e66', residential: '#60666d', service: '#6a7076', track: '#8a7a5a', path: '#9a8f78', pedestrian: '#8d9299', rail: '#5c5650', other: '#666b72' };
const LANDUSE_COLOURS: Record<LandUseKind, [string, number]> = { park: ['#4f8f45', 0.35], forest: ['#2f6b34', 0.4], farmland: ['#b8a95a', 0.3], residential: ['#b0a898', 0.12], industrial: ['#9a9aa2', 0.2], commercial: ['#b3a58f', 0.15], grass: ['#6faa55', 0.3], wetland: ['#5f8f7a', 0.35], orchard: ['#6c9a4e', 0.35], vineyard: ['#7d9a4a', 0.35], scrub: ['#8c9a5a', 0.3], beach: ['#e5d7a6', 0.45], other: ['#9a9a8a', 0.1] };
const FACADES = ['#c9c2b4', '#bfb6a6', '#d6cec1', '#b7a58f', '#a89f93', '#cfc7b8', '#9fa6ad', '#b4b9bf', '#d1c6b0', '#a3958a'];

interface LoadedTile { key: string; tile: FeatureTile | null; primitives: PrimitiveCollection; buildings: { poly: [number, number][]; top: number }[]; error?: string }

export interface OsmLayerOptions {
  adapter: FeatureAdapter;
  /** Maximum simultaneously loaded tiles. */
  maxTiles?: number;
  onStatus?: (s: { loaded: number; loading: number; failed: number; online: boolean | null; lastError: string | null }) => void;
}

/**
 * Streams and renders OpenStreetMap features around the camera: extruded buildings (heights from tags/levels or
 * inferred), roads and railways as terrain-clamped corridors, water bodies and land-use tints. Tiles are prioritised by
 * distance, cancelled when no longer needed and unloaded beyond a radius so memory stays bounded.
 */
export class OsmLayer {
  private tiles = new Map<string, LoadedTile>();
  private loading = new Map<string, AbortController>();
  private root: PrimitiveCollection;
  private remove: () => void;
  private lastCheck = 0;
  private failed = 0;
  private maxTiles: number;
  enabled = true;
  /** Height (metres, AGL) above which OSM streaming pauses. */
  maxAltitudeM = 9000;

  constructor(private viewer: Viewer, private opts: OsmLayerOptions) {
    this.root = viewer.scene.primitives.add(new PrimitiveCollection());
    this.maxTiles = opts.maxTiles ?? 48;
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  get loadedTiles(): FeatureTile[] {
    return [...this.tiles.values()].map((t) => t.tile).filter((t): t is FeatureTile => !!t);
  }

  /** Building top height at a lat/lon if inside a loaded OSM building, else null (used for walking collisions). */
  heightAt(lat: number, lon: number): number | null {
    const { x, y } = lonLatToTile(lon, lat, this.opts.adapter.zoom);
    const t = this.tiles.get(`${this.opts.adapter.zoom}/${x}/${y}`);
    if (!t) return null;
    for (const b of t.buildings) if (pointInPolygon([b.poly], lon, lat)) return b.top;
    return null;
  }

  /** Land-use kind at a point from loaded OSM polygons, or null. */
  landUseAt(lat: number, lon: number): LandUseKind | null {
    const { x, y } = lonLatToTile(lon, lat, this.opts.adapter.zoom);
    const t = this.tiles.get(`${this.opts.adapter.zoom}/${x}/${y}`)?.tile;
    if (!t) return null;
    for (const l of t.landuse) if (pointInPolygon([l.polygon], lon, lat)) return l.kind;
    return null;
  }

  tileFor(lat: number, lon: number): FeatureTile | null {
    const { x, y } = lonLatToTile(lon, lat, this.opts.adapter.zoom);
    return this.tiles.get(`${this.opts.adapter.zoom}/${x}/${y}`)?.tile ?? null;
  }

  private update(): void {
    const now = performance.now();
    if (now - this.lastCheck < 700) return;
    this.lastCheck = now;
    if (!this.enabled) return;
    const cam = this.viewer.camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(cam) ?? 0;
    const agl = cam.height - ground;
    if (agl > this.maxAltitudeM) { this.unloadBeyond(0, 0, 0); return; }
    if (!this.opts.adapter.isAvailable().available) { this.report(); return; }
    const lat = CMath.toDegrees(cam.latitude);
    const lon = CMath.toDegrees(cam.longitude);
    const z = this.opts.adapter.zoom;
    const radiusM = Math.min(4500, Math.max(900, agl * 1.2));
    const centre = lonLatToTile(lon, lat, z);
    const b = tileBounds(centre.x, centre.y, z);
    const tileM = haversineM(b.south, b.west, b.south, b.east);
    const span = Math.ceil(radiusM / Math.max(50, tileM));
    const wanted: { key: string; x: number; y: number; d: number }[] = [];
    const n = 2 ** z;
    for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
      const x = (centre.x + dx + n) % n;
      const y = centre.y + dy;
      if (y < 0 || y >= n) continue;
      const tb = tileBounds(x, y, z);
      const d = haversineM(lat, lon, (tb.north + tb.south) / 2, (tb.east + tb.west) / 2);
      if (d <= radiusM + tileM) wanted.push({ key: `${z}/${x}/${y}`, x, y, d });
    }
    wanted.sort((a, c) => a.d - c.d);
    const wantedKeys = new Set(wanted.map((w) => w.key));
    for (const [key, ctrl] of this.loading) if (!wantedKeys.has(key)) { ctrl.abort(); this.loading.delete(key); }
    this.unloadBeyond(lat, lon, radiusM * 2.2 + tileM, wantedKeys);
    if (this.loading.size === 0) {
      const next = wanted.find((w) => !this.tiles.has(w.key));
      if (next && this.tiles.size < this.maxTiles) void this.load(next.key, next.x, next.y, z);
    }
    this.report();
  }

  private unloadBeyond(lat: number, lon: number, radiusM: number, keep?: Set<string>): void {
    for (const [key, t] of this.tiles) {
      if (keep?.has(key)) continue;
      const [z, x, y] = key.split('/').map(Number);
      const tb = tileBounds(x, y, z);
      const d = radiusM === 0 ? Infinity : haversineM(lat, lon, (tb.north + tb.south) / 2, (tb.east + tb.west) / 2);
      if (d > radiusM) { this.root.remove(t.primitives); this.tiles.delete(key); }
    }
  }

  private report(): void {
    this.opts.onStatus?.({ loaded: this.tiles.size, loading: this.loading.size, failed: this.failed, online: (this.opts.adapter as { online?: boolean | null }).online ?? null, lastError: (this.opts.adapter as { lastError?: string | null }).lastError ?? null });
  }

  private async load(key: string, x: number, y: number, z: number): Promise<void> {
    const ctrl = new AbortController();
    this.loading.set(key, ctrl);
    try {
      const tile = await this.opts.adapter.fetchTile(z, x, y, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const primitives = new PrimitiveCollection();
      const loaded: LoadedTile = { key, tile, primitives, buildings: [] };
      this.tiles.set(key, loaded);
      this.root.add(primitives);
      await this.build(loaded);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        this.failed++;
        // Remember the failure so we do not hammer the API; retried after unload/reload cycles.
        this.tiles.set(key, { key, tile: null, primitives: this.root.add(new PrimitiveCollection()), buildings: [], error: String(e) });
      }
    } finally {
      this.loading.delete(key);
    }
  }

  private async build(loaded: LoadedTile): Promise<void> {
    const tile = loaded.tile!;
    const scene = this.viewer.scene;
    // Ground heights for buildings via the terrain provider (level 14 ≈ 10 m spacing).
    const centroids = tile.buildings.map((b) => Cartographic.fromDegrees(b.centroid[0], b.centroid[1]));
    let heights: number[] = tile.buildings.map(() => 0);
    if (centroids.length) {
      try {
        const sampled = await sampleTerrain(this.viewer.terrainProvider, 14, centroids);
        heights = sampled.map((c) => c.height ?? 0);
      } catch {
        heights = centroids.map((c) => scene.globe.getHeight(c) ?? 0);
      }
    }
    if (!this.tiles.has(loaded.key)) return; // unloaded meanwhile
    const inputs: BuildingInput[] = [];
    tile.buildings.forEach((b: OsmBuilding, i: number) => {
      if (b.outer.length < 4) return;
      const top = heights[i] + b.heightM;
      const hash = fnv1a(b.id);
      let css = FACADES[hash % FACADES.length];
      let windows = 0.75;
      if (b.heightM > 60) { css = ['#8fa3b8', '#9fb3c8', '#7f93a8', '#a8bccf'][(hash >> 4) % 4]; windows = 0.95; }
      if (b.type === 'industrial' || b.type === 'warehouse' || b.type === 'garage' || b.type === 'shed' || b.type === 'barn') { css = '#a4a7ab'; windows = 0.1; }
      if (b.type === 'church' || b.type === 'cathedral' || b.type === 'temple' || b.type === 'mosque') { css = '#d9d2c2'; windows = 0.2; }
      const c = Color.fromCssColorString(css);
      inputs.push({ id: b.id, outer: b.outer, holes: b.holes, baseM: heights[i] - 0.8, heightM: b.heightM + 0.8, colour: [Math.round(c.red * 255), Math.round(c.green * 255), Math.round(c.blue * 255)], windows, seed: (hash % 1000) / 1000 });
      loaded.buildings.push({ poly: b.outer, top });
    });
    if (inputs.length) {
      const anchorLat = (tile.bbox.north + tile.bbox.south) / 2;
      const anchorLon = (tile.bbox.east + tile.bbox.west) / 2;
      const anchorHeight = heights.length ? heights.reduce((a, h) => a + h, 0) / heights.length : 0;
      const mesh = buildBuildingMesh(anchorLat, anchorLon, anchorHeight, inputs);
      if (mesh) {
        loaded.primitives.add(new Primitive({
          geometryInstances: new GeometryInstance({ geometry: mesh.geometry, id: { kind: 'buildings', tile: loaded.key, count: inputs.length } }),
          modelMatrix: mesh.modelMatrix,
          appearance: createBuildingAppearance(),
          asynchronous: false,
          shadows: ShadowMode.ENABLED,
          allowPicking: true,
        }));
      }
    }
    const groundInstances: GeometryInstance[] = [];
    for (const l of tile.landuse) {
      if (l.polygon.length < 4) continue;
      const [css, alpha] = LANDUSE_COLOURS[l.kind];
      try {
        groundInstances.push(new GeometryInstance({ geometry: PolygonGeometry.fromPositions({ positions: l.polygon.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)), vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(css).withAlpha(alpha)) }, id: { kind: 'landuse', id: l.id, use: l.kind, name: l.name } }));
      } catch { /* ignore */ }
    }
    for (const w of tile.water) {
      try {
        if (w.polygon && w.polygon.length >= 4) {
          groundInstances.push(new GeometryInstance({ geometry: PolygonGeometry.fromPositions({ positions: w.polygon.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)), vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#2d5f8a').withAlpha(0.75)) }, id: { kind: 'water', id: w.id, name: w.name } }));
        } else if (w.line && w.line.length >= 2) {
          groundInstances.push(new GeometryInstance({ geometry: new CorridorGeometry({ positions: w.line.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)), width: Math.max(2, w.widthM), cornerType: CornerType.ROUNDED, vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#2d5f8a').withAlpha(0.8)) }, id: { kind: 'water', id: w.id, name: w.name } }));
        }
      } catch { /* ignore */ }
    }
    for (const r of tile.roads) {
      if (r.coords.length < 2 || r.tunnel) continue;
      try {
        groundInstances.push(new GeometryInstance({ geometry: new CorridorGeometry({ positions: r.coords.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)), width: r.widthM, cornerType: CornerType.ROUNDED, vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(ROAD_COLOURS[r.kind]).withAlpha(r.kind === 'path' ? 0.7 : 0.95)) }, id: { kind: 'road', id: r.id, name: r.name, roadKind: r.kind } }));
      } catch { /* ignore */ }
    }
    if (groundInstances.length) {
      loaded.primitives.add(new GroundPrimitive({ geometryInstances: groundInstances, appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }), classificationType: ClassificationType.TERRAIN, asynchronous: true, allowPicking: true }));
    }
  }

  destroy(): void {
    this.remove();
    for (const c of this.loading.values()) c.abort();
    this.viewer.scene.primitives.remove(this.root);
    this.tiles.clear();
  }
}
