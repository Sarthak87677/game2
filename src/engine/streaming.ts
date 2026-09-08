import { PrimitiveCollection, RequestScheduler, type Viewer } from 'cesium';
import { EMPTY_FRAME_STATS, FrameWindow, type FrameStats } from '@/perf/frameStats';

export interface StreamingSnapshot {
  queuedTiles: number;
  terrainTilesLoaded: number;
  terrainTileErrors: number;
  terrainBytes: number;
  imageryTilesRendered: number;
  activeRequests: number;
  /** Current FPS (frames in the last second of the rolling window). */
  fps: number;
  /** Mean frame time (ms) over the rolling 10 s window. */
  frameMs: number;
  tilesLoaded: boolean;
  jsHeapMb: number | null;
  lastTerrainMs: number;
  // --- added by the performance contract (all optional for older readers) ---
  /** Average FPS over the rolling 10 s window. */
  avgFps: number;
  /** 1 % low FPS = 1000 / p99 frame time. */
  onePercentLowFps: number;
  /** 99th-percentile frame time (ms) over the window. */
  p99Ms: number;
  /** Frames in the window. */
  frames: number;
  /** True once `globe.tilesLoaded` has been observed true after a render. */
  tilesLoadedOnce: boolean;
  /** Globe surface tiles rendered this frame (`globe._surface._tilesToRender.length`, guarded). */
  globeTilesRendered: number | null;
  /** Primitives in `scene.primitives` (nested PrimitiveCollections counted recursively). */
  primitives: number;
  /** Draw commands in the last frame (`frameState.commandList.length` read in postRender, guarded). */
  drawCommands: number | null;
  /** Simulated actors (gameplay `stats()` counts plus ambient traffic). */
  actors: number;
  /** VRAM is not exposed by WebGL; kept here so every report says so explicitly. */
  vramNote: string;
}

const VRAM_NOTE = 'not exposed by WebGL';
const ACTOR_KEY = /actor|vehicle|pedestrian|passenger|train|aircraft|plane|boat|ship|ferry|crowd|npc|bird|animal|walker|people|count/i;

/** Tracks tile-streaming and frame statistics for the HUD/diagnostics. */
export class StreamingMonitor {
  private queued = 0;
  private terrainLoaded = 0;
  private terrainErrors = 0;
  private terrainBytes = 0;
  private lastTerrainMs = 0;
  private lastFrame = performance.now();
  private readonly window = new FrameWindow(4096, 10_000);
  private stats: FrameStats = EMPTY_FRAME_STATS;
  private statsAt = 0;
  private tilesLoadedOnce = false;
  private drawCommands: number | null = null;
  private globeTiles: number | null = null;
  private frameListeners: ((frameMs: number, nowMs: number) => void)[] = [];
  private remove: (() => void)[] = [];
  imageryTilesRendered = () => 0;
  /** Optional supplier of gameplay `stats()` maps (host + systems) for the actor count. */
  gameplayStats: (() => Record<string, string | number>) | null = null;
  /** Optional extra actor count (ambient traffic vehicles, crowds outside the gameplay host…). */
  extraActors: (() => number) | null = null;

  constructor(private viewer: Viewer) {
    this.remove.push(viewer.scene.globe.tileLoadProgressEvent.addEventListener((n: number) => { this.queued = n; }));
    this.remove.push(viewer.scene.postRender.addEventListener(() => this.onFrame()));
  }

  onTerrainTile(ev: { bytes: number; ms: number; error?: string }): void {
    if (ev.error) this.terrainErrors++;
    else { this.terrainLoaded++; this.terrainBytes += ev.bytes; this.lastTerrainMs = ev.ms; }
  }

  /** Receives every frame time (benchmarks, adaptive quality). Returns a remover. */
  addFrameListener(fn: (frameMs: number, nowMs: number) => void): () => void {
    this.frameListeners.push(fn);
    return () => { this.frameListeners = this.frameListeners.filter((f) => f !== fn); };
  }

  private onFrame(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    // A tab in the background (or a debugger pause) produces one giant "frame"; it is not a rendering cost.
    if (dt > 0 && dt < 10_000) {
      this.window.push(dt, now);
      for (const f of this.frameListeners) f(dt, now);
    }
    const scene = this.viewer.scene;
    try { if (scene.globe.tilesLoaded) this.tilesLoadedOnce = true; } catch { /* globe may be destroyed */ }
    try {
      const fs = (scene as unknown as { frameState?: { commandList?: unknown[] } }).frameState;
      this.drawCommands = fs?.commandList ? fs.commandList.length : null;
    } catch { this.drawCommands = null; }
    try {
      const surface = (scene.globe as unknown as { _surface?: { _tilesToRender?: unknown[] } })._surface;
      this.globeTiles = surface?._tilesToRender ? surface._tilesToRender.length : null;
    } catch { this.globeTiles = null; }
  }

  /** Current frame statistics (recomputed at most every 100 ms). */
  frameStats(nowMs = performance.now()): FrameStats {
    if (nowMs - this.statsAt >= 100) { this.stats = this.window.stats(nowMs); this.statsAt = nowMs; }
    return this.stats;
  }

  /** Current FPS over the last second (cheap accessor for gates and the adaptive ladder). */
  currentFps(nowMs = performance.now()): number { return this.frameStats(nowMs).currentFps; }

  hasTilesLoadedOnce(): boolean { return this.tilesLoadedOnce; }

  /** Primitives in the scene, recursing into nested PrimitiveCollections (point/billboard collections count as one). */
  countPrimitives(): number {
    const count = (c: PrimitiveCollection): number => {
      let n = 0;
      for (let i = 0; i < c.length; i++) {
        const p = c.get(i);
        n += p instanceof PrimitiveCollection ? count(p) : 1;
      }
      return n;
    };
    try { return count(this.viewer.scene.primitives); } catch { return 0; }
  }

  /** Sum of numeric gameplay `stats()` values that look like counts, plus extra actors (traffic). */
  countActors(): number {
    let n = 0;
    try {
      const st = this.gameplayStats?.();
      if (st) for (const [k, v] of Object.entries(st)) if (typeof v === 'number' && Number.isFinite(v) && ACTOR_KEY.test(k)) n += v;
    } catch { /* a broken system must not break the readout */ }
    try { n += this.extraActors?.() ?? 0; } catch { /* ignore */ }
    return Math.round(n);
  }

  snapshot(): StreamingSnapshot {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const now = performance.now();
    const fs = this.frameStats(now);
    let tilesLoaded = false;
    try { tilesLoaded = this.viewer.scene.globe.tilesLoaded; } catch { /* destroyed */ }
    return {
      queuedTiles: this.queued,
      terrainTilesLoaded: this.terrainLoaded,
      terrainTileErrors: this.terrainErrors,
      terrainBytes: this.terrainBytes,
      imageryTilesRendered: this.imageryTilesRendered(),
      activeRequests: (RequestScheduler as unknown as { statistics: { numberOfActiveRequests: number } }).statistics.numberOfActiveRequests,
      fps: fs.currentFps,
      frameMs: fs.frameMs,
      tilesLoaded,
      jsHeapMb: perf.memory ? perf.memory.usedJSHeapSize / 1048576 : null,
      lastTerrainMs: this.lastTerrainMs,
      avgFps: fs.avgFps,
      onePercentLowFps: fs.onePercentLowFps,
      p99Ms: fs.p99Ms,
      frames: fs.frames,
      tilesLoadedOnce: this.tilesLoadedOnce,
      globeTilesRendered: this.globeTiles,
      primitives: this.countPrimitives(),
      drawCommands: this.drawCommands,
      actors: this.countActors(),
      vramNote: VRAM_NOTE,
    };
  }

  destroy(): void {
    for (const r of this.remove) r();
    this.remove = [];
    this.frameListeners = [];
  }
}
