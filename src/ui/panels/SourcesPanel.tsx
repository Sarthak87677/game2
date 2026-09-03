import { useTerraStore } from '@/state/store';
import { useEngine } from '../EngineContext';

export function SourcesPanel() {
  const engine = useEngine();
  const sources = useTerraStore((s) => s.sources);
  const terrainId = useTerraStore((s) => s.terrainId);
  const imageryId = useTerraStore((s) => s.imageryId);
  const flags = useTerraStore((s) => s.dataFlags);
  const terrain = engine ? [...engine.registry.terrain.values()] : [];
  const imagery = engine ? [...engine.registry.imagery.values()] : [];
  return (
    <div className="terra-panel-body">
      <h3>Accuracy legend</h3>
      <p className="terra-help">
        <span className="terra-badge terra-badge-measured">measured</span> surveyed geographic data ·
        <span className="terra-badge terra-badge-inferred">inferred</span> derived from models or coarse data ·
        <span className="terra-badge terra-badge-procedural">procedural</span> generated visual detail (plausible, not real) ·
        <span className="terra-badge terra-badge-live">live</span> optional network observations
      </p>
      <h3>Terrain</h3>
      <div className="terra-row terra-wrap">
        {terrain.map((a) => { const av = a.isAvailable(); return <button key={a.info.id} disabled={!av.available} title={av.reason ?? a.info.name} className={terrainId === a.info.id ? 'active' : ''} onClick={() => void engine?.setTerrain(a.info.id)}>{a.info.name}{a.info.requiresApiKey ? ' 🔑' : ''}</button>; })}
      </div>
      <h3>Imagery</h3>
      <div className="terra-row terra-wrap">
        {imagery.map((a) => { const av = a.isAvailable(); return <button key={a.info.id} disabled={!av.available} title={av.reason ?? a.usageNote ?? a.info.name} className={imageryId === a.info.id ? 'active' : ''} onClick={() => void engine?.setImagery(a.info.id)}>{a.info.name}{a.info.requiresApiKey ? ' 🔑' : ''}</button>; })}
      </div>
      <p className="terra-help">Networked layers need internet access and respect each provider's usage policy; keyed providers are enabled through <code>.env</code> (see <code>.env.example</code>). Reference data loaded: Natural Earth {flags.naturalEarth ? '✓' : '…'}, climate atlas {flags.worldMap ? (flags.worldMapElevation ? '✓ (with elevation)' : '✓ (elevation unavailable)') : '…'}, place index {flags.gazetteer ? '✓' : '…'}.</p>
      <h3>All data sources</h3>
      <div className="terra-table-wrap">
        <table className="terra-table">
          <thead><tr><th>Source</th><th>Provider / dataset</th><th>Coverage · resolution</th><th>Licence · attribution</th><th>Key</th><th>Provenance</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></td>
                <td>{s.provider}<br /><small>{s.dataset} · updated {s.lastUpdated}</small></td>
                <td>{s.coverage}<br /><small>{s.resolution}</small></td>
                <td>{s.licence}<br /><small>{s.attribution}</small></td>
                <td>{s.requiresApiKey ? 'yes' : 'no'}</td>
                <td><span className={`terra-badge terra-badge-${s.provenance}`}>{s.provenance}</span><br /><small>{s.produces}</small></td>
              </tr>
            ))}
            <tr><td>OpenStreetMap features</td><td>OpenStreetMap contributors<br /><small>Overpass API (buildings, roads, water, POIs)</small></td><td>Global<br /><small>Vector, metre-level</small></td><td>ODbL 1.0<br /><small>© OpenStreetMap contributors</small></td><td>no</td><td><span className="terra-badge terra-badge-measured">measured</span><br /><small>Footprints and roads when online; heights inferred from tags/levels</small></td></tr>
            <tr><td>Open-Meteo</td><td>Open-Meteo<br /><small>Current weather (optional)</small></td><td>Global<br /><small>≈11 km models</small></td><td>CC BY 4.0<br /><small>Weather data by Open-Meteo.com</small></td><td>no</td><td><span className="terra-badge terra-badge-live">live</span><br /><small>Replaces simulated weather when enabled and reachable</small></td></tr>
          </tbody>
        </table>
      </div>
      <p className="terra-help">Full details and update dates: <code>DATA_SOURCES.md</code> and <code>ATTRIBUTIONS.md</code> in the repository.</p>
    </div>
  );
}
