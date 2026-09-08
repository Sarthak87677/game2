import { describe, expect, it } from 'vitest';
import { CORRIDORS, stationById } from '@/data/maharashtra';
import { headwayMinutes, nextDepartures } from '@/gameplay/journeys/schedule';
import { buildTrackProfile, maxGrade } from '@/gameplay/journeys/trackProfile';
import { BlockSystem } from '@/gameplay/rail/blocks';
import { advanceTrain, limitAt, SERVICE_MOTION } from '@/gameplay/rail/motion';

describe('simulated schedule', () => {
  const at = (id: string) => CORRIDORS.filter((c) => c.stations.includes(id));
  it('is deterministic, sorted and within the horizon', () => {
    const a = nextDepartures('csmt', at('csmt'), 600, 90, 8);
    const b = nextDepartures('csmt', at('csmt'), 600, 90, 8);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (let i = 1; i < a.length; i++) expect(a[i].departsInMin).toBeGreaterThanOrEqual(a[i - 1].departsInMin);
    for (const d of a) { expect(d.departsInMin).toBeGreaterThan(0); expect(d.departsInMin).toBeLessThanOrEqual(90); expect(d.stops.length).toBeGreaterThan(0); expect(d.stops[d.stops.length - 1]).toBe(d.destinationId); }
  });
  it('offers an intercity service to Pune from CSMT and only outbound directions at a terminus', () => {
    const deps = nextDepartures('csmt', at('csmt'), 600, 120, 8);
    expect(deps.some((d) => d.destinationId === 'pune')).toBe(true);
    for (const d of deps) expect(d.direction).toBe(1);
  });
  it('lists both directions from a through station and respects headways', () => {
    const deps = nextDepartures('dadar', at('dadar'), 30, 60, 12);
    expect(new Set(deps.map((d) => d.direction)).size).toBe(2);
    expect(headwayMinutes('metro')).toBeLessThan(headwayMinutes('intercity'));
  });
  it('generates nothing for an unknown station', () => {
    expect(nextDepartures('nowhere', CORRIDORS, 0)).toEqual([]);
    expect(stationById('nowhere')).toBeUndefined();
  });
});

describe('track profile', () => {
  it('never dips below the terrain and smooths a ghat climb', () => {
    const ground = Array.from({ length: 120 }, (_, i) => 60 + 500 * Math.max(0, Math.min(1, (i - 30) / 60)) + 25 * Math.sin(i * 0.9));
    const prof = buildTrackProfile(ground, { clearanceM: 0.6 });
    expect(prof.length).toBe(ground.length);
    for (let i = 0; i < ground.length; i++) expect(prof[i]).toBeGreaterThanOrEqual(ground[i] + 0.6 - 1e-9);
    expect(maxGrade(prof, 150)).toBeLessThan(maxGrade(ground, 150));
    expect(prof[prof.length - 1]).toBeGreaterThan(prof[0] + 400);
  });
  it('keeps a flat plain flat and lifts an elevated line', () => {
    const flat = new Array(20).fill(5);
    expect(buildTrackProfile(flat).every((h) => Math.abs(h - 5.6) < 1e-9)).toBe(true);
    expect(buildTrackProfile(flat, { elevatedM: 12 })[3]).toBeCloseTo(17.6, 6);
    expect(buildTrackProfile([])).toEqual([]);
  });
});

describe('block signalling', () => {
  const blocks = new BlockSystem([0, 5000, 10000], 10000, 20000);
  it('maps arc lengths to blocks and finds boundaries', () => {
    expect(blocks.blockOf(10)).toBe(0);
    expect(blocks.blockOf(6000)).toBe(1);
    expect(blocks.nextBoundary(100, 1)).toBe(5000);
    expect(blocks.nextBoundary(6000, -1)).toBe(5000);
    expect(blocks.nextBoundary(9999.99, 1)).toBeNull();
  });
  it('holds a following train until the block ahead clears', () => {
    blocks.update('A', 6000, 1);
    blocks.update('B', 4000, 1);
    expect(blocks.blockBeyond(4000, 1)).toBe(1);
    expect(blocks.canEnter('B', 1, 1)).toBe(false);
    blocks.update('C', 6000, -1); // opposite direction on the other track never blocks
    expect(blocks.canEnter('B', 1, 1)).toBe(false);
    blocks.remove('A');
    expect(blocks.canEnter('B', 1, 1)).toBe(true);
  });
  it('splits long blocks', () => {
    const b = new BlockSystem([0, 30000], 30000, 6000);
    expect(b.boundaries.length).toBeGreaterThan(4);
  });
});

describe('train motion', () => {
  it('stops at the target without overshoot and never exceeds the limit', () => {
    let s = 0, v = 0;
    const p = SERVICE_MOTION.suburban;
    let maxV = 0, steps = 0;
    for (; steps < 100000; steps++) {
      const r = advanceTrain(s, v, 1, 0.1, p.maxMs, 3000, p);
      s = r.s; v = r.v; maxV = Math.max(maxV, v);
      expect(s).toBeLessThanOrEqual(3000 + 1e-6);
      if (r.stopped) break;
    }
    expect(steps).toBeLessThan(100000);
    expect(Math.abs(s - 3000)).toBeLessThan(0.5);
    expect(maxV).toBeLessThanOrEqual(p.maxMs + 1e-9);
    expect(maxV).toBeGreaterThan(p.maxMs * 0.9);
  });
  it('runs backwards for direction −1 and applies slow sections', () => {
    const r = advanceTrain(1000, 10, -1, 1, 20, null, SERVICE_MOTION.intercity);
    expect(r.s).toBeLessThan(1000);
    expect(limitAt(500, 30, [{ fromS: 400, toS: 600, ms: 12 }])).toBe(12);
    expect(limitAt(700, 30, [{ fromS: 400, toS: 600, ms: 12 }])).toBe(30);
  });
});
