import { describe, expect, it } from 'vitest';
import { bearingDeg, destinationPoint, distanceM, greatCircleInterpolate, lerpAngleDeg, Polyline } from '@/gameplay/journeys/geo';

const BOM = { lat: 19.0896, lon: 72.8656 };
const PNQ = { lat: 18.5822, lon: 73.9197 };
const NAG = { lat: 21.0922, lon: 79.0472 };

describe('great-circle interpolation', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const a = greatCircleInterpolate(BOM, NAG, 0), b = greatCircleInterpolate(BOM, NAG, 1);
    expect(distanceM(a, BOM)).toBeLessThan(0.01);
    expect(distanceM(b, NAG)).toBeLessThan(0.01);
  });
  it('places the midpoint equidistant from both ends along the shortest path', () => {
    const m = greatCircleInterpolate(BOM, NAG, 0.5);
    const d = distanceM(BOM, NAG);
    expect(Math.abs(distanceM(BOM, m) - d / 2)).toBeLessThan(1);
    expect(Math.abs(distanceM(m, NAG) - d / 2)).toBeLessThan(1);
  });
  it('is monotonic in distance travelled', () => {
    let last = 0;
    for (let i = 1; i <= 20; i++) { const d = distanceM(BOM, greatCircleInterpolate(BOM, NAG, i / 20)); expect(d).toBeGreaterThan(last); last = d; }
  });
  it('handles coincident points', () => {
    expect(greatCircleInterpolate(BOM, BOM, 0.3)).toEqual(BOM);
  });
  it('destinationPoint and bearing are consistent', () => {
    const b = bearingDeg(BOM, PNQ);
    const p = destinationPoint(BOM, b, distanceM(BOM, PNQ));
    expect(distanceM(p, PNQ)).toBeLessThan(50);
  });
  it('lerps angles across the 0/360 seam', () => {
    expect(lerpAngleDeg(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpAngleDeg(10, 350, 0.5)).toBeCloseTo(0, 5);
  });
});

describe('Polyline', () => {
  const line = new Polyline([BOM, PNQ, NAG]);
  it('has cumulative arc length equal to the sum of legs', () => {
    expect(line.lengthM).toBeCloseTo(distanceM(BOM, PNQ) + distanceM(PNQ, NAG), 3);
  });
  it('samples clamped positions and headings', () => {
    const s0 = line.sample(-5), s1 = line.sample(line.lengthM + 5);
    expect(distanceM(s0, BOM)).toBeLessThan(0.01);
    expect(distanceM(s1, NAG)).toBeLessThan(0.01);
    expect(line.sample(1000).headingDeg).toBeCloseTo(bearingDeg(BOM, PNQ), 0);
  });
  it('densifies to the requested spacing and keeps the length', () => {
    const d = line.densify(500);
    expect(d.maxGapM()).toBeLessThanOrEqual(500.5);
    expect(Math.abs(d.lengthM - line.lengthM) / line.lengthM).toBeLessThan(0.01);
  });
  it('finds the arc length nearest to a point', () => {
    const s = line.nearestS(PNQ);
    expect(Math.abs(s - distanceM(BOM, PNQ))).toBeLessThan(1);
    const off = { lat: 18.9, lon: 73.3 };
    const near = line.sample(line.nearestS(off));
    expect(distanceM(near, off)).toBeLessThan(distanceM(BOM, off));
  });
});
