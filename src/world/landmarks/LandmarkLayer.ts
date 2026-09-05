import { Cartesian2, Cartesian3, Cartographic, Color, DistanceDisplayCondition, HorizontalOrigin, LabelCollection, LabelStyle, Matrix4, PrimitiveCollection, ShadowMode, Transforms, VerticalOrigin, type Primitive, type Viewer, Math as CMath } from 'cesium';
import { createTilePrimitive, createVegetationAppearances, type VegetationAppearances } from '@/world/render';
import { LANDMARK_MODELS, type LandmarkModel } from '@/data/bookmarks/landmarkModels';
import { buildLandmark } from './landmarkShapes';
import { haversineM } from '@/util/geo';
import { fnv1a } from '@/util/hash';
import type { QualitySettings } from '@/engine/quality';

interface Placed { model: LandmarkModel; collection: PrimitiveCollection; primitive: Primitive; anchoredHeight: number | null }

export interface LandmarkLayerOptions { quality: () => QualitySettings; models?: LandmarkModel[]; showRadiusM?: number }

/**
 * Renders procedural stand-ins for major landmarks near the camera. Each mesh is built once in a local ENU frame at
 * the landmark's base, anchored on the terrain (re-anchored once detailed terrain has loaded), labelled with its
 * name, and disposed when out of range. Everything here is an interpretation — the labels say so.
 */
export class LandmarkLayer {
  private readonly root: PrimitiveCollection;
  private readonly labels: LabelCollection;
  private readonly placed = new Map<string, Placed>();
  private readonly labelIds = new Map<string, ReturnType<LabelCollection['add']>>();
  private appearances: VegetationAppearances | null = null;
  private readonly remove: () => void;
  private lastTick = 0;
  private readonly models: LandmarkModel[];
  private readonly quality: () => QualitySettings;
  private readonly showRadiusM: number;
  enabled = true;

  constructor(private readonly viewer: Viewer, opts: LandmarkLayerOptions) {
    this.quality = opts.quality;
    this.root = viewer.scene.primitives.add(new PrimitiveCollection());
    this.labels = viewer.scene.primitives.add(new LabelCollection());
    this.models = opts.models ?? LANDMARK_MODELS;
    this.showRadiusM = opts.showRadiusM ?? 30_000;
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  stats(): { visible: number; total: number } {
    return { visible: this.placed.size, total: this.models.length };
  }

  private update(): void {
    const now = performance.now();
    if (now - this.lastTick < 500) return;
    this.lastTick = now;
    const cam = this.viewer.camera.positionCartographic;
    // Low presets keep landmarks closer to save draw calls on modest hardware.
    const radius = this.showRadiusM * (this.quality().nearFieldRadiusM < 400 ? 0.5 : 1);
    if (!this.enabled || cam.height > 40_000) { this.unloadAll(); return; }
    const lat = CMath.toDegrees(cam.latitude), lon = CMath.toDegrees(cam.longitude);
    for (const m of this.models) {
      const d = haversineM(lat, lon, m.lat, m.lon);
      const key = m.name;
      if (d <= radius) {
        if (!this.placed.has(key)) this.place(m);
        else this.reanchor(this.placed.get(key)!);
      } else if (this.placed.has(key)) {
        this.unload(key);
      }
    }
  }

  private groundAt(m: LandmarkModel): number | null {
    const h = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(m.lon, m.lat));
    return h === undefined ? null : h;
  }

  private modelMatrix(m: LandmarkModel, ground: number): Matrix4 {
    const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(m.lon, m.lat, ground));
    const heading = CMath.toRadians(-m.headingDeg);
    const c = Math.cos(heading), s = Math.sin(heading);
    const spin = new Matrix4(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    return Matrix4.multiply(enu, spin, new Matrix4());
  }

  private place(m: LandmarkModel): void {
    if (!this.appearances) this.appearances = createVegetationAppearances(null);
    const ground = this.groundAt(m);
    const mesh = buildLandmark(m.archetype, m.heightM, m.footprintM, m.colour, fnv1a(m.name));
    const collection = new PrimitiveCollection();
    const primitive = createTilePrimitive(mesh, this.modelMatrix(m, ground ?? 0), this.appearances.opaque, ShadowMode.ENABLED);
    collection.add(primitive);
    this.root.add(collection);
    this.placed.set(m.name, { model: m, collection, primitive, anchoredHeight: ground });
    this.labelIds.set(m.name, this.labels.add({
      position: Cartesian3.fromDegrees(m.lon, m.lat, (ground ?? 0) + m.heightM + 12),
      text: `${m.name}\n(procedural interpretation)`,
      font: '600 14px system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK.withAlpha(0.85),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -6),
      distanceDisplayCondition: new DistanceDisplayCondition(0, 25_000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: { kind: 'landmark', name: m.name, provenance: 'position measured; geometry procedural' },
    }));
  }

  /** Once detailed terrain arrives the base height can differ by tens of metres; rebuild the model matrix. */
  private reanchor(p: Placed): void {
    const ground = this.groundAt(p.model);
    if (ground === null || (p.anchoredHeight !== null && Math.abs(ground - p.anchoredHeight) < 0.5)) return;
    p.primitive.modelMatrix = this.modelMatrix(p.model, ground);
    p.anchoredHeight = ground;
    const label = this.labelIds.get(p.model.name);
    if (label) label.position = Cartesian3.fromDegrees(p.model.lon, p.model.lat, ground + p.model.heightM + 12);
  }

  private unload(key: string): void {
    const p = this.placed.get(key);
    if (!p) return;
    this.root.remove(p.collection);
    this.placed.delete(key);
    const label = this.labelIds.get(key);
    if (label) { this.labels.remove(label); this.labelIds.delete(key); }
  }

  private unloadAll(): void {
    for (const key of [...this.placed.keys()]) this.unload(key);
  }

  destroy(): void {
    this.remove();
    this.unloadAll();
    this.viewer.scene.primitives.remove(this.root);
    this.viewer.scene.primitives.remove(this.labels);
    this.appearances?.destroy();
  }
}
