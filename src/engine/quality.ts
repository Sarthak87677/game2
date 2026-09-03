import type { Viewer } from 'cesium';
import { ShadowMode } from 'cesium';

export type QualityPresetId = 'low' | 'medium' | 'high' | 'ultra';

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
}

export const QUALITY_PRESETS: Record<QualityPresetId, QualitySettings> = {
  low: { resolutionScale: 0.75, msaaSamples: 1, fxaa: true, shadows: false, shadowMapSize: 1024, softShadows: false, shadowDistanceM: 2000, fog: true, ambientOcclusion: false, bloom: false, hdr: false, maximumScreenSpaceError: 4, tileCacheSize: 100, vegetationDensity: 0.3, nearFieldRadiusM: 300, groundDetail: true, clouds: false, precipitationParticles: 300 },
  medium: { resolutionScale: 1, msaaSamples: 1, fxaa: true, shadows: true, shadowMapSize: 2048, softShadows: false, shadowDistanceM: 4000, fog: true, ambientOcclusion: false, bloom: false, hdr: true, maximumScreenSpaceError: 2.5, tileCacheSize: 200, vegetationDensity: 0.6, nearFieldRadiusM: 500, groundDetail: true, clouds: true, precipitationParticles: 800 },
  high: { resolutionScale: 1, msaaSamples: 4, fxaa: true, shadows: true, shadowMapSize: 4096, softShadows: true, shadowDistanceM: 8000, fog: true, ambientOcclusion: true, bloom: false, hdr: true, maximumScreenSpaceError: 2, tileCacheSize: 400, vegetationDensity: 1, nearFieldRadiusM: 800, groundDetail: true, clouds: true, precipitationParticles: 1500 },
  ultra: { resolutionScale: 1, msaaSamples: 8, fxaa: true, shadows: true, shadowMapSize: 8192, softShadows: true, shadowDistanceM: 15000, fog: true, ambientOcclusion: true, bloom: true, hdr: true, maximumScreenSpaceError: 1.5, tileCacheSize: 800, vegetationDensity: 1, nearFieldRadiusM: 1200, groundDetail: true, clouds: true, precipitationParticles: 3000 },
};

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
  scene.shadowMap.maximumDistance = q.shadowDistanceM;
  scene.shadowMap.darkness = 0.35;
  scene.fog.enabled = q.fog;
  scene.postProcessStages.ambientOcclusion.enabled = q.ambientOcclusion;
  scene.postProcessStages.bloom.enabled = q.bloom;
  scene.highDynamicRange = q.hdr;
  scene.globe.maximumScreenSpaceError = q.maximumScreenSpaceError;
  scene.globe.tileCacheSize = q.tileCacheSize;
}

/** Picks a starting preset from device hints (never worse than 'low'). */
export function detectQualityPreset(): QualityPresetId {
  if (typeof navigator === 'undefined') return 'medium';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}
