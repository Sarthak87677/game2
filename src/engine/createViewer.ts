import { Cartesian3, Color, Credit, EllipsoidTerrainProvider, Ion, RequestScheduler, ScreenSpaceEventType, SkyAtmosphere, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export interface CreateViewerOptions {
  container: HTMLElement;
  ionToken?: string;
}

/** Creates the single Cesium viewer with all default widgets disabled (Terra Infinite supplies its own UI). */
export function createViewer(opts: CreateViewerOptions): Viewer {
  // Cesium ion is opt-in: without a token nothing on ion is requested and the default token is blanked so the
  // engine never phones home with the SDK's built-in demo key.
  Ion.defaultAccessToken = opts.ionToken ?? '';
  RequestScheduler.maximumRequestsPerServer = 12;
  RequestScheduler.throttleRequests = true;

  const viewer = new Viewer(opts.container, {
    baseLayer: false,
    terrainProvider: new EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    skyAtmosphere: new SkyAtmosphere(),
    requestRenderMode: false,
    showRenderLoopErrors: false,
    contextOptions: {
      requestWebgl1: false,
      webgl: { failIfMajorPerformanceCaveat: false, powerPreference: 'high-performance', antialias: false, preserveDrawingBuffer: false },
    },
  });
  const scene = viewer.scene;
  scene.globe.baseColor = Color.fromCssColorString('#20344f');
  scene.globe.showGroundAtmosphere = true;
  // Day/night and slope shading are done by the ground material (see groundMaterial.ts); Cesium's own globe lighting
  // only acts beyond 10 000 km and needs vertex normals, so it stays off to avoid double darkening.
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.preloadSiblings = true;
  scene.globe.preloadAncestors = true;
  scene.globe.loadingDescendantLimit = 12;
  scene.fog.enabled = true;
  scene.fog.density = 0.0006;
  scene.fog.screenSpaceErrorFactor = 4;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  scene.sun!.show = true;
  scene.moon!.show = true;
  scene.skyBox!.show = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 1.5;
  scene.screenSpaceCameraController.enableCollisionDetection = true;
  scene.screenSpaceCameraController.inertiaZoom = 0.7;
  // Remove Cesium's double-click entity tracking which fights our own modes.
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.creditDisplay.addStaticCredit(new Credit('Terra Infinite — procedural details are inferred, not surveyed', false));
  viewer.camera.setView({ destination: Cartesian3.fromDegrees(20, 20, 24_000_000) });
  return viewer;
}
