import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { formatBytes } from '../format';

export function DiagnosticsPanel() {
  const engine = useEngine();
  const streaming = useTerraStore((s) => s.streaming);
  const diagnostics = useTerraStore((s) => s.diagnostics);
  const flags = useTerraStore((s) => s.dataFlags);
  const camera = useTerraStore((s) => s.camera);
  const gl = (engine?.viewer.scene as unknown as { context?: { _gl?: WebGL2RenderingContext } } | undefined)?.context;
  const renderer = (() => { try { const g = gl?._gl; const dbg = g?.getExtension('WEBGL_debug_renderer_info'); return dbg && g ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown'; } catch { return 'unknown'; } })();
  const report = () => {
    const text = JSON.stringify({ streaming, flags, camera, renderer, ua: navigator.userAgent, diagnostics }, null, 2);
    void navigator.clipboard?.writeText(text);
  };
  return (
    <div className="terra-panel-body">
      <h3>Performance</h3>
      {streaming && (
        <div className="terra-grid mono">
          <span>FPS</span><span>{streaming.fps.toFixed(1)} ({streaming.frameMs.toFixed(1)} ms/frame)</span>
          <span>Tiles queued</span><span>{streaming.queuedTiles} {streaming.tilesLoaded ? '(all loaded)' : ''}</span>
          <span>Terrain tiles</span><span>{streaming.terrainTilesLoaded} ok · {streaming.terrainTileErrors} failed · {formatBytes(streaming.terrainBytes)} · last {streaming.lastTerrainMs.toFixed(0)} ms</span>
          <span>Imagery tiles</span><span>{streaming.imageryTilesRendered} rendered (procedural)</span>
          <span>Active requests</span><span>{streaming.activeRequests}</span>
          <span>JS heap</span><span>{streaming.jsHeapMb === null ? 'n/a' : `${streaming.jsHeapMb.toFixed(0)} MB`}</span>
          <span>Renderer</span><span>{renderer}</span>
        </div>
      )}
      <h3>Data</h3>
      <div className="terra-grid">
        <span>Natural Earth</span><span>{flags.naturalEarth ? 'loaded' : 'loading/unavailable'}</span>
        <span>Climate atlas</span><span>{flags.worldMap ? (flags.worldMapElevation ? 'built with measured elevation' : 'built without elevation (terrain host unreachable)') : 'building…'}</span>
        <span>Place index</span><span>{flags.gazetteer ? 'loaded' : 'loading/unavailable'}</span>
        <span>Procedural world</span><span>{engine?.nearField ? (() => { const n = engine.nearFieldStats; return n ? `${n.tiles} tiles (${n.pendingTiles} pending) · ${n.treeInstances} trees · ${n.shrubInstances} shrubs · ${n.grassInstances} grass · ${n.rockInstances} rocks · ${n.buildings} buildings · ${n.fields} fields · ${n.primitives} primitives · last gen ${n.lastGenerationMs.toFixed(0)} ms` : 'idle (fly below 6 km)'; })() : 'workers unavailable'}</span>
        <span>Landmarks</span><span>{engine ? `${engine.landmarks.stats().visible} of ${engine.landmarks.stats().total} procedural stand-ins in range` : '—'}</span>
        <span>Traffic / lamps</span><span>{engine?.traffic ? (() => { const t = engine.traffic.stats(); return `${t.vehicles} vehicles · ${t.lamps} lamps · ${t.roads} roads (simulated)`; })() : 'disabled'}</span>
        <span>OpenStreetMap</span><span>{engine?.osm ? `${engine.osmStatus.loaded} tiles loaded · ${engine.osmStatus.loading} loading · ${engine.osmStatus.failed} failed · ${flags.osmOnline === null ? 'not yet requested' : flags.osmOnline ? 'online' : `offline (${engine.osmStatus.lastError ?? 'unreachable'})`}` : 'disabled'}</span>
      </div>
      <h3>Log <button className="terra-mini" onClick={report}>Copy report</button></h3>
      <pre className="terra-log">{diagnostics.length === 0 ? 'No errors or warnings.' : diagnostics.map((d) => `${d.time} [${d.level}] ${d.message}${d.stack ? `\n${d.stack}` : ''}`).join('\n')}</pre>
    </div>
  );
}
