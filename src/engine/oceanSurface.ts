import { buildModuleUrl, Cartesian3, Color, EllipsoidSurfaceAppearance, GeometryInstance, Material, Primitive, Rectangle, RectangleGeometry, Math as CMath, type Viewer } from 'cesium';

/**
 * A sea-level water surface with animated normal-mapped waves that follows the camera (floating patch). It covers the
 * bathymetric terrain below 0 m so coasts read correctly from the ground. Hidden at orbital altitudes where the
 * imagery already shows the ocean.
 */
export class OceanSurface {
  private primitive: Primitive | null = null;
  private centre: { lat: number; lon: number; sizeDeg: number } | null = null;
  private remove: () => void;
  private material: Material;
  enabled = true;

  constructor(private viewer: Viewer) {
    this.material = Material.fromType('Water', {
      baseWaterColor: new Color(0.02, 0.12, 0.22, 0.92),
      blendColor: new Color(0.0, 0.5, 0.6, 0.6),
      normalMap: buildModuleUrl('Assets/Textures/waterNormals.jpg'),
      frequency: 8000.0,
      animationSpeed: 0.015,
      amplitude: 4.0,
      specularIntensity: 0.6,
    });
    this.remove = viewer.scene.preUpdate.addEventListener(() => this.update());
  }

  private update(): void {
    const cam = this.viewer.camera.positionCartographic;
    const height = cam.height;
    const show = this.enabled && height < 250_000;
    if (!show) {
      if (this.primitive) this.primitive.show = false;
      return;
    }
    const lat = CMath.toDegrees(cam.latitude);
    const lon = CMath.toDegrees(cam.longitude);
    const sizeDeg = Math.min(6, Math.max(0.35, (height / 1000) * 0.05 + 0.35));
    const needRebuild = !this.centre || Math.abs(this.centre.lat - lat) > sizeDeg * 0.25 || Math.abs(this.centre.lon - lon) > sizeDeg * 0.25 || Math.abs(this.centre.sizeDeg - sizeDeg) > sizeDeg * 0.5;
    if (needRebuild) this.rebuild(lat, lon, sizeDeg);
    if (this.primitive) this.primitive.show = true;
  }

  private rebuild(lat: number, lon: number, sizeDeg: number): void {
    if (this.primitive) this.viewer.scene.primitives.remove(this.primitive);
    const south = Math.max(-89.9, lat - sizeDeg);
    const north = Math.min(89.9, lat + sizeDeg);
    const rect = Rectangle.fromDegrees(lon - sizeDeg * 1.4, south, lon + sizeDeg * 1.4, north);
    const geometry = new RectangleGeometry({ rectangle: rect, height: 0, granularity: CMath.toRadians(sizeDeg / 48), vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT });
    this.primitive = this.viewer.scene.primitives.add(new Primitive({
      geometryInstances: new GeometryInstance({ geometry, id: 'terra-ocean' }),
      appearance: new EllipsoidSurfaceAppearance({ material: this.material, aboveGround: false, translucent: true }),
      asynchronous: true,
      allowPicking: false,
    }));
    this.centre = { lat, lon, sizeDeg };
  }

  destroy(): void {
    this.remove();
    if (this.primitive) this.viewer.scene.primitives.remove(this.primitive);
  }
}

export const OCEAN_LEVEL_POSITION = (lat: number, lon: number): Cartesian3 => Cartesian3.fromDegrees(lon, lat, 0);
