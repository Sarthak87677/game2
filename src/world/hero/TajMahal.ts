/**
 * Taj Mahal hero gameplay system (`taj-mahal`): streams the procedural reconstruction in when the camera or player
 * is within 6 km of Agra, anchors it on the measured terrain, registers a height sampler so the terraces, garden
 * paths, plinth and the central chamber are walkable, and offers the "Enter mausoleum (approximate interior)"
 * interaction with a visible provenance note.
 *
 * Everything shown is a procedural hero interpretation at the real position — see `tajMahalGeometry.ts`.
 */
import { Cartesian2, Cartesian3, Cartographic, Color, DistanceDisplayCondition, HorizontalOrigin, LabelCollection, LabelStyle, Matrix4, PrimitiveCollection, ShadowMode, Transforms, VerticalOrigin, type Primitive, Math as CMath } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { createTilePrimitive, createVegetationAppearances, vertexCount, type VegetationAppearances } from '@/world/render';
import { enuOffsetM, haversineM, offsetToLonLat } from '@/util/geo';
import { buildTajMahalMeshes, TAJ, TAJ_MAHAL_CENTRE, TAJ_SPOTS, TAJ_STREAM_RADIUS_M, tajHeightAt, type TajMeshes } from './tajMahalGeometry';

export const TAJ_NOTE = 'Procedural hero reconstruction at the real position — massing follows public reference dimensions; the gardens, details and the interior are an approximate original interpretation, not a survey.';

/** Points whose terrain heights anchor the base: the complex sits on the highest of them so lawns stay above the ground. */
const ANCHOR_POINTS: [number, number][] = [[0, 0], [0, TAJ.centreY], [0, TAJ.gateY], [-120, -120], [120, -120]];

export class TajMahalSystem implements GameplaySystem {
  readonly id = 'taj-mahal';
  readonly label = 'Taj Mahal';
  private readonly root: PrimitiveCollection;
  private readonly labels: LabelCollection;
  private appearances: VegetationAppearances | null = null;
  private meshes: TajMeshes | null = null;
  private primitives: Primitive[] = [];
  private baseHeight: number | null = null;
  private pendingBase = false;
  private lastTick = 0;
  private distanceM = Infinity;
  private readonly removeSampler: () => void;
  private inside = false;
  private destroyed = false;

  constructor(private readonly engine: TerraEngine) {
    this.root = engine.viewer.scene.primitives.add(new PrimitiveCollection());
    this.labels = engine.viewer.scene.primitives.add(new LabelCollection());
    this.removeSampler = engine.modes.addHeightSampler((lat, lon) => this.heightAt(lat, lon));
  }

  /** Height above the ellipsoid of the walkable Taj surface at a point, or null off the complex / before streaming. */
  heightAt(lat: number, lon: number): number | null {
    if (this.baseHeight === null || this.primitives.length === 0) return null;
    if (Math.abs(lat - TAJ_MAHAL_CENTRE.lat) > 0.006 || Math.abs(lon - TAJ_MAHAL_CENTRE.lon) > 0.004) return null;
    const { east, north } = enuOffsetM(TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon, lat, lon);
    const h = tajHeightAt(east, north);
    return h === null ? null : this.baseHeight + h;
  }

  private local(x: number, y: number): { lat: number; lon: number } {
    return offsetToLonLat(TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon, x, y);
  }

  update(ctx: GameplayContext): void {
    if (ctx.nowMs - this.lastTick < 500 || this.destroyed) return;
    this.lastTick = ctx.nowMs;
    const p = ctx.player;
    this.distanceM = haversineM(p.lat, p.lon, TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon);
    const cam = this.engine.viewer.camera.positionCartographic;
    const tooHigh = cam.height > 60_000;
    if (this.distanceM <= TAJ_STREAM_RADIUS_M && !tooHigh) {
      if (this.primitives.length === 0) this.stream();
      else this.reanchor();
    } else if (this.primitives.length > 0 && (this.distanceM > TAJ_STREAM_RADIUS_M * 1.1 || tooHigh)) {
      this.unload();
    }
    if (p.embodied && this.primitives.length > 0) {
      const { east, north } = enuOffsetM(TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon, p.lat, p.lon);
      this.inside = Math.abs(east) < TAJ.bodyHalf && Math.abs(north) < TAJ.bodyHalf;
    } else this.inside = false;
  }

  /** Terrain height under the complex: the highest loaded value among the anchor points, else an async sample. */
  private sampleBase(): number | null {
    const globe = this.engine.viewer.scene.globe;
    let best: number | null = null;
    for (const [x, y] of ANCHOR_POINTS) {
      const ll = this.local(x, y);
      const h = globe.getHeight(Cartographic.fromDegrees(ll.lon, ll.lat));
      if (h !== undefined && Number.isFinite(h) && (best === null || h > best)) best = h;
    }
    return best;
  }

  private stream(): void {
    const base = this.sampleBase();
    if (base === null) {
      if (!this.pendingBase) {
        this.pendingBase = true;
        void this.engine.terrainHeight(TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon).then((h) => {
          this.pendingBase = false;
          if (!this.destroyed && this.primitives.length === 0 && this.distanceM <= TAJ_STREAM_RADIUS_M) this.place(h);
        }).catch(() => { this.pendingBase = false; });
      }
      return;
    }
    this.place(base);
  }

  private place(base: number): void {
    if (!this.appearances) { this.appearances = createVegetationAppearances(null); this.appearances.setWind(0, 0, 1, 0); }
    this.meshes ??= buildTajMahalMeshes();
    this.baseHeight = base;
    const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(TAJ_MAHAL_CENTRE.lon, TAJ_MAHAL_CENTRE.lat, base));
    for (const mesh of [this.meshes.ground, this.meshes.mausoleum, this.meshes.gateAndMosques, this.meshes.trees, this.meshes.interior]) {
      const prim = createTilePrimitive(mesh, Matrix4.clone(enu), this.appearances.opaque, ShadowMode.ENABLED);
      this.root.add(prim);
      this.primitives.push(prim);
    }
    const top = this.local(0, 0);
    this.labels.add({
      position: Cartesian3.fromDegrees(top.lon, top.lat, base + TAJ.plinth + TAJ.domeTop + 14),
      text: 'Taj Mahal\n(procedural hero reconstruction — approximate)',
      font: '600 14px system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK.withAlpha(0.85),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -6),
      distanceDisplayCondition: new DistanceDisplayCondition(0, 12_000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: { kind: 'landmark', name: 'Taj Mahal', provenance: 'position measured; geometry procedural hero reconstruction' },
    });
    const gate = this.local(0, TAJ.gateY);
    this.labels.add({
      position: Cartesian3.fromDegrees(gate.lon, gate.lat, base + TAJ.garden + TAJ.gateHeight + 10),
      text: 'Great Gate\n(approximate)',
      font: '500 12px system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK.withAlpha(0.85),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 2500),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  }

  /** Detailed terrain can arrive after placement; rebuild the primitives when the base moves by more than 0.5 m. */
  private reanchor(): void {
    const base = this.sampleBase();
    if (base === null || this.baseHeight === null || Math.abs(base - this.baseHeight) < 0.5) return;
    this.unload();
    this.place(base);
  }

  private unload(): void {
    for (const p of this.primitives) this.root.remove(p);
    this.primitives = [];
    this.labels.removeAll();
    this.baseHeight = null;
  }

  interactions(): Interaction[] {
    if (this.primitives.length === 0) return [];
    const door = this.local(TAJ_SPOTS.southDoor.x, TAJ_SPOTS.southDoor.y);
    const chamber = this.local(TAJ_SPOTS.chamber.x, TAJ_SPOTS.chamber.y);
    const gate = this.local(0, TAJ.gateY);
    return [
      {
        id: 'taj-enter', label: 'Enter mausoleum (approximate interior)', lat: door.lat, lon: door.lon, radiusM: 7, priority: 2, modes: ['walk'],
        run: () => {
          this.engine.gameplay.teleport(chamber.lat, chamber.lon, 0);
          this.engine.gameplay.showOverlay({
            title: 'Taj Mahal — central chamber (approximate)',
            lines: [
              'You are inside an approximate original interpretation of the octagonal central chamber: a marble screen around two plain memorial blocks, niches in the walls and the inner dome above.',
              'The real chamber’s inlay, calligraphy and cenotaph decoration are not reproduced. Walk south through the passage to return to the platform.',
            ],
            actions: [{ id: 'ok', label: 'Continue' }],
            note: TAJ_NOTE,
          }, () => this.engine.gameplay.closeOverlay());
        },
      },
      {
        id: 'taj-leave', label: 'Leave mausoleum', lat: chamber.lat, lon: chamber.lon, radiusM: 6, priority: 1, modes: ['walk'],
        run: () => { const out = this.local(0, -TAJ.plinthHalf + 6); this.engine.gameplay.teleport(out.lat, out.lon, 180); this.engine.gameplay.closeOverlay(); },
      },
      {
        id: 'taj-about', label: 'About this reconstruction', lat: gate.lat, lon: gate.lon, radiusM: 22, modes: ['walk', 'drive'],
        run: () => this.engine.gameplay.showOverlay({
          title: 'Taj Mahal hero destination',
          lines: [
            'Layout: Great Gate, charbagh with the long pool and raised paths, riverfront terrace with the mosque and jawab, marble plinth with four minarets, and the mausoleum with its dome and chhatris.',
            'Streams in within 6 km. Terrain is measured; every building here is generated from primitives.',
          ],
          actions: [{ id: 'ok', label: 'Close' }],
          note: TAJ_NOTE,
        }, () => this.engine.gameplay.closeOverlay()),
      },
    ];
  }

  stats(): Record<string, string | number> {
    const vertices = this.meshes ? vertexCount(this.meshes.ground) + vertexCount(this.meshes.mausoleum) + vertexCount(this.meshes.gateAndMosques) + vertexCount(this.meshes.trees) + vertexCount(this.meshes.interior) : 0;
    return {
      streamed: this.primitives.length > 0 ? 'yes' : 'no',
      primitives: this.primitives.length,
      vertices,
      'distance km': Number.isFinite(this.distanceM) ? +(this.distanceM / 1000).toFixed(1) : '—',
      'base m': this.baseHeight === null ? '—' : +this.baseHeight.toFixed(1),
      inside: this.inside ? 'yes' : 'no',
    };
  }

  onSpawn(lat: number, lon: number): void {
    this.distanceM = haversineM(lat, lon, TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon);
    if (this.distanceM <= TAJ_STREAM_RADIUS_M && this.primitives.length === 0) this.stream();
  }

  destroy(): void {
    this.destroyed = true;
    this.removeSampler();
    this.unload();
    this.engine.viewer.scene.primitives.remove(this.root);
    this.engine.viewer.scene.primitives.remove(this.labels);
    this.appearances?.destroy();
    this.meshes = null;
    void CMath;
  }
}
