import { describe, expect, it } from 'vitest';
import { effectiveMinFps, parseMinFpsOverride, ReadinessGate, type LayerStatus, type ReadinessInput } from '@/perf/readiness';

const loaded: LayerStatus = { state: 'loaded' };
const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  terrainActive: true,
  terrainDegraded: null,
  tilesLoadedOnce: true,
  imageryPresent: true,
  layers: { naturalEarth: loaded, gazetteer: loaded, climate: loaded },
  fps: 60,
  nowMs: 0,
  ...over,
});

describe('ReadinessGate', () => {
  it('stays in data until FPS has been sustained for 3 s, then becomes ready', () => {
    const g = new ReadinessGate({ minFps: 30 });
    expect(g.update(input({ nowMs: 0 })).phase).toBe('data');
    expect(g.update(input({ nowMs: 1000 })).phase).toBe('data');
    const d = g.update(input({ nowMs: 2999 }));
    expect(d.phase).toBe('data');
    expect(d.message).toMatch(/Warming up \(60 fps\)/);
    expect(d.blocking[0]).toMatch(/Warming up/);
    const r = g.update(input({ nowMs: 3000 }));
    expect(r.phase).toBe('ready');
    expect(r.fpsGatePassed).toBe(true);
    expect(r.blocking).toEqual([]);
  });
  it('resets the sustain timer when a sample dips below minFps', () => {
    const g = new ReadinessGate({ minFps: 30 });
    g.update(input({ nowMs: 0 }));
    g.update(input({ nowMs: 2500, fps: 12 }));
    expect(g.update(input({ nowMs: 3500 })).phase).toBe('data');
    expect(g.update(input({ nowMs: 6499 })).phase).toBe('data');
    expect(g.update(input({ nowMs: 6500 })).phase).toBe('ready');
  });
  it('never reports ready before tiles loaded once, terrain active or imagery present', () => {
    const g = new ReadinessGate({ minFps: 0 });
    expect(g.update(input({ tilesLoadedOnce: false })).blocking).toContain('Streaming globe tiles');
    expect(g.update(input({ terrainActive: false })).blocking).toContain('Terrain provider not active');
    const d = g.update(input({ imageryPresent: false }));
    expect(d.phase).toBe('data');
    expect(d.message).toMatch(/^Streaming…/);
    expect(g.update(input()).phase).toBe('ready');
  });
  it('combines streaming and warm-up in the message', () => {
    const g = new ReadinessGate({ minFps: 30 });
    const d = g.update(input({ tilesLoadedOnce: false, fps: 4.2 }));
    expect(d.message).toBe('Streaming… / Warming up (4.2 fps)');
  });
  it('is an error while a required layer failed, whatever the FPS', () => {
    const g = new ReadinessGate({ minFps: 0 });
    const d = g.update(input({ layers: { naturalEarth: { state: 'failed', reason: 'HTTP 500' }, gazetteer: loaded, climate: loaded } }));
    expect(d.phase).toBe('error');
    expect(d.error).toMatch(/Natural Earth vectors failed: HTTP 500/);
    const d2 = g.update(input({ layers: { naturalEarth: loaded, gazetteer: loaded, climate: { state: 'failed', reason: 'worker crashed' } }, nowMs: 10_000 }));
    expect(d2.phase).toBe('error');
    expect(d2.message).toMatch(/Climate atlas failed/);
  });
  it('allows explicitly degraded layers and lists their reasons', () => {
    const g = new ReadinessGate({ minFps: 0, minFpsNote: 'FPS gate overridden' });
    const d = g.update(input({ layers: { naturalEarth: loaded, gazetteer: { state: 'degraded', reason: 'index missing' }, climate: { state: 'degraded', reason: 'no elevation' } }, terrainDegraded: 'flat ellipsoid' }));
    expect(d.phase).toBe('ready');
    expect(d.degraded).toEqual(['Place index: index missing', 'Climate atlas: no elevation', 'Terrain: flat ellipsoid', 'FPS gate overridden']);
  });
  it('blocks on pending layers', () => {
    const g = new ReadinessGate({ minFps: 0 });
    const d = g.update(input({ layers: { naturalEarth: { state: 'pending' }, gazetteer: loaded, climate: loaded } }));
    expect(d.phase).toBe('data');
    expect(d.blocking).toContain('Natural Earth vectors loading');
    expect(d.message).toBe('Streaming… Natural Earth vectors loading');
    const gated = new ReadinessGate({ minFps: 30 });
    expect(gated.update(input({ layers: { naturalEarth: { state: 'pending' }, gazetteer: loaded, climate: loaded } })).message).toBe('Streaming… / Warming up (60 fps)');
  });
  it('latches the FPS gate once passed so later dips do not revoke readiness', () => {
    const g = new ReadinessGate({ minFps: 30, sustainMs: 1000 });
    g.update(input({ nowMs: 0 }));
    expect(g.update(input({ nowMs: 1000 })).phase).toBe('ready');
    expect(g.update(input({ nowMs: 1500, fps: 3 })).phase).toBe('ready');
  });
  it('minFps 0 disables the FPS gate', () => {
    const g = new ReadinessGate({ minFps: 0 });
    expect(g.update(input({ fps: 0.1 })).phase).toBe('ready');
  });
});

describe('minFps helpers', () => {
  it('parses the URL override', () => {
    expect(parseMinFpsOverride('?terraMinFps=1')).toBe(1);
    expect(parseMinFpsOverride('?terraQuality=low&terraMinFps=0')).toBe(0);
    expect(parseMinFpsOverride('?terraMinFps=abc')).toBeNull();
    expect(parseMinFpsOverride('?terraMinFps=-3')).toBeNull();
    expect(parseMinFpsOverride('')).toBeNull();
  });
  it('override wins, software renderer relaxes with a note, GPUs use the preset', () => {
    expect(effectiveMinFps(30, true, 5)).toEqual({ minFps: 5, note: expect.stringMatching(/overridden to 5/) });
    expect(effectiveMinFps(30, true, null)).toEqual({ minFps: 1, note: expect.stringMatching(/software renderer/) });
    expect(effectiveMinFps(30, false, null)).toEqual({ minFps: 30, note: null });
  });
});
