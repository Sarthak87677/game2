import { describe, expect, it } from 'vitest';
import { AIRPORTS, CORRIDORS, PORTS, STATIONS, WATER_ROUTES, stationById, portById } from '@/data/maharashtra';
import { Polyline, distanceM } from '@/gameplay/journeys/geo';

describe('stations', () => {
  it('have unique ids and codes and plausible Maharashtra coordinates', () => {
    const ids = new Set(STATIONS.map((s) => s.id));
    expect(ids.size).toBe(STATIONS.length);
    for (const s of STATIONS) {
      expect(s.lat).toBeGreaterThan(15.5); expect(s.lat).toBeLessThan(22.2);
      expect(s.lon).toBeGreaterThan(72.5); expect(s.lon).toBeLessThan(80.5);
      expect(s.platforms).toBeGreaterThan(0);
    }
  });
  it('include every station named in the brief', () => {
    for (const id of ['csmt', 'churchgate', 'dadar', 'bandra', 'andheri', 'borivali', 'thane', 'kalyan', 'karjat', 'lonavala', 'pune', 'shivajinagar', 'nashik-road', 'igatpuri', 'bhusawal', 'jalgaon', 'akola', 'badnera', 'nagpur', 'solapur', 'satara', 'sangli', 'miraj', 'kolhapur', 'ratnagiri', 'kudal', 'sawantwadi', 'sambhajinagar', 'nanded', 'panvel', 'vashi', 'belapur', 'neral', 'matheran', 'm1-versova', 'm1-ghatkopar']) expect(stationById(id), id).toBeDefined();
  });
});

describe('corridors', () => {
  it('are continuous polylines whose stations lie close to the path, in order', () => {
    for (const c of CORRIDORS) {
      const line = new Polyline(c.path);
      expect(line.maxGapM(), `${c.id} gap`).toBeLessThan(60_000);
      expect(line.lengthM).toBeGreaterThan(5_000);
      let lastS = -1;
      for (const id of c.stations) {
        const st = stationById(id);
        expect(st, `${c.id} station ${id}`).toBeDefined();
        const s = line.nearestS(st!);
        const near = line.sample(s);
        expect(distanceM(near, st!), `${c.id} ${id} off-track`).toBeLessThan(1500);
        expect(s, `${c.id} ${id} order`).toBeGreaterThan(lastS);
        lastS = s;
      }
      // Slow sections reference stations of the corridor.
      for (const sec of c.slowSections ?? []) for (const id of sec.between) expect(c.stations).toContain(id);
      expect(c.dataNote).toBeTruthy();
    }
  });
  it('cover the corridors named in the brief', () => {
    const ids = CORRIDORS.map((c) => c.id);
    for (const id of ['western-suburban', 'central-suburban', 'harbour-suburban', 'metro-1', 'mumbai-pune', 'mumbai-nagpur', 'pune-kolhapur', 'konkan', 'neral-matheran']) expect(ids).toContain(id);
    const ghat = CORRIDORS.find((c) => c.id === 'mumbai-pune')!;
    expect(ghat.slowSections?.some((s) => s.between.includes('karjat') && s.between.includes('lonavala'))).toBe(true);
    // The ghat has shape points between Karjat and Lonavala (it does not cut straight across).
    const line = new Polyline(ghat.path);
    const a = line.nearestS(stationById('karjat')!), b = line.nearestS(stationById('lonavala')!);
    const between = ghat.path.filter((p) => { const s = line.nearestS(p); return s > a + 100 && s < b - 100; });
    expect(between.length).toBeGreaterThanOrEqual(4);
  });
  it('metro line 1 is elevated and lists twelve stations', () => {
    const m = CORRIDORS.find((c) => c.id === 'metro-1')!;
    expect(m.elevatedM).toBeGreaterThan(5);
    expect(m.stations.length).toBe(12);
  });
});

describe('airports, ports and water routes', () => {
  it('airports have runways and terminals near the airport point', () => {
    const iata = AIRPORTS.map((a) => a.iata);
    for (const code of ['BOM', 'PNQ', 'NAG', 'ISK', 'KLH', 'IXU', 'AGR', 'DEL']) expect(iata).toContain(code);
    for (const a of AIRPORTS) {
      expect(a.runwayLengthM).toBeGreaterThan(1500);
      expect(a.runwayHeadingDeg).toBeGreaterThanOrEqual(0); expect(a.runwayHeadingDeg).toBeLessThan(360);
      expect(distanceM(a, a.terminal)).toBeLessThan(3000);
      expect(a.dataNote).toBeTruthy();
    }
  });
  it('water routes start and end at their ports over plausible distances', () => {
    for (const r of WATER_ROUTES) {
      const from = portById(r.from), to = portById(r.to);
      expect(from, r.from).toBeDefined(); expect(to, r.to).toBeDefined();
      expect(distanceM(r.path[0], from!)).toBeLessThan(400);
      expect(distanceM(r.path[r.path.length - 1], to!)).toBeLessThan(400);
      const line = new Polyline(r.path);
      expect(line.maxGapM()).toBeLessThan(60_000);
      expect(r.dataNote).toBeTruthy();
    }
    expect(WATER_ROUTES.map((r) => r.vessel).sort()).toEqual(['cruise', 'ferry', 'ferry', 'speedboat']);
    expect(PORTS.length).toBeGreaterThanOrEqual(7);
  });
});
