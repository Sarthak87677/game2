/**
 * Near-field procedural world renderer. Streams NEAR_FIELD_ZOOM tiles around the camera from a generator callback,
 * builds their geometry (trees, shrubs, grass, rocks, crops, procedural buildings) into Cesium primitives and manages
 * LOD: full geometry within the quality preset's nearFieldRadiusM (R), billboard impostors out to 3R, unloading
 * beyond 4R with an LRU cap. Every tile lives in its own PrimitiveCollection under one root collection.
 *
 * Floating origin: each tile is anchored with `Transforms.eastNorthUpToFixedFrame(anchor)` and its vertices are the
 * generator's local metres with z shifted by -anchorHeightM, so vertex data never contains world-scale floats.
 *
 * Integration: construct with the viewer, a `generate(z, x, y)` callback (null = data not ready yet, retried with
 * backoff), a `quality()` getter and optionally a species resolver; call `setDate` when the simulated date changes,
 * `setWind` from the weather system, `heightAt` from the walking-collision sampler, `stats()` for the diagnostics
 * panel and `destroy()` on teardown. Nothing here touches src/engine.
 */
import { Cartesian3, Cartographic, Math as CMath, Matrix4, PrimitiveCollection, Transforms, type Primitive, type Viewer } from 'cesium';
import type { BuildingSpec, FieldSpec, NearFieldTile } from '@/world/procedural/types';
import { NEAR_FIELD_ZOOM } from '@/world/procedural/types';
import type { QualitySettings } from '@/engine/quality';
import { haversineM, lonLatToTile, offsetToLonLat, tileBounds } from '@/util/geo';
import { buildLeafAtlas } from './leafAtlas';
import { BUCKET_SHADOWS, createTilePrimitive, createVegetationAppearances, type VegetationAppearances } from './VegetationMaterial';
import { buildImpostorCollection, ImpostorSprites } from './impostors';
import { buildTileMeshes, fallbackSpecies, type SpeciesLookup, type TileMeshCounts } from './tileMesh';
import { buildingHeightAt, retryDelayMs, selectNearFieldTiles, tileKey, tileLocalPoint, unloadOrder, type NearFieldLod } from './tileSelection';

export { selectNearFieldTiles, unloadOrder, buildingHeightAt, tileLocalPoint, retryDelayMs, tileKey } from './tileSelection';
export type { TileCandidate, LoadedTileInfo, NearFieldLod } from './tileSelection';

export interface NearFieldStats {
  /** Tiles with generated data currently held (any LOD). */
  tiles: number;
  /** Tiles requested from the generator but not yet returned (or waiting for a retry). */
  pendingTiles: number;
  treeInstances: number;
  shrubInstances: number;
  grassInstances: number;
  rockInstances: number;
  buildings: number;
  fields: number;
  /** Wall time of the most recent generator call (ms). */
  lastGenerationMs: number;
  /** Cesium primitives (mesh chunks + billboard collections) under the root collection. */
  primitives: number;
}

export interface NearFieldWorldOptions {
  /** Generator (typically a worker proxy). Resolve null while data is not ready; the tile is retried with backoff. */
  generate: (z: number, x: number, y: number) => Promise<NearFieldTile | null>;
  quality: () => QualitySettings;
  /** Species library lookup; unknown ids fall back to a generic species of a plausible kind. */
  species?: SpeciesLookup;
  onStats?: (s: NearFieldStats) => void;
  /** Maximum tiles kept (data + primitives). Default 64. */
  maxTiles?: number;
  /** Camera altitude above ground (m) beyond which everything unloads. Default 6000. */
  maxAltitudeM?: number;
  /** Concurrent generator calls. Default 2. */
  maxInFlight?: number;
  /** Skip OSM-sourced BuildingSpecs (already drawn by OsmLayer). Default true. */
  skipOsmBuildings?: boolean;
}

interface TileRecord {
  key: string;
  z: number;
  x: number;
  y: number;
  lat: number;
  lon: number;
  data: NearFieldTile | null;
  lod: 'none' | NearFieldLod;
  collection: PrimitiveCollection | null;
  pending: boolean;
  failures: number;
  retryAt: number;
  lastWanted: number;
  distM: number;
  buildings: BuildingSpec[];
  counts: TileMeshCounts | null;
  impostors: number;
}

interface QueuedPrimitive { rec: TileRecord; collection: PrimitiveCollection; primitive: Primitive }

const TICK_MS = 250;

/** See module doc. */
export class NearFieldWorld {
  /** When false the world unloads and stays empty. */
  enabled = true;
  private readonly tiles = new Map<string, TileRecord>();
  private readonly root: PrimitiveCollection;
  private readonly removeListener: () => void;
  private readonly appearances: VegetationAppearances;
  private readonly sprites = new ImpostorSprites();
  private readonly speciesLookup: SpeciesLookup;
  private readonly maxTiles: number;
  private readonly maxAltitudeM: number;
  private readonly maxInFlight: number;
  private inFlight = 0;
  private lastTick = 0;
  private lastFrame = 0;
  private windTime = 0;
  private windSpeedMs = 3;
  private windDir = { x: 0.9, y: 0.4 };
  private generation = 0;
  private monthKey: number | null = null;
  private lastGenerationMs = 0;
  private buildQueue: QueuedPrimitive[] = [];
  private cachedStats: NearFieldStats = { tiles: 0, pendingTiles: 0, treeInstances: 0, shrubInstances: 0, grassInstances: 0, rockInstances: 0, buildings: 0, fields: 0, lastGenerationMs: 0, primitives: 0 };
  private destroyed = false;

  constructor(private readonly viewer: Viewer, private readonly opts: NearFieldWorldOptions) {
    this.root = viewer.scene.primitives.add(new PrimitiveCollection());
    this.appearances = createVegetationAppearances(buildLeafAtlas());
    this.speciesLookup = (id) => opts.species?.(id) ?? fallbackSpecies(id);
    this.maxTiles = opts.maxTiles ?? 64;
    this.maxAltitudeM = opts.maxAltitudeM ?? 6000;
    this.maxInFlight = opts.maxInFlight ?? 2;
    this.applyWind();
    this.removeListener = viewer.scene.preUpdate.addEventListener(() => this.onPreUpdate());
  }

  /** Invalidates every tile when the month changes (phenology is generated per month); otherwise a no-op. */
  setDate(date: Date): void {
    const key = date.getUTCFullYear() * 12 + date.getUTCMonth();
    if (this.monthKey === key) return;
    const first = this.monthKey === null;
    this.monthKey = key;
    if (!first) this.invalidate();
  }

  /** Wind for the sway shader: speed in m/s and the direction it blows toward (radians counter-clockwise from east). */
  setWind(speedMs: number, directionRad: number): void {
    this.windSpeedMs = Math.max(0, speedMs);
    this.windDir = { x: Math.cos(directionRad), y: Math.sin(directionRad) };
    this.applyWind();
  }

  /** Drops all generated tiles so they regenerate (date change, species library reload, ...). */
  invalidate(): void {
    this.generation++;
    this.unloadAll();
  }

  /**
   * Top of a procedural building (metres above the ellipsoid) at a point, or null when no full-detail tile has a
   * building there. Point-in-polygon runs in tile-local metres against the rendered BuildingSpecs.
   */
  heightAt(lat: number, lon: number): number | null {
    const { x, y } = lonLatToTile(lon, lat, NEAR_FIELD_ZOOM);
    const rec = this.tiles.get(tileKey(NEAR_FIELD_ZOOM, x, y));
    if (!rec?.data || rec.lod !== 'full' || rec.buildings.length === 0) return null;
    const p = tileLocalPoint(rec.data.anchorLat, rec.data.anchorLon, lat, lon);
    return buildingHeightAt(rec.buildings, p.x, p.y);
  }

  stats(): NearFieldStats {
    return this.cachedStats;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeListener();
    for (const q of this.buildQueue) q.primitive.destroy();
    this.buildQueue = [];
    this.tiles.clear();
    this.viewer.scene.primitives.remove(this.root);
    this.appearances.destroy();
  }

  private applyWind(): void {
    const strength = Math.min(0.6, 0.04 + 0.03 * this.windSpeedMs);
    this.appearances.setWind(this.windTime, strength, this.windDir.x, this.windDir.y);
  }

  private onPreUpdate(): void {
    if (this.destroyed) return;
    const now = performance.now();
    if (this.lastFrame > 0) this.windTime = (this.windTime + Math.min(0.1, (now - this.lastFrame) / 1000)) % 100_000;
    this.lastFrame = now;
    this.applyWind();
    this.drainQueue();
    if (now - this.lastTick < TICK_MS) return;
    this.lastTick = now;
    try {
      this.update(now);
    } catch {
      // A failed tick must never break the render loop; the next tick retries.
    }
  }

  private drainQueue(): void {
    while (this.buildQueue.length) {
      const q = this.buildQueue.shift()!;
      const live = this.tiles.get(q.rec.key);
      if (!live || live.collection !== q.collection) { q.primitive.destroy(); continue; }
      q.collection.add(q.primitive);
      return; // one synchronous primitive build per frame keeps hitches small
    }
  }

  private update(now: number): void {
    if (!this.enabled) { this.unloadAll(); this.report(); return; }
    const cam = this.viewer.camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(cam) ?? 0;
    const agl = cam.height - ground;
    if (agl > this.maxAltitudeM) { this.unloadAll(); this.report(); return; }
    const q = this.opts.quality();
    const R = Math.max(50, q.nearFieldRadiusM);
    const lat = CMath.toDegrees(cam.latitude), lon = CMath.toDegrees(cam.longitude);
    const wanted = selectNearFieldTiles(lat, lon, R, 3 * R);

    for (const rec of this.tiles.values()) rec.distM = haversineM(lat, lon, rec.lat, rec.lon);
    const evict = unloadOrder([...this.tiles.values()].map((r) => ({ key: r.key, distM: r.distM, lastUsed: r.lastWanted })), 4 * R, this.maxTiles);
    for (const key of evict) this.unloadTile(key);

    let fullBuilds = 0;
    for (const w of wanted) {
      let rec = this.tiles.get(w.key);
      if (!rec) {
        if (this.tiles.size >= this.maxTiles) continue;
        rec = { key: w.key, z: w.z, x: w.x, y: w.y, lat: w.lat, lon: w.lon, data: null, lod: 'none', collection: null, pending: false, failures: 0, retryAt: 0, lastWanted: now, distM: w.distM, buildings: [], counts: null, impostors: 0 };
        this.tiles.set(w.key, rec);
      }
      rec.lastWanted = now;
      rec.distM = w.distM;
      if (!rec.data) {
        if (!rec.pending && now >= rec.retryAt && this.inFlight < this.maxInFlight) void this.request(rec);
        continue;
      }
      let target: NearFieldLod = w.lod;
      if (rec.lod === 'full' && target === 'impostor' && w.distM < R * 1.25) target = 'full'; // hysteresis at the boundary
      if (rec.lod === target) continue;
      if (target === 'full') {
        if (fullBuilds >= 1) continue;
        fullBuilds++;
        this.buildFull(rec, rec.data);
      } else {
        this.buildImpostor(rec, rec.data, R);
      }
    }
    this.report();
  }

  private async request(rec: TileRecord): Promise<void> {
    rec.pending = true;
    this.inFlight++;
    const generation = this.generation;
    const t0 = performance.now();
    try {
      const data = await this.opts.generate(rec.z, rec.x, rec.y);
      if (this.destroyed || generation !== this.generation || this.tiles.get(rec.key) !== rec) return;
      if (data) {
        rec.data = data;
        rec.failures = 0;
        this.lastGenerationMs = performance.now() - t0;
      } else {
        rec.failures++;
        rec.retryAt = performance.now() + retryDelayMs(rec.failures);
      }
    } catch {
      rec.failures++;
      rec.retryAt = performance.now() + retryDelayMs(rec.failures);
    } finally {
      rec.pending = false;
      this.inFlight--;
    }
  }

  private modelMatrixFor(tile: NearFieldTile): Matrix4 {
    return Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(tile.anchorLon, tile.anchorLat, tile.anchorHeightM));
  }

  private freshCollection(rec: TileRecord): PrimitiveCollection {
    if (rec.collection) this.root.remove(rec.collection);
    const c = new PrimitiveCollection();
    this.root.add(c);
    rec.collection = c;
    return c;
  }

  private buildFull(rec: TileRecord, tile: NearFieldTile): void {
    const modelMatrix = this.modelMatrixFor(tile);
    const result = buildTileMeshes(tile, { species: this.speciesLookup, fieldHeightAt: this.fieldSampler(tile), skipOsmBuildings: this.opts.skipOsmBuildings ?? true });
    const collection = this.freshCollection(rec);
    rec.lod = 'full';
    rec.buildings = result.buildings;
    rec.counts = result.counts;
    rec.impostors = 0;
    for (const chunk of result.opaque) this.buildQueue.push({ rec, collection, primitive: createTilePrimitive(chunk, modelMatrix, this.appearances.opaque, BUCKET_SHADOWS.opaque) });
    for (const chunk of result.cutout) this.buildQueue.push({ rec, collection, primitive: createTilePrimitive(chunk, modelMatrix, this.appearances.cutout, BUCKET_SHADOWS.cutout) });
  }

  private buildImpostor(rec: TileRecord, tile: NearFieldTile, fullRadiusM: number): void {
    const collection = this.freshCollection(rec);
    rec.lod = 'impostor';
    rec.buildings = [];
    rec.counts = null;
    const built = buildImpostorCollection(tile, this.speciesLookup, this.modelMatrixFor(tile), this.sprites, { fullRadiusM });
    rec.impostors = built?.count ?? 0;
    if (built) collection.add(built.collection);
  }

  /** Bilinear terrain sampler per field from a 5x5 grid of globe heights (falls back to the tile anchor height). */
  private fieldSampler(tile: NearFieldTile): (field: FieldSpec, x: number, y: number) => number {
    const globe = this.viewer.scene.globe;
    const grids = new Map<string, { x0: number; y0: number; dx: number; dy: number; h: Float64Array }>();
    const N = 5;
    return (field, x, y) => {
      let g = grids.get(field.id);
      if (!g) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [px, py] of field.polygon) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
        const dx = Math.max(1e-3, (x1 - x0) / (N - 1)), dy = Math.max(1e-3, (y1 - y0) / (N - 1));
        const h = new Float64Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const ll = offsetToLonLat(tile.anchorLat, tile.anchorLon, x0 + dx * i, y0 + dy * j);
          h[j * N + i] = globe.getHeight(Cartographic.fromDegrees(ll.lon, ll.lat)) ?? tile.anchorHeightM;
        }
        g = { x0, y0, dx, dy, h };
        grids.set(field.id, g);
      }
      const fx = Math.min(N - 1.0001, Math.max(0, (x - g.x0) / g.dx)), fy = Math.min(N - 1.0001, Math.max(0, (y - g.y0) / g.dy));
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const h00 = g.h[j * N + i], h10 = g.h[j * N + i + 1], h01 = g.h[(j + 1) * N + i], h11 = g.h[(j + 1) * N + i + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
    };
  }

  private unloadTile(key: string): void {
    const rec = this.tiles.get(key);
    if (!rec) return;
    if (rec.collection) this.root.remove(rec.collection);
    this.tiles.delete(key);
  }

  private unloadAll(): void {
    for (const key of [...this.tiles.keys()]) this.unloadTile(key);
    for (const q of this.buildQueue) q.primitive.destroy();
    this.buildQueue = [];
  }

  private report(): void {
    const s: NearFieldStats = { tiles: 0, pendingTiles: 0, treeInstances: 0, shrubInstances: 0, grassInstances: 0, rockInstances: 0, buildings: 0, fields: 0, lastGenerationMs: this.lastGenerationMs, primitives: 0 };
    for (const rec of this.tiles.values()) {
      if (rec.data) s.tiles++; else s.pendingTiles++;
      if (rec.collection) s.primitives += rec.collection.length;
      if (rec.counts) {
        s.treeInstances += rec.counts.trees;
        s.shrubInstances += rec.counts.shrubs;
        s.grassInstances += rec.counts.grass;
        s.rockInstances += rec.counts.rocks;
        s.buildings += rec.counts.buildings;
        s.fields += rec.counts.fields;
      } else {
        s.treeInstances += rec.impostors;
      }
    }
    s.primitives += this.buildQueue.length;
    this.cachedStats = s;
    this.opts.onStats?.(s);
  }
}

/** Geographic centre of a near-field tile (used by diagnostics overlays). */
export function nearFieldTileCentre(x: number, y: number, z = NEAR_FIELD_ZOOM): { lat: number; lon: number } {
  const b = tileBounds(x, y, z);
  return { lat: (b.north + b.south) / 2, lon: (b.east + b.west) / 2 };
}
