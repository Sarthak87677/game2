import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import type { WeatherCondition } from '@/engine/environment';

const CONDITIONS: WeatherCondition[] = ['clear', 'partly_cloudy', 'overcast', 'rain', 'storm', 'snow', 'fog', 'mist', 'dust'];
const SPEEDS = [1, 60, 600, 3600, 21600];

export function TimeWeatherPanel() {
  const engine = useEngine();
  const time = useTerraStore((s) => s.time);
  const weather = useTerraStore((s) => s.weather);
  const flags = useTerraStore((s) => s.dataFlags);
  const date = new Date(time.iso);
  const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <div className="terra-panel-body">
      <h3>Simulated time (UTC)</h3>
      <div className="terra-row">
        <input type="datetime-local" value={localIso} onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) engine?.setDate(d); }} aria-label="Date and time" />
        <button onClick={() => engine?.setDate(new Date())}>Now</button>
      </div>
      <div className="terra-row">
        <button onClick={() => engine?.setTimePlaying(!time.playing)}>{time.playing ? 'Pause' : 'Play'}</button>
        {SPEEDS.map((s) => <button key={s} className={time.speed === s ? 'active' : ''} onClick={() => engine?.setTimeSpeed(s)}>{s === 1 ? 'real-time' : s === 60 ? '1 min/s' : s === 600 ? '10 min/s' : s === 3600 ? '1 h/s' : '6 h/s'}</button>)}
      </div>
      <div className="terra-row">
        {[0, 6, 12, 18].map((h) => <button key={h} onClick={() => { const d = new Date(date); d.setUTCHours(h, 0, 0, 0); engine?.setDate(d); }}>{String(h).padStart(2, '0')}:00 UTC</button>)}
        {['Mar 21', 'Jun 21', 'Sep 23', 'Dec 21'].map((label, i) => <button key={label} onClick={() => { const d = new Date(date); d.setUTCMonth([2, 5, 8, 11][i], [21, 21, 23, 21][i]); engine?.setDate(d); }}>{label}</button>)}
      </div>
      <h3>Weather <span className="terra-badge terra-badge-procedural">{weather?.source ?? 'simulated'}</span></h3>
      <p className="terra-help">Weather is simulated from the inferred climate atlas for the current place and date. Live observations (Open-Meteo adapter) are optional and clearly labelled when active{flags.weatherOnline === false ? ' — currently unreachable' : ''}.</p>
      <div className="terra-row terra-wrap">
        {CONDITIONS.map((c) => <button key={c} className={weather?.condition === c ? 'active' : ''} onClick={() => engine?.setWeatherPreset(c)}>{c.replace('_', ' ')}</button>)}
        <button onClick={() => engine?.applySimulatedWeatherForCamera()}>Simulate from climate</button>
        <button className={weather?.source === 'live' ? 'active' : ''} onClick={() => void engine?.useLiveWeather(weather?.source !== 'live')} title="Open-Meteo current conditions (network)">Live weather</button>
        <button className={weather?.source === 'historical' ? 'active' : ''} onClick={() => void engine?.useHistoricalWeather()} title="Open-Meteo archive for the simulated date (network)">Historical for this date</button>
      </div>
      {weather && (
        <div className="terra-grid">
          <span>Temperature</span><span>{weather.temperatureC}°C</span>
          <span>Cloud cover</span><span>{Math.round(weather.cloudCover * 100)}%</span>
          <span>Precipitation</span><span>{Math.round(weather.precipitation * 100)}%</span>
          <span>Wind</span><span>{weather.windSpeedMs} m/s from {weather.windDirDeg}°</span>
          <span>Fog</span><span>{Math.round(weather.fogDensity * 100)}%</span>
          <span>Snow cover</span><span>{Math.round(weather.snowCover * 100)}%</span>
        </div>
      )}
    </div>
  );
}
