import { useState } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { formatBytes } from '../format';
import { describeHardware } from '@/perf/hardware';

const fps = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(v < 10 ? 1 : 0));
const ms = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} ms`);

export function DiagnosticsPanel() {
  const engine = useEngine();
  const streaming = useTerraStore((s) => s.streaming);
  const diagnostics = useTerraStore((s) => s.diagnostics);
  const flags = useTerraStore((s) => s.dataFlags);
  const camera = useTerraStore((s) => s.camera);
  const hardware = useTerraStore((s) => s.hardware);
  const adaptive = useTerraStore((s) => s.adaptive);
  const readiness = useTerraStore((s) => s.readiness);
  const quality = useTerraStore((s) => s.quality);
  const boot = useTerraStore((s) => s.boot);
  const [bench, setBench] = useState<{ running: boolean; elapsed: number } | null>(null);
  const report = () => {
    const text = JSON.stringify({ hardware, quality, adaptive, readiness, boot, streaming, flags, camera, ua: navigator.userAgent, diagnostics }, null, 2);
    void navigator.clipboard?.writeText(text);
  };
  const runBench = async () => {
    if (!engine || bench?.running) return;
    setBench({ running: true, elapsed: 0 });
    const timer = window.setInterval(() => setBench((b) => (b ? { ...b, elapsed: b.elapsed + 1 } : b)), 1000);
    try { await engine.benchmark(20); } finally { window.clearInterval(timer); setBench({ running: false, elapsed: 20 }); }
  };
  const gameplayStats = engine ? Object.entries(engine.gameplay.stats()) : [];
  return (
    <div className="terra-panel-body">
      <h3>Performance <button className="terra-mini" onClick={() => void runBench()} disabled={!engine || !!bench?.running} title="Runs a 20 s benchmark at the current spot and appends a JSON line to the log">{bench?.running ? `Benchmark… ${bench.elapsed}/20 s` : 'Benchmark (20 s)'}</button></h3>
      {streaming && (
        <div className="terra-grid mono" data-testid="perf-grid">
          <span>FPS (current)</span><span>{fps(streaming.fps)}</span>
          <span>FPS (10 s average)</span><span>{fps(streaming.avgFps)}</span>
          <span>FPS (1 % low)</span><span>{fps(streaming.onePercentLowFps)}</span>
          <span>Frame time</span><span>{ms(streaming.frameMs)} · p99 {ms(streaming.p99Ms)} · {streaming.frames} frames in window</span>
          <span>JS heap</span><span>{streaming.jsHeapMb === null ? 'n/a (Chromium only)' : `${streaming.jsHeapMb.toFixed(0)} MB`}</span>
          <span>VRAM</span><span>{streaming.vramNote}</span>
          <span>Active tiles</span><span>{streaming.globeTilesRendered ?? '—'} globe tiles rendered · {streaming.queuedTiles} queued {streaming.tilesLoaded ? '(all loaded)' : ''}</span>
          <span>Actors</span><span>{streaming.actors} simulated (gameplay systems + ambient traffic)</span>
          <span>Draw calls</span><span>{streaming.drawCommands ?? '—'} commands · {streaming.primitives} primitives</span>
          <span>Adaptive step</span><span data-testid="adaptive-step">{adaptive.step}/{adaptive.maxStep}{adaptive.stepLabel ? ` (${adaptive.stepLabel})` : ''} · resolution ×{adaptive.resolutionScale.toFixed(2)} · {adaptive.enabled ? `min ${adaptive.minFps} / target ${adaptive.targetFps} fps` : 'off'} — {adaptive.reason}</span>
          <span>Preset</span><span>{quality}</span>
          <span>Terrain tiles</span><span>{streaming.terrainTilesLoaded} ok · {streaming.terrainTileErrors} failed · {formatBytes(streaming.terrainBytes)} · last {streaming.lastTerrainMs.toFixed(0)} ms</span>
          <span>Imagery tiles</span><span>{streaming.imageryTilesRendered} rendered (procedural)</span>
          <span>Active requests</span><span>{streaming.activeRequests}</span>
        </div>
      )}
      <h3>Hardware</h3>
      {hardware ? (
        <div className="terra-grid mono" data-testid="hardware-grid">
          <span>CPU</span><span>{hardware.cpuCores ?? '?'} logical cores · {hardware.platform}</span>
          <span>Memory</span><span>{hardware.deviceMemoryGb !== null ? `${hardware.deviceMemoryGb} GB (navigator.deviceMemory, coarse)` : 'not exposed by this browser'}</span>
          <span>GPU</span><span>{hardware.gpuVendor} · {hardware.gpuRenderer}{hardware.softwareRenderer ? ' — SOFTWARE RENDERER (not a GPU)' : ''}</span>
          <span>Graphics API</span><span>{hardware.graphicsApi}</span>
          <span>VRAM</span><span>{hardware.vram}</span>
          <span>Max texture</span><span>{hardware.maxTextureSize ?? '?'} px</span>
          <span>Screen</span><span>{hardware.screen.width}×{hardware.screen.height} @ {hardware.screen.devicePixelRatio}× DPR</span>
        </div>
      ) : <p className="terra-help">Not detected yet.</p>}
      <h3>Readiness</h3>
      <div className="terra-grid">
        <span>Boot</span><span>{boot.phase} — {boot.message}</span>
        <span>FPS gate</span><span>{readiness ? (readiness.fpsGatePassed ? `passed (min ${readiness.minFps} fps sustained 3 s)` : `waiting: ${(readiness.fpsSustainedMs / 1000).toFixed(1)} s of 3 s at ≥ ${readiness.minFps} fps`) : 'not started'}</span>
        <span>Blocking</span><span>{readiness && readiness.blocking.length ? readiness.blocking.join(' · ') : 'nothing'}</span>
        <span>Degraded</span><span>{readiness && readiness.degraded.length ? readiness.degraded.join(' · ') : 'nothing'}</span>
      </div>
      <h3>Data</h3>
      <div className="terra-grid">
        <span>Natural Earth</span><span>{flags.naturalEarth ? 'loaded' : 'loading/unavailable'}</span>
        <span>Climate atlas</span><span>{flags.worldMap ? (flags.worldMapElevation ? 'built with measured elevation' : 'built without elevation (terrain host unreachable)') : 'building…'}</span>
        <span>Place index</span><span>{flags.gazetteer ? 'loaded' : 'loading/unavailable'}</span>
        <span>Procedural world</span><span>{engine?.nearField ? (() => { const n = engine.nearFieldStats; return n ? `${n.tiles} tiles (${n.pendingTiles} pending) · ${n.treeInstances} trees · ${n.shrubInstances} shrubs · ${n.grassInstances} grass · ${n.rockInstances} rocks · ${n.buildings} buildings · ${n.fields} fields · ${n.primitives} primitives · last gen ${n.lastGenerationMs.toFixed(0)} ms` : 'idle (fly below 6 km)'; })() : 'workers unavailable'}</span>
        <span>Landmarks</span><span>{engine ? `${engine.landmarks.stats().visible} of ${engine.landmarks.stats().total} procedural stand-ins in range` : '—'}</span>
        <span>Traffic / lamps</span><span>{engine?.traffic ? (() => { const t = engine.traffic.stats(); return `${t.vehicles} vehicles · ${t.lamps} lamps · ${t.roads} roads (simulated)`; })() : 'disabled'}</span>
        <span>OpenStreetMap</span><span>{engine?.osm ? `${engine.osmStatus.loaded} tiles loaded · ${engine.osmStatus.loading} loading · ${engine.osmStatus.failed} failed · ${flags.osmOnline === null ? 'not yet requested' : flags.osmOnline ? 'online' : `offline (${engine.osmStatus.lastError ?? 'unreachable'})`}` : 'disabled'}</span>
        {gameplayStats.map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span>{k}</span><span>{String(v)}</span></span>)}
      </div>
      <h3>Log <button className="terra-mini" onClick={report} title={hardware ? describeHardware(hardware) : undefined}>Copy report</button></h3>
      <pre className="terra-log">{diagnostics.length === 0 ? 'No errors or warnings.' : diagnostics.map((d) => `${d.time} [${d.level}] ${d.message}${d.stack ? `\n${d.stack}` : ''}`).join('\n')}</pre>
    </div>
  );
}
