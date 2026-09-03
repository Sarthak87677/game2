import { weatherFromPreset, type WeatherCondition, type WeatherState } from '@/engine/environment';
import { fetchJsonWithTimeout, RateLimiter } from '../geocoding/rateLimit';

/** Maps WMO weather codes (Open-Meteo `weather_code`) to Terra weather presets. */
export function conditionFromWmo(code: number, cloudCover: number): WeatherCondition {
  if (code === 0) return cloudCover > 50 ? 'partly_cloudy' : 'clear';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'partly_cloudy';
}

interface CurrentResponse { current: { temperature_2m: number; relative_humidity_2m: number; precipitation: number; rain: number; snowfall: number; weather_code: number; cloud_cover: number; wind_speed_10m: number; wind_direction_10m: number; is_day: number } }
interface ArchiveResponse { daily: { time: string[]; temperature_2m_mean?: number[]; temperature_2m_max?: number[]; precipitation_sum: number[]; snowfall_sum?: number[]; weather_code?: number[]; wind_speed_10m_max?: number[] } }

export function weatherFromCurrent(c: CurrentResponse['current']): WeatherState {
  const cond = conditionFromWmo(c.weather_code, c.cloud_cover);
  const w = weatherFromPreset(cond, Math.round(c.temperature_2m), Math.round(c.wind_direction_10m), 'live');
  w.cloudCover = Math.max(0, Math.min(1, c.cloud_cover / 100));
  w.humidity = Math.max(0, Math.min(1, c.relative_humidity_2m / 100));
  w.windSpeedMs = Math.round((c.wind_speed_10m / 3.6) * 10) / 10;
  w.precipitation = Math.min(1, (c.precipitation ?? 0) / 5);
  if (c.snowfall > 0) { w.condition = 'snow'; w.precipitation = Math.min(1, c.snowfall / 2); w.snowCover = Math.max(w.snowCover, 0.5); }
  w.wetness = w.precipitation > 0 ? Math.min(1, 0.4 + w.precipitation) : cond === 'fog' ? 0.4 : 0;
  w.fogDensity = cond === 'fog' ? 0.9 : Math.min(0.3, (w.humidity - 0.7) * 1.2 > 0 ? (w.humidity - 0.7) * 1.2 : 0);
  return w;
}

/**
 * Open-Meteo adapter (CC BY 4.0, no API key). Provides current conditions (labelled "live") and daily historical
 * observations (labelled "historical") so weather can optionally follow reality instead of the climate simulation.
 */
export class OpenMeteoAdapter {
  readonly id = 'open-meteo';
  private limiter = new RateLimiter(1000);
  private blockedUntil = 0;
  lastError: string | null = null;
  constructor(private fetchImpl: typeof fetch = (i, init) => fetch(i, init), private baseUrl = 'https://api.open-meteo.com', private archiveUrl = 'https://archive-api.open-meteo.com') {}

  get online(): boolean | null { return this.lastError === null ? null : Date.now() >= this.blockedUntil; }

  async current(lat: number, lon: number): Promise<WeatherState | null> {
    if (Date.now() < this.blockedUntil) return null;
    try {
      const url = `${this.baseUrl}/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day&timezone=UTC`;
      const json = (await this.limiter.run(() => fetchJsonWithTimeout(this.fetchImpl, url, 8000))) as CurrentResponse;
      this.lastError = null;
      return weatherFromCurrent(json.current);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.blockedUntil = Date.now() + 120_000;
      return null;
    }
  }

  async historical(lat: number, lon: number, date: Date): Promise<WeatherState | null> {
    if (Date.now() < this.blockedUntil) return null;
    const day = date.toISOString().slice(0, 10);
    try {
      const url = `${this.archiveUrl}/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${day}&end_date=${day}&daily=temperature_2m_mean,temperature_2m_max,precipitation_sum,snowfall_sum,weather_code,wind_speed_10m_max&timezone=UTC`;
      const json = (await this.limiter.run(() => fetchJsonWithTimeout(this.fetchImpl, url, 10000))) as ArchiveResponse;
      const d = json.daily;
      if (!d || !d.time?.length) return null;
      const code = d.weather_code?.[0] ?? 0;
      const temp = d.temperature_2m_mean?.[0] ?? d.temperature_2m_max?.[0] ?? 15;
      const w = weatherFromPreset(conditionFromWmo(code, 0), Math.round(temp), 240, 'historical');
      w.precipitation = Math.min(1, (d.precipitation_sum[0] ?? 0) / 10);
      w.windSpeedMs = Math.round(((d.wind_speed_10m_max?.[0] ?? 10) / 3.6) * 10) / 10;
      if ((d.snowfall_sum?.[0] ?? 0) > 0) { w.condition = 'snow'; w.snowCover = 0.7; }
      this.lastError = null;
      return w;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.blockedUntil = Date.now() + 120_000;
      return null;
    }
  }
}
