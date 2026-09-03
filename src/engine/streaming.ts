import { RequestScheduler, type Viewer } from 'cesium';

export interface StreamingSnapshot {
  queuedTiles: number;
  terrainTilesLoaded: number;
  terrainTileErrors: number;
  terrainBytes: number;
  imageryTilesRendered: number;
  activeRequests: number;
  fps: number;
  frameMs: number;
  tilesLoaded: boolean;
  jsHeapMb: number | null;
  lastTerrainMs: number;
}

/** Tracks tile-streaming and frame statistics for the HUD/diagnostics. */
export class StreamingMonitor {
  private queued = 0;
  private terrainLoaded = 0;
  private terrainErrors = 0;
  private terrainBytes = 0;
  private lastTerrainMs = 0;
  private frames = 0;
  private frameAccum = 0;
  private lastFrame = performance.now();
  private fps = 0;
  private frameMs = 0;
  private lastFpsTime = performance.now();
  private remove: (() => void)[] = [];
  imageryTilesRendered = () => 0;

  constructor(private viewer: Viewer) {
    this.remove.push(viewer.scene.globe.tileLoadProgressEvent.addEventListener((n: number) => { this.queued = n; }));
    this.remove.push(viewer.scene.postRender.addEventListener(() => this.onFrame()));
  }

  onTerrainTile(ev: { bytes: number; ms: number; error?: string }): void {
    if (ev.error) this.terrainErrors++;
    else { this.terrainLoaded++; this.terrainBytes += ev.bytes; this.lastTerrainMs = ev.ms; }
  }

  private onFrame(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.frames++;
    this.frameAccum += dt;
    if (now - this.lastFpsTime >= 500) {
      this.fps = (this.frames * 1000) / (now - this.lastFpsTime);
      this.frameMs = this.frameAccum / Math.max(1, this.frames);
      this.frames = 0;
      this.frameAccum = 0;
      this.lastFpsTime = now;
    }
  }

  snapshot(): StreamingSnapshot {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      queuedTiles: this.queued,
      terrainTilesLoaded: this.terrainLoaded,
      terrainTileErrors: this.terrainErrors,
      terrainBytes: this.terrainBytes,
      imageryTilesRendered: this.imageryTilesRendered(),
      activeRequests: (RequestScheduler as unknown as { statistics: { numberOfActiveRequests: number } }).statistics.numberOfActiveRequests,
      fps: this.fps,
      frameMs: this.frameMs,
      tilesLoaded: this.viewer.scene.globe.tilesLoaded,
      jsHeapMb: perf.memory ? perf.memory.usedJSHeapSize / 1048576 : null,
      lastTerrainMs: this.lastTerrainMs,
    };
  }

  destroy(): void {
    for (const r of this.remove) r();
    this.remove = [];
  }
}
