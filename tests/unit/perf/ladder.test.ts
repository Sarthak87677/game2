import { describe, expect, it } from 'vitest';
import { degradationLadder, QUALITY_PRESETS, QUALITY_PRESET_IDS, resolveQuality, isQualityPresetId } from '@/engine/quality';
import { AdaptiveController } from '@/perf/adaptive';

describe('quality presets', () => {
  it('defines the five presets with the contract targets', () => {
    expect(QUALITY_PRESET_IDS).toEqual(['performance', 'low', 'medium', 'high', 'ultra']);
    const t = (id: keyof typeof QUALITY_PRESETS) => [QUALITY_PRESETS[id].targetFps, QUALITY_PRESETS[id].minFps];
    expect(t('performance')).toEqual([60, 45]);
    expect(t('low')).toEqual([60, 30]);
    expect(t('medium')).toEqual([60, 30]);
    expect(t('high')).toEqual([60, 30]);
    expect(t('ultra')).toEqual([30, 24]);
    const p = QUALITY_PRESETS.performance;
    expect(p.resolutionScale).toBe(0.7);
    expect(p.shadows).toBe(false);
    expect(p.ambientOcclusion).toBe(false);
    expect(p.bloom).toBe(false);
    expect(p.vegetationDensity).toBe(0.25);
    expect(p.nearFieldRadiusM).toBe(250);
    expect(p.trafficDensity).toBe(0.4);
    expect(p.clouds).toBe(false);
    expect(isQualityPresetId('performance')).toBe(true);
    expect(isQualityPresetId('turbo')).toBe(false);
  });
});

describe('degradation ladder', () => {
  it('is ordered as the contract requires and ends with five resolution rungs', () => {
    expect(degradationLadder.map((s) => s.id)).toEqual(['shadow-distance', 'ocean-reflections', 'vegetation-density', 'traffic-density', 'near-field-radius', 'resolution-0.9', 'resolution-0.8', 'resolution-0.7', 'resolution-0.6', 'resolution-0.5']);
  });
  it('applies rungs cumulatively and reversibly', () => {
    const preset = QUALITY_PRESETS.high;
    const s0 = resolveQuality(preset, 0);
    expect(s0).toEqual(preset);
    const s1 = resolveQuality(preset, 1);
    expect(s1.shadowDistanceM).toBe(1000);
    expect(s1.oceanReflections).toBe(true);
    const s2 = resolveQuality(preset, 2);
    expect(s2.oceanReflections).toBe(false);
    const s3 = resolveQuality(preset, 3);
    expect(s3.vegetationDensity).toBe(0.5);
    const s4 = resolveQuality(preset, 4);
    expect(s4.trafficDensity).toBe(0.5);
    const s5 = resolveQuality(preset, 5);
    expect(s5.nearFieldRadiusM).toBe(480);
    expect(s5.resolutionScale).toBe(1);
    const s6 = resolveQuality(preset, 6);
    expect(s6.resolutionScale).toBe(0.9);
    expect(resolveQuality(preset, 10).resolutionScale).toBe(0.5);
    expect(resolveQuality(preset, 99).resolutionScale).toBe(0.5);
    // Going back up restores exactly the earlier state.
    expect(resolveQuality(preset, 2)).toEqual(s2);
    expect(resolveQuality(preset, -4)).toEqual(preset);
  });
  it('scales resolution relative to the preset (performance mode 0.7 → 0.35 at the bottom)', () => {
    expect(resolveQuality(QUALITY_PRESETS.performance, 10).resolutionScale).toBe(0.35);
    expect(resolveQuality(QUALITY_PRESETS.low, 6).resolutionScale).toBe(0.675);
  });
  it('never touches settings that describe nearby building or player quality', () => {
    const preset = QUALITY_PRESETS.ultra;
    const bottom = resolveQuality(preset, degradationLadder.length);
    expect(bottom.shadows).toBe(preset.shadows);
    expect(bottom.msaaSamples).toBe(preset.msaaSamples);
    expect(bottom.fxaa).toBe(preset.fxaa);
    expect(bottom.hdr).toBe(preset.hdr);
    expect(bottom.bloom).toBe(preset.bloom);
    expect(bottom.ambientOcclusion).toBe(preset.ambientOcclusion);
    expect(bottom.groundDetail).toBe(preset.groundDetail);
    expect(bottom.tileCacheSize).toBe(preset.tileCacheSize);
    expect(bottom.nearFieldRadiusM).toBeGreaterThanOrEqual(150);
    expect(bottom.targetFps).toBe(preset.targetFps);
    expect(bottom.minFps).toBe(preset.minFps);
  });
});

describe('AdaptiveController', () => {
  const ctl = () => new AdaptiveController({ minFps: 30, targetFps: 60 });
  it('steps down one rung after 2 s below minFps, not before', () => {
    const c = ctl();
    expect(c.update(20, 0).changed).toBe(false);
    expect(c.update(20, 1999).changed).toBe(false);
    const d = c.update(20, 2000);
    expect(d.changed).toBe(true);
    expect(d.step).toBe(1);
    expect(d.reason).toMatch(/20 fps < 30 for 2 s → Shorter shadow distance/);
  });
  it('restarts the timer after each move so one bad stretch drops one rung per 2 s', () => {
    const c = ctl();
    c.update(10, 0);
    c.update(10, 2000);
    expect(c.step).toBe(1);
    expect(c.update(10, 3000).changed).toBe(false);
    expect(c.update(10, 4000).step).toBe(2);
    expect(c.update(10, 6000).step).toBe(3);
  });
  it('a recovery sample before 2 s resets the degrade timer', () => {
    const c = ctl();
    c.update(10, 0);
    c.update(40, 1500);
    expect(c.update(10, 3000).changed).toBe(false);
    expect(c.update(10, 4999).changed).toBe(false);
    expect(c.update(10, 5000).changed).toBe(true);
  });
  it('steps back up after 6 s above targetFps + 8 and stops at 0', () => {
    const c = ctl();
    c.update(10, 0); c.update(10, 2000); c.update(10, 4000);
    expect(c.step).toBe(2);
    expect(c.update(65, 5000).changed).toBe(false); // 65 is not > 68
    expect(c.update(70, 6000).changed).toBe(false);
    expect(c.update(70, 11_999).changed).toBe(false);
    const d = c.update(70, 12_000);
    expect(d.changed).toBe(true);
    expect(d.step).toBe(1);
    expect(d.reason).toMatch(/restored Ocean reflections off/);
    expect(c.update(70, 18_000).step).toBe(0);
    expect(c.update(70, 24_000).changed).toBe(false);
    expect(c.step).toBe(0);
  });
  it('stops at the last rung and explains what is never degraded', () => {
    const c = new AdaptiveController({ minFps: 30, targetFps: 60, maxStep: 2 });
    c.update(5, 0); c.update(5, 2000); c.update(5, 4000);
    const d = c.update(5, 6000);
    expect(d.step).toBe(2);
    expect(d.changed).toBe(false);
    expect(d.reason).toMatch(/ladder exhausted/);
    expect(c.maxStep).toBe(2);
  });
  it('drops rungs fast when the frame rate is catastrophically low (panic)', () => {
    const c = ctl(); // minFps 30 → panic below 7.5 fps, 600 ms delay
    expect(c.update(2, 0).changed).toBe(false);
    expect(c.update(2, 599).changed).toBe(false);
    expect(c.update(2, 600).step).toBe(1);   // 600 ms, not 2 s
    expect(c.update(2, 1200).step).toBe(2);
    // A merely-low (not panic) frame rate still waits the full 2 s.
    const d = ctl();
    d.update(10, 0);
    expect(d.update(10, 600).changed).toBe(false);
    expect(d.update(10, 2000).step).toBe(1);
  });

  it('exposes whether the ladder is exhausted', () => {
    const c = new AdaptiveController({ minFps: 30, targetFps: 60, maxStep: 1 });
    expect(c.exhausted).toBe(false);
    c.update(2, 0); c.update(2, 600);
    expect(c.step).toBe(1);
    expect(c.exhausted).toBe(true);
  });

  it('a minFps of 0 never degrades and reset clears state', () => {
    const c = new AdaptiveController({ minFps: 0, targetFps: 60 });
    c.update(0.5, 0);
    expect(c.update(0.5, 5000).step).toBe(0);
    const d = ctl();
    d.update(5, 0); d.update(5, 2000);
    d.reset();
    expect(d.step).toBe(0);
    expect(d.reason).toBe('reset');
  });
});
