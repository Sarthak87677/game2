import { describe, expect, it } from 'vitest';
import { airportById } from '@/data/maharashtra';
import { distanceM } from '@/gameplay/journeys/geo';
import { defaultCompression, emptyFlightState, FlightPlan, runwayEnds, runwayHeadingTowards } from '@/gameplay/air/flightPlan';

const BOM = airportById('bom')!, PNQ = airportById('pnq')!, NAG = airportById('nag')!, AGR = airportById('agr')!;

describe('flight plan', () => {
  const plan = new FlightPlan(BOM, PNQ, { originGroundM: 10, destGroundM: 560 });
  it('starts at the origin terminal and ends at the destination terminal', () => {
    const s0 = plan.stateAt(0, emptyFlightState());
    const s1 = plan.stateAt(plan.totalS, emptyFlightState());
    expect(distanceM(s0, BOM.terminal)).toBeLessThan(5);
    expect(distanceM(s1, PNQ.terminal)).toBeLessThan(5);
    expect(s0.phase).toBe('taxi-out');
    expect(s1.phase).toBe('arrived');
    expect(s1.altM).toBe(560);
  });
  it('passes through every phase in order and reaches a bounded cruise altitude', () => {
    const seen: string[] = [];
    let maxAlt = 0;
    const st = emptyFlightState();
    for (let t = 0; t <= plan.totalS + 2; t += 2) { plan.stateAt(Math.min(t, plan.totalS), st); if (seen[seen.length - 1] !== st.phase) seen.push(st.phase); maxAlt = Math.max(maxAlt, st.altM); }
    expect(seen).toEqual(['taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'landing', 'taxi-in', 'arrived']);
    expect(maxAlt).toBeGreaterThan(1500);
    expect(maxAlt).toBeLessThanOrEqual(10500 + 560);
    expect(Math.abs(maxAlt - (plan.cruiseAltM + 10 + (560 - 10) * 0.5))).toBeLessThan(600);
  });
  it('never flies below the interpolated airport ground and lowers the gear for landing', () => {
    const st = emptyFlightState();
    for (let t = 0; t <= plan.totalS; t += 1) {
      plan.stateAt(t, st);
      const ground = 10 + 550 * st.progress;
      expect(st.altM).toBeGreaterThanOrEqual(Math.min(10, ground) - 1e-6);
      if (st.phase === 'cruise') expect(st.gearDown).toBe(false);
      if (st.phase === 'landing' || st.phase === 'takeoff') expect(st.gearDown).toBe(true);
    }
  });
  it('advances monotonically with dt and supports skipping', () => {
    const p = new FlightPlan(BOM, PNQ, { originGroundM: 0, destGroundM: 0 });
    const st = emptyFlightState();
    let last = 0;
    for (let i = 0; i < 50; i++) { p.advance(3, st); expect(p.time).toBeGreaterThanOrEqual(last); last = p.time; }
    p.setTime(p.totalS);
    expect(p.advance(1, st).phase).toBe('arrived');
    expect(p.landedTime).toBeLessThan(p.totalS);
  });
  it('picks the runway direction facing the destination', () => {
    expect(runwayHeadingTowards(BOM, PNQ, false)).toBe(90);
    expect(runwayHeadingTowards(PNQ, BOM, true)).toBe(100); // arriving from the west lands eastbound
    const ends = runwayEnds(BOM);
    expect(Math.abs(distanceM(ends.start, ends.end) - BOM.runwayLengthM)).toBeLessThan(5);
  });
  it('compresses a Mumbai–Pune hop to about three minutes and long hops sub-linearly', () => {
    const c = defaultCompression(plan);
    expect(Math.abs(plan.totalS / c - 178)).toBeLessThan(30);
    const long = new FlightPlan(BOM, NAG, { originGroundM: 0, destGroundM: 300 });
    expect(long.totalS / defaultCompression(long)).toBeLessThan(600);
    const taj = new FlightPlan(BOM, AGR, { originGroundM: 0, destGroundM: 170 });
    expect(taj.cruiseAltM).toBe(10500);
  });
});
