import type { StreamingMonitor, StreamingSnapshot } from '@/engine/streaming';
import { frameStatsOf, type FrameStats } from '@/perf/frameStats';
import type { HardwareInfo } from '@/perf/hardware';
import type { AdaptiveReadout } from '@/perf/adaptive';

export interface BenchmarkResult {
  kind: 'terra-benchmark';
  version: 1;
  startedAt: string;
  durationS: number;
  spot: { lat: number; lon: number; heightM: number; mode: string; label?: string };
  preset: string;
  adaptive: Pick<AdaptiveReadout, 'step' | 'stepLabel' | 'resolutionScale' | 'enabled'> | null;
  hardware: Pick<HardwareInfo, 'gpuRenderer' | 'graphicsApi' | 'cpuCores' | 'deviceMemoryGb' | 'softwareRenderer' | 'vram'> | null;
  /** Statistics over every frame rendered during the run. */
  frames: FrameStats & { minFps: number; maxFrameMs: number };
  heapMb: { start: number | null; end: number | null; peak: number | null };
  tiles: { globeRendered: number | null; terrainLoaded: number; queuedAtEnd: number };
  drawCommands: { avg: number | null; max: number | null };
  primitives: number;
  actors: number;
  viewport: { width: number; height: number; resolutionScale: number };
  note: string;
}

export interface BenchmarkDeps {
  monitor: StreamingMonitor;
  snapshot: () => StreamingSnapshot;
  spot: () => BenchmarkResult['spot'];
  preset: () => string;
  adaptive: () => AdaptiveReadout | null;
  hardware: () => HardwareInfo | null;
  viewport: () => BenchmarkResult['viewport'];
  onProgress?: (elapsedS: number, fps: number) => void;
  /** Injectable scheduler (tests). */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * In-app benchmark: records every frame for `durationS` seconds at the current spot without moving the camera, then
 * summarises frame statistics, heap, tiles, draw commands and actors. The caller appends the JSON line to the log.
 */
export async function runBenchmark(deps: BenchmarkDeps, durationS = 20): Promise<BenchmarkResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => performance.now());
  const frames: number[] = [];
  const remove = deps.monitor.addFrameListener((dt) => { frames.push(dt); });
  const first = deps.snapshot();
  const startedAt = new Date().toISOString();
  const t0 = now();
  let peakHeap = first.jsHeapMb;
  let drawSum = 0, drawN = 0, drawMax: number | null = null;
  let last = first;
  try {
    while (now() - t0 < durationS * 1000) {
      await sleep(250);
      last = deps.snapshot();
      if (last.jsHeapMb !== null) peakHeap = Math.max(peakHeap ?? 0, last.jsHeapMb);
      if (last.drawCommands !== null) { drawSum += last.drawCommands; drawN++; drawMax = Math.max(drawMax ?? 0, last.drawCommands); }
      deps.onProgress?.((now() - t0) / 1000, last.fps);
    }
  } finally {
    remove();
  }
  const fs = frameStatsOf(frames);
  const maxFrameMs = frames.length ? Math.max(...frames) : 0;
  const hw = deps.hardware();
  const ad = deps.adaptive();
  return {
    kind: 'terra-benchmark',
    version: 1,
    startedAt,
    durationS: Number(((now() - t0) / 1000).toFixed(1)),
    spot: deps.spot(),
    preset: deps.preset(),
    adaptive: ad ? { step: ad.step, stepLabel: ad.stepLabel, resolutionScale: ad.resolutionScale, enabled: ad.enabled } : null,
    hardware: hw ? { gpuRenderer: hw.gpuRenderer, graphicsApi: hw.graphicsApi, cpuCores: hw.cpuCores, deviceMemoryGb: hw.deviceMemoryGb, softwareRenderer: hw.softwareRenderer, vram: hw.vram } : null,
    frames: { ...fs, minFps: maxFrameMs > 0 ? 1000 / maxFrameMs : 0, maxFrameMs },
    heapMb: { start: first.jsHeapMb, end: last.jsHeapMb, peak: peakHeap },
    tiles: { globeRendered: last.globeTilesRendered, terrainLoaded: last.terrainTilesLoaded, queuedAtEnd: last.queuedTiles },
    drawCommands: { avg: drawN ? Math.round(drawSum / drawN) : null, max: drawMax },
    primitives: last.primitives,
    actors: last.actors,
    viewport: deps.viewport(),
    note: hw?.softwareRenderer ? 'software renderer (SwiftShader/llvmpipe): numbers describe CPU rasterisation, not a GPU' : 'in-app benchmark; VRAM not exposed by WebGL',
  };
}
