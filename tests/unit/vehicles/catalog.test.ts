import { describe, expect, it } from 'vitest';
import { specSheet, VEHICLE_CATALOG, VEHICLE_NOTE, vehicleSpec } from '@/gameplay/vehicles/catalog';
import { MAHARASHTRA_SHOWROOMS } from '@/data/maharashtra/showrooms';
import { buildShowroomLayout, PLINTH_HEIGHT_M } from '@/gameplay/showroom/showroomLayout';
import { TIME_TRIAL_COURSES } from '@/gameplay/vehicles/courses';

describe('vehicle catalog integrity', () => {
  it('has the eight generic classes with unique ids and provenance notes', () => {
    const ids = VEHICLE_CATALOG.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of ['hatchback', 'sedan', 'suv', 'sports', 'bus', 'taxi', 'truck', 'rickshaw']) expect(ids).toContain(k);
    for (const v of VEHICLE_CATALOG) expect(v.note).toBe(VEHICLE_NOTE);
  });

  it('keeps every part, wheel and lamp inside the declared envelope', () => {
    for (const v of VEHICLE_CATALOG) {
      for (const p of v.parts) {
        expect(Math.abs(p.x) + p.l / 2).toBeLessThanOrEqual(v.lengthM / 2 + 0.05);
        expect(Math.abs(p.y) + p.w / 2).toBeLessThanOrEqual(v.widthM / 2 + 0.05);
        expect(p.z + p.h / 2).toBeLessThanOrEqual(v.heightM + 0.05);
        expect(p.z - p.h / 2).toBeGreaterThanOrEqual(-0.01);
      }
      for (const w of v.wheels) {
        expect(w.radiusM).toBeGreaterThan(0.15);
        expect(Math.abs(w.x)).toBeLessThan(v.lengthM / 2);
        expect(Math.abs(w.y) + w.widthM / 2).toBeLessThanOrEqual(v.widthM / 2 + 0.2);
      }
      expect(v.wheels.filter((w) => w.steers).length).toBeGreaterThanOrEqual(1);
      expect(v.wheels.length).toBeGreaterThanOrEqual(3);
      for (const l of v.lamps) expect(Math.abs(l.x)).toBeLessThanOrEqual(v.lengthM / 2 + 0.1);
      expect(v.lamps.some((l) => l.kind === 'head')).toBe(true);
      expect(v.lamps.some((l) => l.kind === 'tail')).toBe(true);
      expect(v.lamps.some((l) => l.kind === 'indicatorLeft')).toBe(true);
      expect(v.lamps.some((l) => l.kind === 'indicatorRight')).toBe(true);
    }
  });

  it('gives taxi and rickshaw a roof light and every vehicle sane drive params and audio', () => {
    expect(vehicleSpec('taxi').lamps.some((l) => l.kind === 'roof')).toBe(true);
    expect(vehicleSpec('rickshaw').lamps.some((l) => l.kind === 'roof')).toBe(true);
    for (const v of VEHICLE_CATALOG) {
      expect(v.drive.maxSpeedMs).toBeGreaterThan(10);
      expect(v.drive.accelMs2).toBeGreaterThan(1);
      expect(v.drive.eyeHeightM).toBeLessThan(v.heightM);
      expect(v.audio.maxHz).toBeGreaterThan(v.audio.idleHz);
      expect(v.audio.hornHz.length).toBeGreaterThan(0);
      expect(v.colours.length).toBeGreaterThan(0);
      expect(specSheet(v).length).toBeGreaterThanOrEqual(4);
    }
    expect(vehicleSpec('sports').drive.maxSpeedMs).toBeGreaterThan(vehicleSpec('bus').drive.maxSpeedMs);
  });

  it('rejects unknown ids', () => {
    expect(() => vehicleSpec('hovercraft' as never)).toThrow();
  });
});

describe('showroom data and layout', () => {
  it('curated showrooms are labelled approximate and fictional', () => {
    expect(MAHARASHTRA_SHOWROOMS.length).toBeGreaterThanOrEqual(4);
    for (const s of MAHARASHTRA_SHOWROOMS) {
      expect(s.source).toBe('curated');
      expect(s.dataNote).toMatch(/approximate/i);
      expect(s.name).toMatch(/fictional/i);
      expect(s.lat).toBeGreaterThan(15); expect(s.lat).toBeLessThan(22.5);
      expect(s.lon).toBeGreaterThan(72); expect(s.lon).toBeLessThan(81);
    }
    const cities = new Set(MAHARASHTRA_SHOWROOMS.map((s) => s.city));
    for (const c of ['Mumbai', 'Pune', 'Nagpur', 'Kolhapur']) expect(cities).toContain(c);
  });

  it('layout has 4+ plinths with matching stands, a reception, a workshop and a test-drive exit outside the glass', () => {
    const l = buildShowroomLayout(['hatchback', 'sedan', 'suv', 'sports', 'taxi', 'rickshaw']);
    expect(l.plinths.length).toBeGreaterThanOrEqual(4);
    expect(l.stands.length).toBe(l.plinths.length);
    for (const p of l.plinths) { expect(Math.abs(p.x)).toBeLessThan(l.floor.l / 2); expect(Math.abs(p.y)).toBeLessThan(l.floor.w / 2); }
    expect(l.blocks.filter((b) => b.id?.startsWith('plinth:')).length).toBe(l.plinths.length);
    expect(l.testDrive.x).toBeGreaterThan(l.floor.l / 2);
    expect(l.parking.length).toBeGreaterThanOrEqual(3);
    expect(l.blocks.some((b) => b.id === 'lift')).toBe(true);
    expect(PLINTH_HEIGHT_M).toBeGreaterThan(0);
    // Plinths do not overlap each other.
    for (let i = 0; i < l.plinths.length; i++) for (let j = i + 1; j < l.plinths.length; j++) {
      const a = l.plinths[i], b = l.plinths[j];
      expect(Math.abs(a.x - b.x) >= 6.5 || Math.abs(a.y - b.y) >= 3.4).toBe(true);
    }
  });

  it('fills the display with defaults when fewer than four kinds are given', () => {
    expect(buildShowroomLayout(['bus']).plinths.length).toBe(4);
  });
});

describe('time trial courses', () => {
  it('have a start, several checkpoints, an approximate/fictional note and stay near Lonavala', () => {
    for (const c of TIME_TRIAL_COURSES) {
      expect(c.checkpoints.length).toBeGreaterThanOrEqual(4);
      expect(c.note).toMatch(/approximate/i);
      expect(c.radiusM).toBeGreaterThan(5);
      for (const cp of c.checkpoints) { expect(Math.abs(cp.lat - 18.72)).toBeLessThan(0.1); expect(Math.abs(cp.lon - 73.39)).toBeLessThan(0.1); }
    }
  });
});
