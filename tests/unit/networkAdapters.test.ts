import { describe, expect, it, vi } from 'vitest';
import { NominatimAdapter } from '@/data/adapters/geocoding/nominatim';
import { PhotonAdapter } from '@/data/adapters/geocoding/photon';
import { conditionFromWmo, OpenMeteoAdapter, weatherFromCurrent } from '@/data/adapters/weather/openMeteo';

const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Nominatim adapter', () => {
  it('maps results and rate-limits', async () => {
    const times: number[] = [];
    const fetchImpl = vi.fn(async (url: string) => { times.push(Date.now()); return (json(url.includes('/reverse') ? { display_name: 'Rue de Rivoli, Paris, France' } : [{ place_id: 1, lat: '48.8566', lon: '2.3522', name: 'Paris', display_name: 'Paris, Île-de-France, France', addresstype: 'city', importance: 0.9 }]))(); });
    const a = new NominatimAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch, minIntervalMs: 80 });
    const r = await a.search('Paris');
    expect(r[0].name).toBe('Paris');
    expect(r[0].kind).toBe('city');
    expect(r[0].lat).toBeCloseTo(48.8566);
    const rev = await a.reverse(48.86, 2.35);
    expect(rev).toContain('Rivoli');
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(60);
    expect(await a.search('Paris')).toBe(r); // cached
  });
  it('goes offline gracefully on network errors', async () => {
    const a = new NominatimAdapter({ fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, minIntervalMs: 0 });
    expect(await a.search('Paris')).toEqual([]);
    expect(a.online).toBe(false);
    expect(await a.reverse(1, 1)).toBeNull();
  });
});

describe('Photon adapter', () => {
  it('parses GeoJSON features', async () => {
    const a = new PhotonAdapter('https://photon.example/api/', json({ features: [{ geometry: { coordinates: [139.69, 35.68] }, properties: { osm_id: 5, name: 'Tokyo', country: 'Japan', osm_key: 'place', osm_value: 'city' } }] }) as unknown as typeof fetch);
    const r = await a.search('Tokyo');
    expect(r[0]).toMatchObject({ name: 'Tokyo', kind: 'city', lat: 35.68, lon: 139.69 });
  });
});

describe('Open-Meteo adapter', () => {
  it('maps WMO codes', () => {
    expect(conditionFromWmo(0, 10)).toBe('clear');
    expect(conditionFromWmo(3, 100)).toBe('overcast');
    expect(conditionFromWmo(63, 100)).toBe('rain');
    expect(conditionFromWmo(73, 100)).toBe('snow');
    expect(conditionFromWmo(95, 100)).toBe('storm');
    expect(conditionFromWmo(45, 100)).toBe('fog');
  });
  it('builds a live weather state', () => {
    const w = weatherFromCurrent({ temperature_2m: 21.4, relative_humidity_2m: 55, precipitation: 0, rain: 0, snowfall: 0, weather_code: 1, cloud_cover: 30, wind_speed_10m: 18, wind_direction_10m: 200, is_day: 1 });
    expect(w.source).toBe('live');
    expect(w.temperatureC).toBe(21);
    expect(w.condition).toBe('partly_cloudy');
    expect(w.windSpeedMs).toBeCloseTo(5, 0);
  });
  it('fetches current and historical conditions', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.includes('archive') ? json({ daily: { time: ['2024-01-10'], temperature_2m_mean: [-4], precipitation_sum: [3], snowfall_sum: [2], weather_code: [73], wind_speed_10m_max: [20] } }) : json({ current: { temperature_2m: 30, relative_humidity_2m: 80, precipitation: 6, rain: 6, snowfall: 0, weather_code: 65, cloud_cover: 100, wind_speed_10m: 30, wind_direction_10m: 90, is_day: 1 } }))());
    const a = new OpenMeteoAdapter(fetchImpl as unknown as typeof fetch);
    const cur = await a.current(19.07, 72.87);
    expect(cur?.condition).toBe('rain');
    expect(cur?.precipitation).toBe(1);
    const hist = await a.historical(55.75, 37.62, new Date('2024-01-10T12:00:00Z'));
    expect(hist?.source).toBe('historical');
    expect(hist?.condition).toBe('snow');
    expect(hist?.temperatureC).toBe(-4);
  });
});
