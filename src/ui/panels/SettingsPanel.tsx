import { useState } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { sharedTileCache } from '@/data/cache/tileCache';
import { formatBytes } from '../format';

export function SettingsPanel() {
  const engine = useEngine();
  const settings = useTerraStore((s) => s.settings);
  const setSettings = useTerraStore((s) => s.setSettings);
  const quality = useTerraStore((s) => s.quality);
  const [geoStatus, setGeoStatus] = useState<string>('');
  const cache = sharedTileCache();
  const locate = () => {
    if (!navigator.geolocation) { setGeoStatus('Geolocation not supported'); return; }
    setGeoStatus('Requesting position…');
    navigator.geolocation.getCurrentPosition((pos) => {
      setGeoStatus(`Position received (±${Math.round(pos.coords.accuracy)} m)`);
      void engine?.goTo({ lat: pos.coords.latitude, lon: pos.coords.longitude, heightM: 2500, pitchDeg: -45 });
    }, (err) => setGeoStatus(`Denied or failed: ${err.message}`), { enableHighAccuracy: false, timeout: 10000 });
  };
  return (
    <div className="terra-panel-body">
      <h3>Rendering</h3>
      <label className="terra-row">Quality preset
        <select value={quality} onChange={(e) => engine?.setQuality(e.target.value as typeof quality)}>
          <option value="low">Low — 30 fps target on modest hardware</option>
          <option value="medium">Medium — balanced</option>
          <option value="high">High — shadows, AO, MSAA 4×</option>
          <option value="ultra">Ultra — 8× MSAA, bloom, large shadow maps</option>
        </select>
      </label>
      <label className="terra-row"><input type="checkbox" checked={settings.reduceMotion} onChange={(e) => setSettings({ reduceMotion: e.target.checked })} /> Reduce motion (shorter camera flights)</label>
      <label className="terra-row"><input type="checkbox" checked={settings.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High-contrast interface</label>
      <label className="terra-row">Interface scale <input type="range" min={0.8} max={1.6} step={0.1} value={settings.uiScale} onChange={(e) => setSettings({ uiScale: Number(e.target.value) })} /> {settings.uiScale.toFixed(1)}×</label>
      <label className="terra-row"><input type="checkbox" checked={settings.showAttribution} onChange={(e) => setSettings({ showAttribution: e.target.checked })} /> Show attribution strip (required when publishing)</label>
      <label className="terra-row"><input type="checkbox" checked={settings.audio} onChange={(e) => setSettings({ audio: e.target.checked })} /> Environmental audio</label>
      <h3>Streaming cache</h3>
      <label className="terra-row">Cache budget <input type="range" min={32} max={2048} step={32} value={settings.cacheMb} onChange={(e) => { const mb = Number(e.target.value); setSettings({ cacheMb: mb }); void cache.setBudget(mb * 1024 * 1024); }} /> {settings.cacheMb} MB</label>
      <div className="terra-row"><span>Used ≈ {formatBytes(cache.bytesUsed)} · hits {cache.hits} · misses {cache.misses}</span><button onClick={() => void cache.clear()}>Clear cache</button></div>
      <h3>Privacy</h3>
      <p className="terra-help">Location access is <strong>off by default</strong>. Terra Infinite never reads your position unless you enable it here, and it is used only once to move the camera — nothing is stored or sent anywhere.</p>
      <label className="terra-row"><input type="checkbox" checked={settings.locationAccess} onChange={(e) => setSettings({ locationAccess: e.target.checked })} /> Allow one-time device location</label>
      <div className="terra-row"><button disabled={!settings.locationAccess} onClick={locate}>Fly to my location</button><span>{geoStatus}</span></div>
    </div>
  );
}
