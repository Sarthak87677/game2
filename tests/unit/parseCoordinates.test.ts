import { describe, expect, it } from 'vitest';
import { formatCoordinates, parseCoordinates } from '@/data/geocoding/parseCoordinates';

const NY = { lat: 40.7128, lon: -74.006 };
const SYD = { lat: -33.8688, lon: 151.2093 };

function expectClose(text: string, lat: number, lon: number, tol = 1e-3): void {
  const r = parseCoordinates(text);
  expect(r, text).not.toBeNull();
  expect(r?.lat, text).toBeCloseTo(lat, Math.round(-Math.log10(tol)));
  expect(r?.lon, text).toBeCloseTo(lon, Math.round(-Math.log10(tol)));
}

describe('parseCoordinates — accepted forms', () => {
  it('parses decimal degrees separated by comma or space', () => {
    expect(parseCoordinates('40.7128, -74.0060')).toEqual(NY);
    expect(parseCoordinates('40.7128 -74.0060')).toEqual(NY);
    expect(parseCoordinates('40.7128,-74.0060')).toEqual(NY);
    expect(parseCoordinates('-33.8688,151.2093')).toEqual(SYD);
    expect(parseCoordinates('  -33.8688 ;  151.2093 ')).toEqual(SYD);
    expect(parseCoordinates('(40.7128, -74.0060)')).toEqual(NY);
  });

  it('parses labelled lat/lon in either order', () => {
    expect(parseCoordinates('lat 40.7 lon -74')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('lon -74 lat 40.7')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('Latitude: 40.7, Longitude: -74')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('lat=40.7&lng=-74')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('LONG -74, LAT 40.7')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('lon -74, 40.7')).toEqual({ lat: 40.7, lon: -74 });
  });

  it('parses degrees, minutes and seconds', () => {
    expectClose('40°42\'46"N 74°00\'22"W', 40.71278, -74.00611, 1e-4);
    expectClose('40°42′46″N, 74°00′22″W', 40.71278, -74.00611, 1e-4);
    expectClose('40° 42\' 46" N, 74° 0\' 22" W', 40.71278, -74.00611, 1e-4);
    expectClose('N 40° 42\' 46" W 74° 0\' 22"', 40.71278, -74.00611, 1e-4);
    expectClose('40d 42m 46s N 74d 0m 22s W', 40.71278, -74.00611, 1e-4);
    expectClose("33°52'08\"S 151°12'33\"E", -33.86889, 151.20917, 1e-4);
  });

  it('parses degrees and decimal minutes', () => {
    expectClose("40°42.77'N, 74°0.36'W", 40.71283, -74.006, 1e-4);
    expectClose("40°42.77'N 74°0.36'W", 40.71283, -74.006, 1e-4);
  });

  it('parses hemisphere letters as suffix or prefix', () => {
    expect(parseCoordinates('40.7N 74.0W')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('40.7 N, 74.0 W')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('S33.8688 E151.2093')).toEqual(SYD);
    expect(parseCoordinates('s 33.8688, e 151.2093')).toEqual(SYD);
    expect(parseCoordinates('N40.7 74.0W')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('40.7128°N, 74.0060°W')).toEqual(NY);
  });

  it('accepts longitude first only when it is explicit', () => {
    expect(parseCoordinates('74.0W 40.7N')).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinates('E151.2093 S33.8688')).toEqual(SYD);
    // Bare numbers are always lat, lon — never swapped.
    expect(parseCoordinates('-74.0060, 40.7128')).toEqual({ lat: -74.006, lon: 40.7128 });
    // …and out-of-range bare "lon, lat" is rejected rather than guessed.
    expect(parseCoordinates('151.2093, -33.8688')).toBeNull();
  });

  it('handles edge values and sign of zero', () => {
    expect(parseCoordinates('0, 0')).toEqual({ lat: 0, lon: 0 });
    expect(parseCoordinates('-0.0, -0.0')).toEqual({ lat: 0, lon: 0 });
    expect(parseCoordinates('90, 180')).toEqual({ lat: 90, lon: 180 });
    expect(parseCoordinates('-90 -180')).toEqual({ lat: -90, lon: -180 });
    expect(parseCoordinates('+40.7, +74')).toEqual({ lat: 40.7, lon: 74 });
  });
});

describe('parseCoordinates — rejections', () => {
  const garbage = [
    '', '   ', 'hello', 'Paris', '40.7128', '1, 2, 3', 'abc, def', '40.7128, -74.0060 (New York)', 'lat 40.7', 'lon -74',
    '40.7 and stuff -74', 'N40.7 N74', '40N 74N', '40.7 E 74.0 W', 'lat 40.7 lat -74', 'lon 10 lon 20',
  ];
  it.each(garbage)('returns null for %j', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });

  const outOfRange = ['91, 0', '-91, 0', '0, 181', '0, -181', 'lat 100 lon 0', '40.7 -200', '95N 10E', '10N 190E'];
  it.each(outOfRange)('rejects out-of-range %j', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });

  const malformedDms = ['40°70\'N 74°W', '40°42\'61"N 74°0\'22"W', '40.5°30\'N 74°W', '-33.8S 151E', 'S-33.8 E151', '40°42.5\'30"N 74°W', "40°42'46\"N 74'22\"W"];
  it.each(malformedDms)('rejects malformed DMS %j', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });

  it('rejects mismatched labels and hemispheres', () => {
    expect(parseCoordinates('lat 74W lon 40N')).toBeNull();
    expect(parseCoordinates('lat 40.7N lon 74.0N')).toBeNull();
  });

  it('is defensive about non-string input', () => {
    expect(parseCoordinates(undefined as unknown as string)).toBeNull();
    expect(parseCoordinates(42 as unknown as string)).toBeNull();
  });
});

describe('formatCoordinates', () => {
  it('formats decimal degrees with hemisphere letters', () => {
    expect(formatCoordinates(40.7128, -74.006)).toBe('40.7128°N, 74.0060°W');
    expect(formatCoordinates(-33.8688, 151.2093)).toBe('33.8688°S, 151.2093°E');
    expect(formatCoordinates(0, 0)).toBe('0.0000°N, 0.0000°E');
    expect(formatCoordinates(-0, -0)).toBe('0.0000°N, 0.0000°E');
    expect(formatCoordinates(40.7128, -74.006, { decimals: 2 })).toBe('40.71°N, 74.01°W');
  });

  it('formats DMS', () => {
    expect(formatCoordinates(40.7128, -74.006, { dms: true })).toBe('40°42\'46"N, 74°00\'22"W');
    expect(formatCoordinates(-33.8688, 151.2093, { dms: true })).toBe('33°52\'08"S, 151°12\'33"E');
    expect(formatCoordinates(0, 0, { dms: true })).toBe('0°00\'00"N, 0°00\'00"E');
    expect(formatCoordinates(40.7128, -74.006, { dms: true, secondsDecimals: 1 })).toBe('40°42\'46.1"N, 74°00\'21.6"W');
  });

  it('carries rounding past 60 seconds', () => {
    expect(formatCoordinates(40.99999, 0, { dms: true })).toBe('41°00\'00"N, 0°00\'00"E');
  });

  it('clamps latitude, wraps longitude and rejects non-finite input', () => {
    expect(formatCoordinates(95, 190)).toBe('90.0000°N, 170.0000°W');
    expect(formatCoordinates(10, -190)).toBe('10.0000°N, 170.0000°E');
    expect(formatCoordinates(10, 180)).toBe('10.0000°N, 180.0000°E');
    expect(() => formatCoordinates(Number.NaN, 0)).toThrow(RangeError);
    expect(() => formatCoordinates(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('round-trips through parseCoordinates', () => {
    const samples = [
      { lat: 40.7128, lon: -74.006 },
      { lat: -33.8688, lon: 151.2093 },
      { lat: 0, lon: 0 },
      { lat: -89.9975, lon: 139.2728 },
      { lat: 71.2906, lon: -156.7886 },
    ];
    for (const s of samples) {
      const dec = parseCoordinates(formatCoordinates(s.lat, s.lon));
      expect(dec).toEqual(s);
      const dms = parseCoordinates(formatCoordinates(s.lat, s.lon, { dms: true, secondsDecimals: 2 }));
      expect(dms).not.toBeNull();
      expect(dms?.lat).toBeCloseTo(s.lat, 4);
      expect(dms?.lon).toBeCloseTo(s.lon, 4);
    }
  });
});
