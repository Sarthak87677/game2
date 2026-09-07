import { describe, expect, it } from 'vitest';
import { runBenchmark } from '@/perf/benchmark';
import type { StreamingMonitor, StreamingSnapshot } from '@/engine/streaming';

const snap = (over: Partial<StreamingSnapshot>): StreamingSnapshot => ({
  queuedTiles: 0, terrainTilesLoaded: 10, terrainTileErrors: 0, terrainBytes: 0, imageryTilesRendered: 0, activeRequests: 0, fps: 30, frameMs: 33, tilesLoaded: true, jsHeapMb: 100, lastTerrainMs: 0,
  avgFps: 30, onePercentLowFps: 20, p99Ms: 50, frames: 300, tilesLoadedOnce: true, globeTilesRendered: 40, primitives: 12, drawCommands: 200, actors: 7, vramNote: 'not exposed by WebGL', ...over,
});

describe('runBenchmark', () => {
  it('collects every frame during the run and summarises heap, draw commands and tiles', async () => {
    let listener: ((dt: number, now: number) => void) | null = null;
    let removed = false;
    const monitor = { addFrameListener: (fn: (dt: number, now: number) => void) => { listener = fn; return () => { removed = true; }; } } as unknown as StreamingMonitor;
    let clock = 0;
    let heap = 100;
    const sleep = async (ms: number) => { clock += ms; heap += 5; for (let i = 0; i < 5; i++) listener?.(ms / 5, clock); };
    const result = await runBenchmark({
      monitor,
      snapshot: () => snap({ jsHeapMb: heap, drawCommands: 100 + heap }),
      spot: () => ({ lat: 18.9, lon: 72.8, heightM: 300, mode: 'orbit' }),
      preset: () => 'low',
      adaptive: () => ({ enabled: true, step: 2, maxStep: 10, stepLabel: 'Ocean reflections off', resolutionScale: 0.75, reason: 'x', fps: 30, minFps: 30, targetFps: 60 }),
      hardware: () => null,
      viewport: () => ({ width: 1280, height: 720, resolutionScale: 0.75 }),
      sleep,
      now: () => clock,
    }, 1);
    expect(removed).toBe(true);
    expect(result.kind).toBe('terra-benchmark');
    expect(result.frames.frames).toBe(20);
    expect(result.frames.frameMs).toBeCloseTo(50, 6);
    expect(result.frames.avgFps).toBeCloseTo(20, 6);
    expect(result.frames.minFps).toBeCloseTo(20, 6);
    expect(result.heapMb.start).toBe(100);
    expect(result.heapMb.end).toBe(120);
    expect(result.heapMb.peak).toBe(120);
    expect(result.drawCommands.max).toBe(220);
    expect(result.drawCommands.avg).toBe(Math.round((205 + 210 + 215 + 220) / 4));
    expect(result.tiles.globeRendered).toBe(40);
    expect(result.adaptive?.step).toBe(2);
    expect(result.note).toMatch(/VRAM not exposed/);
    expect(JSON.parse(JSON.stringify(result)).spot.lat).toBe(18.9);
  });
});
