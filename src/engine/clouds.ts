import { CloudCollection, Cartesian3, Cartesian2, Credit, Event as CesiumEvent, GeographicTilingScheme, ImageryLayer, Rectangle, type ImageryProvider, type ImageryTypes, type Proxy, type TileDiscardPolicy, type TilingScheme, type Viewer, Math as CMath, Color } from 'cesium';
import { fbm2 } from '@/util/hash';
import type { WorldMap } from '@/world/worldMap';

/**
 * Orbital cloud layer: a translucent procedural imagery layer whose coverage follows the inferred monthly
 * precipitation (ITCZ, storm tracks) and drifts slowly with the simulated day. Clearly procedural — not observed.
 */
export class ProceduralCloudImageryProvider implements ImageryProvider {
  readonly tilingScheme: TilingScheme = new GeographicTilingScheme();
  readonly rectangle = Rectangle.MAX_VALUE;
  readonly tileWidth = 256;
  readonly tileHeight = 256;
  readonly maximumLevel = 4;
  readonly minimumLevel = 0;
  readonly tileDiscardPolicy = undefined as unknown as TileDiscardPolicy;
  readonly errorEvent = new CesiumEvent();
  readonly credit = new Credit('Clouds: procedural (inferred from climate)', false);
  readonly proxy = undefined as unknown as Proxy;
  readonly hasAlphaChannel = true;
  constructor(private worldMap: () => WorldMap | null, private dayOfYear: () => number) {}
  getTileCredits(): Credit[] { return []; }
  pickFeatures(): undefined { return undefined; }
  requestImage(x: number, y: number, level: number): Promise<ImageryTypes> | undefined {
    const rect = this.tilingScheme.tileXYToRectangle(x, y, level);
    const west = CMath.toDegrees(rect.west), east = CMath.toDegrees(rect.east), south = CMath.toDegrees(rect.south), north = CMath.toDegrees(rect.north);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return Promise.resolve(c);
    const img = ctx.createImageData(256, 256);
    const wm = this.worldMap();
    const doy = this.dayOfYear();
    const month = Math.min(11, Math.floor((doy / 365) * 12));
    const drift = doy * 0.7;
    for (let j = 0; j < 256; j++) {
      const lat = north - ((j + 0.5) / 256) * (north - south);
      for (let i = 0; i < 256; i++) {
        const lon = west + ((i + 0.5) / 256) * (east - west);
        let wet = 0.45;
        if (wm) {
          const s = wm.sample(lat, lon);
          wet = Math.min(1, (s.monthlyPrecipMm[month] ?? 50) / 180);
        }
        const bandITCZ = Math.exp(-((lat - (month >= 4 && month <= 9 ? 8 : -6)) ** 2) / 90);
        const storm = Math.exp(-((Math.abs(lat) - 55) ** 2) / 200);
        const coverage = 0.25 + 0.45 * wet + 0.2 * bandITCZ + 0.15 * storm;
        const n = fbm2((lon + 180 + drift) / 9, (lat + 90) / 9, 5, 31);
        const n2 = fbm2((lon + 180 - drift * 0.4) / 2.5, (lat + 90) / 2.5, 3, 77);
        const v = n * 0.7 + n2 * 0.3;
        const a = Math.max(0, Math.min(1, (v - (1 - coverage) * 0.75 - 0.12) * 3.2));
        const p = (j * 256 + i) * 4;
        img.data[p] = 245; img.data[p + 1] = 248; img.data[p + 2] = 252; img.data[p + 3] = Math.round(a * 235);
      }
    }
    ctx.putImageData(img, 0, 0);
    return Promise.resolve(c);
  }
}

/** Manages the orbital cloud layer and near-ground cumulus clouds (Cesium CloudCollection) around the camera. */
export class CloudSystem {
  private layer: ImageryLayer | null = null;
  private cumulus: CloudCollection | null = null;
  private anchor: { lat: number; lon: number } | null = null;
  private cover = 0.2;
  private remove: () => void;
  enabled = true;
  nearCloudsEnabled = true;

  constructor(private viewer: Viewer, worldMap: () => WorldMap | null, dayOfYear: () => number) {
    try {
      this.layer = viewer.imageryLayers.addImageryProvider(new ProceduralCloudImageryProvider(worldMap, dayOfYear));
      this.layer.alpha = 0.85;
      this.layer.show = false;
    } catch { this.layer = null; }
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  setCloudCover(c: number): void {
    this.cover = c;
    if (this.layer) this.layer.alpha = 0.55 + 0.4 * Math.min(1, c);
    this.anchor = null; // force cumulus rebuild
  }

  /** Re-renders the orbital layer (e.g. when the date jumps). */
  refresh(): void {
    if (!this.layer) return;
    const layers = this.viewer.imageryLayers;
    const idx = layers.indexOf(this.layer);
    const provider = this.layer.imageryProvider;
    layers.remove(this.layer, true);
    this.layer = layers.addImageryProvider(provider, idx);
    this.layer.alpha = 0.55 + 0.4 * Math.min(1, this.cover);
  }

  private update(): void {
    const cam = this.viewer.camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(cam) ?? 0;
    const agl = cam.height - ground;
    if (this.layer) this.layer.show = this.enabled && cam.height > 12_000;
    const wantNear = this.enabled && this.nearCloudsEnabled && agl < 12_000 && this.cover > 0.15;
    if (!wantNear) { if (this.cumulus) this.cumulus.show = false; return; }
    const lat = CMath.toDegrees(cam.latitude), lon = CMath.toDegrees(cam.longitude);
    if (!this.anchor || Math.abs(this.anchor.lat - lat) > 0.04 || Math.abs(this.anchor.lon - lon) > 0.04) this.rebuild(lat, lon, ground);
    if (this.cumulus) this.cumulus.show = true;
  }

  private rebuild(lat: number, lon: number, ground: number): void {
    this.anchor = { lat, lon };
    if (this.cumulus) this.viewer.scene.primitives.remove(this.cumulus);
    const coll = new CloudCollection({ noiseDetail: 12 });
    const count = Math.round(6 + 34 * Math.min(1, this.cover));
    const base = ground + 1400 + 600 * (1 - this.cover);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ((i * 7919) % 13) / 13;
      const r = 900 + ((i * 104729) % 4000);
      const dLat = (Math.cos(a) * r) / 111_132;
      const dLon = (Math.sin(a) * r) / (111_320 * Math.cos(lat * Math.PI / 180));
      const scale = 250 + ((i * 31) % 7) * 70;
      coll.add({ position: Cartesian3.fromDegrees(lon + dLon, lat + dLat, base + ((i * 17) % 5) * 90), scale: new Cartesian2(scale, scale * 0.45), maximumSize: new Cartesian3(scale * 0.9, scale * 0.4, scale * 0.6), slice: 0.42, brightness: 1 - 0.35 * this.cover, color: Color.WHITE });
    }
    this.cumulus = this.viewer.scene.primitives.add(coll);
  }

  destroy(): void {
    this.remove();
    if (this.layer) this.viewer.imageryLayers.remove(this.layer, true);
    if (this.cumulus) this.viewer.scene.primitives.remove(this.cumulus);
  }
}
