import { describe, expect, it } from 'vitest';
import { advanceTimeTrial, bearingDeg, formatLapTime, headlightsOn, impactDamage, indicatorLit, laneOffsetM, loadBestTime, nearestRoadPoint, nextCheckpoint, offsetFromVehicle, pointBehind, relativeBearingDeg, saveBestTime, selectGear, signalGreen, startTimeTrial, StuckDetector, trafficDensity, wetGrip, type TimeTrialCourse } from '@/gameplay/vehicles/logic';
import { haversineM } from '@/util/geo';

describe('automatic gear display', () => {
  const base = { throttle: false, reverse: false, brake: false, idleS: 0 };
  it('shows D when moving forward or accelerating from rest', () => {
    expect(selectGear('P', { ...base, speedMs: 5 })).toBe('D');
    expect(selectGear('P', { ...base, speedMs: 0, throttle: true })).toBe('D');
  });
  it('shows R when reversing or when the reverse pedal is pressed at rest', () => {
    expect(selectGear('D', { ...base, speedMs: -2 })).toBe('R');
    expect(selectGear('P', { ...base, speedMs: 0, reverse: true })).toBe('R');
  });
  it('drops into P after idling or with the handbrake, via N while coasting to a stop', () => {
    expect(selectGear('D', { ...base, speedMs: 0.1 })).toBe('N');
    expect(selectGear('N', { ...base, speedMs: 0, idleS: 2 })).toBe('P');
    expect(selectGear('D', { ...base, speedMs: 0, brake: true })).toBe('P');
    expect(selectGear('P', { ...base, speedMs: 0 })).toBe('P');
  });
  it('keeps the previous gear while slowing through the dead band', () => {
    expect(selectGear('D', { ...base, speedMs: 0.2, throttle: true })).toBe('D');
  });
});

describe('stuck detection', () => {
  it('fires once after 4 s of throttle without movement and resets when moving', () => {
    const s = new StuckDetector(4);
    let fired = 0;
    for (let i = 0; i < 39; i++) if (s.update(true, 0, 0.1)) fired++;
    expect(fired).toBe(0);
    expect(s.update(true, 0.05, 0.11)).toBe(true);
    expect(s.update(true, 0, 0.1)).toBe(false);
    s.update(true, 2, 0.1);
    expect(s.seconds).toBe(0);
  });
  it('does not count when the throttle is released', () => {
    const s = new StuckDetector(4);
    for (let i = 0; i < 100; i++) expect(s.update(false, 0, 0.1)).toBe(false);
  });
});

describe('grip, impacts, lamps', () => {
  it('reduces acceleration and turn rate on wet roads', () => {
    expect(wetGrip(0)).toEqual({ accel: 1, turn: 1, brake: 1 });
    const wet = wetGrip(1);
    expect(wet.accel).toBeLessThan(0.7); expect(wet.turn).toBeLessThan(0.8);
    expect(wetGrip(5).accel).toBe(wet.accel);
  });
  it('registers only sudden large speed drops as impacts', () => {
    expect(impactDamage(20, 19.5, 0.016)).toBe(0);
    expect(impactDamage(3, 0, 0.016)).toBe(0);
    expect(impactDamage(15, 0, 0.016)).toBeGreaterThan(0.3);
    expect(impactDamage(15, 0, 0.016)).toBeLessThanOrEqual(0.35);
    expect(impactDamage(10, 5, 0.25)).toBe(0);
  });
  it('turns headlights on at dusk unless overridden', () => {
    expect(headlightsOn(30, null)).toBe(false);
    expect(headlightsOn(-3, null)).toBe(true);
    expect(headlightsOn(-3, false)).toBe(false);
    expect(headlightsOn(40, true)).toBe(true);
  });
  it('blinks indicators at 1.25 Hz', () => {
    expect(indicatorLit(0)).toBe(true);
    expect(indicatorLit(450)).toBe(false);
    expect(indicatorLit(850)).toBe(true);
  });
});

describe('bearings and offsets', () => {
  it('computes compass bearings and relative bearings', () => {
    expect(Math.round(bearingDeg(18.9, 72.8, 19.9, 72.8))).toBe(0);
    expect(Math.round(bearingDeg(18.9, 72.8, 18.9, 73.8))).toBe(90);
    expect(relativeBearingDeg(350, 10)).toBe(20);
    expect(relativeBearingDeg(10, 350)).toBe(-20);
  });
  it('offsets points in the vehicle frame and behind the heading', () => {
    const p = offsetFromVehicle(18.9, 72.8, 90, 10, 0);
    expect(p.lon).toBeGreaterThan(72.8); expect(Math.abs(p.lat - 18.9)).toBeLessThan(1e-6);
    const left = offsetFromVehicle(18.9, 72.8, 90, 0, 5);
    expect(left.lat).toBeGreaterThan(18.9);
    const back = pointBehind(18.9, 72.8, 0, 5);
    expect(back.lat).toBeLessThan(18.9);
    expect(haversineM(18.9, 72.8, back.lat, back.lon)).toBeCloseTo(5, 0);
  });
});

describe('nearest road point', () => {
  const roads = [
    { kind: 'residential', coords: [[72.8000, 18.9000], [72.8010, 18.9000]] as [number, number][] },
    { kind: 'path', coords: [[72.8000, 18.90001], [72.8010, 18.90001]] as [number, number][] },
  ];
  it('projects onto the nearest drivable road and returns its heading', () => {
    const r = nearestRoadPoint(18.9002, 72.8005, roads, 80);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.lat - 18.9)).toBeLessThan(1e-7);
    expect(r!.distanceM).toBeCloseTo(22.2, 0);
    expect(Math.round(r!.headingDeg)).toBe(90);
  });
  it('ignores roads beyond the search radius and non-drivable kinds', () => {
    expect(nearestRoadPoint(18.91, 72.8005, roads, 80)).toBeNull();
    expect(nearestRoadPoint(18.9002, 72.8005, [roads[1]], 80)).toBeNull();
  });
});

describe('time trial state machine', () => {
  const course: TimeTrialCourse = { id: 't', name: 'Test loop', radiusM: 15, note: 'fictional', checkpoints: [{ lat: 18.7, lon: 73.4, name: 'Start' }, { lat: 18.701, lon: 73.4, name: 'CP1' }, { lat: 18.702, lon: 73.4, name: 'CP2' }] };
  it('captures checkpoints in order and finishes back at the start', () => {
    let s = startTimeTrial(course, 1000);
    expect(nextCheckpoint(course, s).name).toBe('CP1');
    expect(advanceTimeTrial(course, s, 18.702, 73.4, 2000)).toBe(s); // wrong checkpoint: ignored
    s = advanceTimeTrial(course, s, 18.701, 73.4, 3000);
    expect(s.next).toBe(2); expect(s.splitsMs).toEqual([2000]);
    s = advanceTimeTrial(course, s, 18.702, 73.4, 5000);
    expect(nextCheckpoint(course, s).name).toBe('Start');
    s = advanceTimeTrial(course, s, 18.7, 73.4, 9000);
    expect(s.finishedMs).toBe(9000);
    expect(advanceTimeTrial(course, s, 18.7, 73.4, 9500)).toBe(s);
  });
  it('formats lap times and stores best times only when improved', () => {
    expect(formatLapTime(61_230)).toBe('01:01.2');
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(loadBestTime('t', storage)).toBeNull();
    expect(saveBestTime('t', 90_000, storage)).toBe(true);
    expect(saveBestTime('t', 95_000, storage)).toBe(false);
    expect(saveBestTime('t', 80_000, storage)).toBe(true);
    expect(loadBestTime('t', storage)).toBe(80_000);
    expect(loadBestTime('t', null)).toBeNull();
  });
});

describe('ambient traffic helpers', () => {
  it('varies density by hour and place size', () => {
    expect(trafficDensity(9, 2_000_000)).toBeGreaterThan(trafficDensity(3, 2_000_000));
    expect(trafficDensity(18, 2_000_000)).toBeGreaterThan(trafficDensity(18, 5_000));
    expect(trafficDensity(3, null)).toBeLessThan(0.3);
    expect(trafficDensity(18, 2_000_000)).toBeLessThanOrEqual(1.6);
  });
  it('alternates green between north-south and east-west approaches with all-red clearance', () => {
    expect(signalGreen(1, 0, 0)).toBe(true);
    expect(signalGreen(1, 0, 90)).toBe(false);
    expect(signalGreen(13, 0, 90)).toBe(true);
    expect(signalGreen(13, 0, 180)).toBe(false);
    expect(signalGreen(11, 0, 0)).toBe(false); // clearance
    expect(signalGreen(23, 0, 90)).toBe(false);
    expect(signalGreen(25, 0, 0)).toBe(true); // wraps around the cycle
  });
  it('keeps left on two-way roads and spreads lanes on one-way roads', () => {
    expect(laneOffsetM(7, 2, false)).toBeCloseTo(1.75, 5);
    expect(laneOffsetM(7, 2, true, 0)).toBeCloseTo(1.75, 5);
    expect(laneOffsetM(7, 2, true, 1)).toBeCloseTo(-1.75, 5);
    expect(laneOffsetM(3, null, true)).toBeCloseTo(0, 5);
  });
});
