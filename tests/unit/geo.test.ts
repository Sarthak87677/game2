import { describe, expect, it } from 'vitest';
import { enuOffsetM, haversineM, latFromMercatorY, lonLatToTile, mercatorY, offsetToLonLat, tileBounds, wrapLon } from '@/util/geo';

describe('geo utils', () => {
  it('haversine distance Paris–London ≈ 344 km', () => {
    expect(haversineM(48.8566, 2.3522, 51.5074, -0.1278) / 1000).toBeCloseTo(343.5, 0);
  });
  it('wraps longitudes', () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(180)).toBe(-180);
  });
  it('mercator round trip', () => {
    for (const lat of [-80, -45, 0, 30, 85]) expect(latFromMercatorY(mercatorY(lat))).toBeCloseTo(lat, 6);
  });
  it('slippy tiles for known points', () => {
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(lonLatToTile(-73.98, 40.75, 10)).toEqual({ x: 301, y: 384 });
    const b = tileBounds(301, 384, 10);
    expect(b.west).toBeLessThan(-73.98);
    expect(b.east).toBeGreaterThan(-73.98);
    expect(b.south).toBeLessThan(40.75);
    expect(b.north).toBeGreaterThan(40.75);
  });
  it('ENU offsets round-trip', () => {
    const o = enuOffsetM(45, 10, 45.01, 10.02);
    expect(o.north).toBeCloseTo(1111, 0);
    expect(o.east).toBeGreaterThan(1500);
    const back = offsetToLonLat(45, 10, o.east, o.north);
    expect(back.lat).toBeCloseTo(45.01, 6);
    expect(back.lon).toBeCloseTo(10.02, 6);
  });
});
