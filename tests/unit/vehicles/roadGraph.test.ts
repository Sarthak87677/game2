import { describe, expect, it } from 'vitest';
import { connectRoads, disconnectRoads, makeGraphRoad, nextNodeAhead, pickTurn, roadPosition, segmentAt, type GraphNode } from '@/world/traffic/roadGraph';
import { paletteFor, pedestrianActivity } from '@/world/traffic/Pedestrians';

const ew = makeGraphRoad('ew', 'primary', [[72.800, 18.900], [72.801, 18.900], [72.802, 18.900]], 't', 10, 2, false);
const ns = makeGraphRoad('ns', 'residential', [[72.801, 18.899], [72.801, 18.900], [72.801, 18.901]], 't', 6, null, false);
const one = makeGraphRoad('one', 'secondary', [[72.802, 18.900], [72.802, 18.901]], 't2', 7, 2, true);

describe('road graph', () => {
  it('measures roads and finds segments', () => {
    expect(ew.length).toBeCloseTo(210.6, 0);
    expect(segmentAt(ew, 0)).toBe(1);
    expect(segmentAt(ew, ew.length)).toBe(2);
    expect(ew.segDir[0].e).toBeCloseTo(1, 5);
  });

  it('connects shared vertices into junction nodes and marks signals', () => {
    const nodes = new Map<string, GraphNode>();
    connectRoads([ew, ns, one], nodes);
    expect(nodes.size).toBe(2);
    const cross = [...nodes.values()].find((n) => n.arms.length === 2 && n.arms.some((a) => a.road === ns));
    expect(cross).toBeDefined();
    expect(cross!.signal).toBe(false); // only two arms
    expect(ew.nodes[1]).toBe(cross!.key);
    expect(ns.nodes[1]).toBe(cross!.key);
    const end = [...nodes.values()].find((n) => n.arms.some((a) => a.road === one));
    expect(end).toBeDefined();
    const ahead = nextNodeAhead(ew, 10, 1, 500);
    expect(ahead?.key).toBe(cross!.key);
    expect(ahead?.distM).toBeCloseTo(ew.cum[1] - 10, 3);
    expect(nextNodeAhead(ew, 10, -1, 500)).toBeNull();
    disconnectRoads('t2', nodes);
    expect(nodes.size).toBe(1);
  });

  it('turns at junctions away from the node and respects one-way roads', () => {
    const nodes = new Map<string, GraphNode>();
    connectRoads([ew, ns, one], nodes);
    const end = nodes.get(ew.nodes[2]!)!;
    const turn = pickTurn(end, ew, 0.1);
    expect(turn).not.toBeNull();
    expect(turn!.road).toBe(one);
    expect(turn!.dir).toBe(1);
    const cross = nodes.get(ew.nodes[1]!)!;
    const options = new Set([0, 0.4, 0.7, 0.99].map((r) => `${pickTurn(cross, ew, r)!.dir}`));
    expect(options.size).toBe(2); // both directions of the two-way ns road
    const lonely = makeGraphRoad('l', 'residential', [[72.9, 18.9], [72.901, 18.9]], 't', 6, null, false);
    expect(pickTurn({ key: 'x', lat: 0, lon: 0, arms: [{ road: lonely, index: 1 }], signal: false, offsetS: 0 }, lonely, 0.5)).toBeNull();
  });

  it('offsets positions to the left of travel (left-hand traffic) and interpolates heights', () => {
    const out = { lon: 0, lat: 0, h: 0, headingDeg: 0 };
    roadPosition(ew, ew.length / 2, 1, 2, (p) => (p.lon > 72.8005 ? 10 : 0), out);
    expect(out.headingDeg).toBeCloseTo(90, 3);
    expect(out.lat).toBeGreaterThan(18.9); // left of eastbound travel is north
    roadPosition(ew, ew.length / 2, -1, 2, () => 0, out);
    expect(out.headingDeg).toBeCloseTo(270, 3);
    expect(out.lat).toBeLessThan(18.9);
  });
});

describe('pedestrians', () => {
  it('picks regional palettes and time-of-day activity', () => {
    expect(paletteFor(18.94, 72.82).label).toMatch(/Maharashtra/);
    expect(paletteFor(28.6, 77.2).label).toMatch(/India/);
    expect(paletteFor(48.85, 2.35).label).toBe('Generic');
    expect(pedestrianActivity(3)).toBeLessThan(pedestrianActivity(9));
    expect(pedestrianActivity(9)).toBe(1);
  });
});
