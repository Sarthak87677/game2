import type { Viewer } from 'cesium';
import { ShadowMode } from 'cesium';

export type QualityPresetId = 'performance' | 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  resolutionScale: number;
  msaaSamples: number;
  fxaa: boolean;
  shadows: boolean;
  shadowMapSize: number;
  softShadows: boolean;
  shadowDistanceM: number;
  fog: boolean;
  ambientOcclusion: boolean;
  bloom: boolean;
  hdr: boolean;
  maximumScreenSpaceError: number;
  tileCacheSize: number;
  /** 0..1 multiplier on procedural vegetation instance counts. */
  vegetationDensity: number;
  /** Radius (m) around the camera in which full near-field detail is generated. */
  nearFieldRadiusM: number;
  groundDetail: boolean;
  clouds: boolean;
  precipitationParticles: number;
  /** 0..1 multiplier on simulated traffic vehicle counts. */
  trafficDensity: number;
  /** Animated, reflective ocean surface (off = plain sea colour from the imagery). */
  oceanReflections: boolean;
  /**
   * Atmospheric scattering on the globe surface. A per-pixel cost on every terrain fragment, so it is the first
   * thing a weak GPU should lose: the sky keeps its own atmosphere either way.
   */
  groundAtmosphere: boolean;
  /**
   * Preload sibling and ancestor terrain tiles. Smoother panning on a capable machine, but extra tile requests,
   * geometry and memory that a weak GPU cannot afford.
   */
  preloadTiles: boolean;
  /** Frame rate the preset aims for; the adaptive ladder steps back up when this (+8) is sustained. */
  targetFps: number;
  /** Frame rate below which the adaptive ladder degrades (and the boot gate refuses "ready"). */
  minFps: number;
}

const base = {
  fog: true,
  groundDetail: true,
};

export const QUALITY_PRESETS: Record<QualityPresetId, QualitySettings> = {
  /**
   * "60-FPS Performance Mode": tuned for the weakest current laptop iGPUs (2-compute-unit parts such as the
   * AMD Radeon 820M or Intel UHD). Everything that costs fill rate is off — no post-processing pass at all, no
   * ground atmosphere, no tile preloading, coarse terrain, a short near field and thin vegetation.
   */
  performance: { ...base, resolutionScale: 0.6, msaaSamples: 1, fxaa: false, shadows: false, shadowMapSize: 1024, softShadows: false, shadowDistanceM: 0, ambientOcclusion: false, bloom: false, hdr: false, maximumScreenSpaceError: 6, tileCacheSize: 100, vegetationDensity: 0.15, nearFieldRadiusM: 180, clouds: false, precipitationParticles: 120, trafficDensity: 0.25, oceanReflections: false, groundAtmosphere: false, preloadTiles: false, targetFps: 60, minFps: 45 },
  low: { ...base, resolutionScale: 0.75, msaaSamples: 1, fxaa: true, shadows: false, shadowMapSize: 1024, softShadows: false, shadowDistanceM: 2000, ambientOcclusion: false, bloom: false, hdr: false, maximumScreenSpaceError: 4, tileCacheSize: 100, vegetationDensity: 0.3, nearFieldRadiusM: 300, clouds: false, precipitationParticles: 300, trafficDensity: 0.6, oceanReflections: true, groundAtmosphere: true, preloadTiles: false, targetFps: 60, minFps: 30 },
  medium: { ...base, resolutionScale: 1, msaaSamples: 1, fxaa: true, shadows: true, shadowMapSize: 2048, softShadows: false, shadowDistanceM: 4000, ambientOcclusion: false, bloom: false, hdr: true, maximumScreenSpaceError: 2.5, tileCacheSize: 200, vegetationDensity: 0.6, nearFieldRadiusM: 500, clouds: true, precipitationParticles: 800, trafficDensity: 0.8, oceanReflections: true, groundAtmosphere: true, preloadTiles: true, targetFps: 60, minFps: 30 },
  high: { ...base, resolutionScale: 1, msaaSamples: 4, fxaa: true, shadows: true, shadowMapSize: 4096, softShadows: true, shadowDistanceM: 8000, ambientOcclusion: true, bloom: false, hdr: true, maximumScreenSpaceError: 2, tileCacheSize: 400, vegetationDensity: 1, nearFieldRadiusM: 800, clouds: true, precipitationParticles: 1500, trafficDensity: 1, oceanReflections: true, groundAtmosphere: true, preloadTiles: true, targetFps: 60, minFps: 30 },
  ultra: { ...base, resolutionScale: 1, msaaSamples: 8, fxaa: true, shadows: true, shadowMapSize: 8192, softShadows: true, shadowDistanceM: 15000, ambientOcclusion: true, bloom: true, hdr: true, maximumScreenSpaceError: 1.5, tileCacheSize: 800, vegetationDensity: 1, nearFieldRadiusM: 1200, clouds: true, precipitationParticles: 3000, trafficDensity: 1, oceanReflections: true, groundAtmosphere: true, preloadTiles: true, targetFps: 30, minFps: 24 },
};

export const QUALITY_PRESET_IDS: QualityPresetId[] = ['performance', 'low', 'medium', 'high', 'ultra'];

export function isQualityPresetId(id: unknown): id is QualityPresetId {
  return typeof id === 'string' && id in QUALITY_PRESETS;
}

/**
 * One reversible step of the degradation ladder. Steps are pure transforms of the preset's settings (they also see
 * the untouched preset), so the ladder is undone simply by applying fewer steps. None of them touches nearby
 * building geometry or the player/vehicle models — those are never degraded.
 */
export interface DegradationStep {
  id: string;
  label: string;
  apply: (q: QualitySettings, preset: QualitySettings) => QualitySettings;
}

const RESOLUTION_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

/**
 * Ordered, reversible degradation ladder applied by `AdaptiveQuality` when the frame rate stays below the preset's
 * `minFps` for 2 s and undone (one step per 6 s of FPS > targetFps + 8). Order: distant shadow distance → ocean
 * reflections → vegetation density → traffic density → near-field radius/draw distance → dynamic resolution scale
 * (0.9 → 0.5 in 0.1 steps of the preset's own resolution scale).
 */
export const degradationLadder: readonly DegradationStep[] = [
  { id: 'shadow-distance', label: 'Shorter shadow distance', apply: (q) => ({ ...q, shadowDistanceM: Math.min(q.shadowDistanceM, 1000), softShadows: false }) },
  { id: 'ocean-reflections', label: 'Ocean reflections off', apply: (q) => ({ ...q, oceanReflections: false }) },
  { id: 'vegetation-density', label: 'Vegetation density halved', apply: (q) => ({ ...q, vegetationDensity: q.vegetationDensity * 0.5 }) },
  { id: 'traffic-density', label: 'Traffic density halved', apply: (q) => ({ ...q, trafficDensity: q.trafficDensity * 0.5 }) },
  { id: 'near-field-radius', label: 'Shorter draw distance', apply: (q) => ({ ...q, nearFieldRadiusM: Math.max(150, Math.round(q.nearFieldRadiusM * 0.6)), maximumScreenSpaceError: Math.max(q.maximumScreenSpaceError, 4) }) },
  ...RESOLUTION_STEPS.map((scale): DegradationStep => ({ id: `resolution-${scale.toFixed(1)}`, label: `Dynamic resolution ${Math.round(scale * 100)} %`, apply: (q, preset) => ({ ...q, resolutionScale: Number((preset.resolutionScale * scale).toFixed(3)) }) })),
];

/** Settings of a preset with the first `step` ladder rungs applied (0 = untouched preset). */
export function resolveQuality(preset: QualitySettings, step: number): QualitySettings {
  const n = Math.max(0, Math.min(degradationLadder.length, Math.floor(step)));
  let q: QualitySettings = { ...preset };
  for (let i = 0; i < n; i++) q = degradationLadder[i].apply(q, preset);
  return q;
}

/** Applies renderer-level settings of a preset to a Cesium viewer. Scene-object systems read the preset themselves. */
export function applyQuality(viewer: Viewer, q: QualitySettings): void {
  const scene = viewer.scene;
  viewer.resolutionScale = q.resolutionScale;
  scene.msaaSamples = q.msaaSamples;
  scene.postProcessStages.fxaa.enabled = q.fxaa;
  viewer.shadows = q.shadows;
  viewer.terrainShadows = q.shadows ? ShadowMode.ENABLED : ShadowMode.DISABLED;
  scene.shadowMap.size = q.shadowMapSize;
  scene.shadowMap.softShadows = q.softShadows;
  scene.shadowMap.maximumDistance = Math.max(1, q.shadowDistanceM);
  scene.shadowMap.darkness = 0.35;
  scene.fog.enabled = q.fog;
  scene.postProcessStages.ambientOcclusion.enabled = q.ambientOcclusion;
  scene.postProcessStages.bloom.enabled = q.bloom;
  scene.highDynamicRange = q.hdr;
  scene.globe.maximumScreenSpaceError = q.maximumScreenSpaceError;
  scene.globe.tileCacheSize = q.tileCacheSize;
  scene.globe.showGroundAtmosphere = q.groundAtmosphere;
  scene.globe.preloadSiblings = q.preloadTiles;
  scene.globe.preloadAncestors = q.preloadTiles;
}

/** Device hints the starting-preset heuristic reads (all optional; falls back to `navigator`). */
export interface DeviceHints { gpuRenderer?: string; softwareRenderer?: boolean; cpuCores?: number | null; deviceMemoryGb?: number | null }

/**
 * Integrated / low-power GPU families that should start on a light preset (the ladder never raises quality above the
 * starting preset, so this is the ceiling). Matches Intel HD/UHD/Iris and integrated Arc, AMD APU graphics (Vega n,
 * Radeon nnnM, bare "Radeon Graphics") and the mobile families — but not discrete Radeon RX / GeForce / Arc Annn.
 */
const INTEGRATED_GPU = new RegExp(
  [
    'intel.*(hd|uhd|iris)',
    '(^|[^a-z])hd graphics',
    'arc\\(tm\\) graphics', // integrated Arc (Meteor/Lunar Lake); discrete Arc is "Arc(TM) A770 Graphics"
    'radeon.{0,6}\\d{3}m([^a-z0-9]|$)', // Radeon 610M/660M/680M/760M/780M/820M/840M/860M APU graphics
    'radeon.{0,6}vega\\s*\\d+', // Ryzen APU "Radeon Vega 8 Graphics"
    'radeon.{0,6}graphics([^a-z0-9]|$)(?!.*rx)', // bare "AMD Radeon(TM) Graphics" APU
    'radeon.{0,6}r[2-7]\\s*graphics', // older A-series APUs
    '(^|[^a-z])mali([^a-z]|$)',
    'adreno', 'powervr', 'vivante', 'videocore', 'llvmpipe', 'swiftshader',
  ].join('|'),
  'i',
);

/**
 * The weakest current integrated parts (roughly 2–4 compute units). These cannot hold 30 fps at any preset above
 * Performance, so they start there instead of paying for a demotion cycle on every first run.
 */
const LOW_TIER_GPU = new RegExp(
  [
    'radeon.{0,6}(610m|660m|760m|820m|840m)([^a-z0-9]|$)',
    'intel.*uhd', '(^|[^a-z])uhd graphics', 'intel.*hd graphics [45]\\d\\d',
    'radeon.{0,6}vega\\s*[1-6]([^0-9]|$)',
    '(^|[^a-z])mali-g5', 'adreno.{0,4}[45]\\d\\d',
  ].join('|'),
  'i',
);

/**
 * Picks a starting preset from device hints, biased toward a smooth frame rate rather than maximum fidelity: a
 * software rasteriser or a phone starts in Performance mode, an integrated GPU or a small machine in Low. The
 * adaptive ladder and preset demotion drop it further at run time if needed; the user can always raise it. The
 * start preset is the ceiling, so we err on the light side.
 */
export function detectQualityPreset(hints?: DeviceHints): QualityPresetId {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const cores = hints?.cpuCores ?? nav?.hardwareConcurrency ?? 4;
  const mem = hints?.deviceMemoryGb ?? (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory ?? 4;
  const ua = nav?.userAgent ?? '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const renderer = hints?.gpuRenderer ?? '';
  if (hints?.softwareRenderer || mobile || LOW_TIER_GPU.test(renderer)) return 'performance';
  if (INTEGRATED_GPU.test(renderer) || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 6 || mem <= 4) return 'medium';
  return 'high';
}
