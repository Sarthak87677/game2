import { Cartesian3, Cartographic, EasingFunction, Ellipsoid, Math as CMath, sampleTerrain, type Viewer } from 'cesium';

export interface CameraTarget { lat: number; lon: number; heightM: number; headingDeg?: number; pitchDeg?: number }

/**
 * Terrain height at a point, sampled from the active terrain provider (level 12 ≈ 40 m spacing) with the loaded
 * globe tiles as a fast path. Returns 0 when the provider cannot answer (e.g. offline ellipsoid terrain).
 */
export async function terrainHeightAt(viewer: Viewer, lat: number, lon: number): Promise<number> {
  const carto = Cartographic.fromDegrees(lon, lat);
  const loaded = viewer.scene.globe.getHeight(carto);
  if (loaded !== undefined) return loaded;
  try {
    const [s] = await sampleTerrain(viewer.terrainProvider, 12, [carto]);
    return s?.height ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolves a target whose heightM is ABOVE GROUND (for targets below 50 km) into an ellipsoid height by sampling the
 * terrain, so bookmarks and search results never end up underground or clamped by collision detection.
 */
export async function resolveTargetHeight(viewer: Viewer, t: CameraTarget): Promise<CameraTarget> {
  if (t.heightM >= 50_000) return t;
  const ground = await terrainHeightAt(viewer, t.lat, t.lon);
  return { ...t, heightM: Math.max(ground, 0) + t.heightM };
}

export interface CameraState {
  lat: number; lon: number; heightM: number; headingDeg: number; pitchDeg: number; rollDeg: number;
  /** Terrain height under the camera if loaded, else null. */
  groundM: number | null;
  altitudeAglM: number | null;
}

export function cameraState(viewer: Viewer): CameraState {
  const c = viewer.camera.positionCartographic;
  const lat = CMath.toDegrees(c.latitude);
  const lon = CMath.toDegrees(c.longitude);
  const ground = viewer.scene.globe.getHeight(new Cartographic(c.longitude, c.latitude));
  return {
    lat, lon, heightM: c.height,
    headingDeg: CMath.toDegrees(viewer.camera.heading), pitchDeg: CMath.toDegrees(viewer.camera.pitch), rollDeg: CMath.toDegrees(viewer.camera.roll),
    groundM: ground ?? null, altitudeAglM: ground === undefined ? null : c.height - ground,
  };
}

/** Flies to a target; long hops arc through altitude automatically thanks to Cesium's flight path. */
export function flyTo(viewer: Viewer, t: CameraTarget, durationS?: number): Promise<boolean> {
  const from = viewer.camera.positionCartographic;
  const dist = Cartesian3.distance(viewer.camera.position, Cartesian3.fromDegrees(t.lon, t.lat, t.heightM));
  const duration = durationS ?? Math.min(9, Math.max(1.5, dist / 2_500_000 + (from.height > 2_000_000 ? 1 : 0)));
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(t.lon, t.lat, t.heightM),
      orientation: { heading: CMath.toRadians(t.headingDeg ?? 0), pitch: CMath.toRadians(t.pitchDeg ?? -45), roll: 0 },
      duration,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      complete: () => resolve(true),
      cancel: () => resolve(false),
    });
  });
}

/** Two-stage descent from orbit: first to a regional overview, then to the target — smooth space→ground travel. */
export async function descendTo(viewer: Viewer, t: CameraTarget): Promise<boolean> {
  const h = viewer.camera.positionCartographic.height;
  if (h > 3_000_000 && t.heightM < 200_000) {
    const ok = await flyTo(viewer, { lat: t.lat, lon: t.lon, heightM: 400_000, headingDeg: t.headingDeg ?? 0, pitchDeg: -80 }, 4.5);
    if (!ok) return false;
  }
  return flyTo(viewer, t, undefined);
}

export function setView(viewer: Viewer, t: CameraTarget): void {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(t.lon, t.lat, t.heightM),
    orientation: { heading: CMath.toRadians(t.headingDeg ?? 0), pitch: CMath.toRadians(t.pitchDeg ?? -45), roll: 0 },
  });
}

/** Height above ground of a lat/lon from loaded terrain tiles (null when not yet streamed). */
export function groundHeight(viewer: Viewer, lat: number, lon: number): number | null {
  const h = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat));
  return h === undefined ? null : h;
}

export const WGS84 = Ellipsoid.WGS84;
