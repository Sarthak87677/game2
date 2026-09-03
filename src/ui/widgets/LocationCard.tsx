import { useTerraStore } from '@/state/store';
import { formatLatLon, formatMetres } from '../format';

function Badge({ kind }: { kind: string }) {
  const cls = kind.startsWith('measured') ? 'measured' : kind.startsWith('inferred') ? 'inferred' : kind === 'live' ? 'live' : 'procedural';
  return <span className={`terra-badge terra-badge-${cls}`}>{kind}</span>;
}

export function LocationCard() {
  const camera = useTerraStore((s) => s.camera);
  const loc = useTerraStore((s) => s.location);
  const weather = useTerraStore((s) => s.weather);
  const time = useTerraStore((s) => s.time);
  if (!camera) return null;
  const date = new Date(time.iso);
  return (
    <div className="terra-card terra-location">
      <div className="terra-place">{loc?.place ?? 'Locating…'}</div>
      <div className="terra-row mono">{formatLatLon(camera.lat, camera.lon)}</div>
      <div className="terra-grid">
        <span>Altitude</span><span className="mono">{formatMetres(camera.heightM)} {camera.altitudeAglM !== null && <em>({formatMetres(camera.altitudeAglM)} AGL)</em>}</span>
        <span>Elevation</span><span className="mono">{camera.groundM === null ? 'streaming…' : formatMetres(camera.groundM)} <Badge kind={loc?.provenance.terrain ?? 'measured'} /></span>
        <span>Biome</span><span>{loc?.biomeLabel ?? '—'} <small>({loc?.koppen})</small> <Badge kind="inferred" /></span>
        <span>Surface</span><span>{loc?.surface ?? '—'}{loc?.region ? ` · ${loc.region}` : ''}</span>
        <span>Conditions</span><span>{weather ? `${weather.condition.replace('_', ' ')}, ${weather.temperatureC}°C` : '—'} {weather && <Badge kind={weather.source === 'simulated' ? 'procedural' : weather.source} />}</span>
        <span>Season</span><span>{loc?.season ?? '—'}{loc?.monthTempC !== null && loc?.monthTempC !== undefined ? ` · month mean ${loc.monthTempC}°C` : ''}</span>
        <span>Time</span><span className="mono">{date.toISOString().slice(0, 16).replace('T', ' ')} UTC <small>· {loc?.localTime}</small></span>
        <span>Sun</span><span>{loc?.sunElevationDeg !== null && loc?.sunElevationDeg !== undefined ? `${loc.sunElevationDeg.toFixed(1)}° ${loc.sunElevationDeg > 0 ? 'day' : loc.sunElevationDeg > -6 ? 'twilight' : 'night'}` : '—'}</span>
      </div>
    </div>
  );
}
