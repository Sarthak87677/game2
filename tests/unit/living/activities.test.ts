import { describe, expect, it } from 'vitest';
import { bearingDeg, headingDiffDeg, reachedItems, scorePhoto } from '@/gameplay/activities/scoring';
import { clearProgress, emptyProgress, loadProgress, saveProgress, STORAGE_KEY, totalPoints, type StorageLike } from '@/gameplay/activities/persistence';
import { ballAt, HOOP_HEIGHT_M, idealSpeed, RELEASE_HEIGHT_M, simulateThrow } from '@/gameplay/activities/basketball';
import { COLLECTIBLE_LANDMARKS, PHOTO_CHALLENGES, CINEMATIC_TOURS, JOURNEY_CHECKLISTS, BOAT_COURSES, MUSEUMS, CLEANUP_PARKS, CROWD_HOTSPOTS, inMaharashtra } from '@/data/maharashtra';

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('photo scoring', () => {
  it('computes bearings and heading differences', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 3);
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 3);
    expect(headingDiffDeg(350, 10)).toBe(20);
    expect(headingDiffDeg(10, 350)).toBe(20);
    expect(headingDiffDeg(90, 270)).toBe(180);
  });

  it('rejects far or badly aimed shots and rewards good ones', () => {
    const base = { distM: 100, standRadiusM: 250, headingDiffDeg: 5, toleranceDeg: 40, points: 10, goldenHour: false, sunElevationDeg: 40, inFrustum: true };
    expect(scorePhoto(base).ok).toBe(true);
    expect(scorePhoto(base).score).toBe(9);
    expect(scorePhoto({ ...base, headingDiffDeg: 0 }).score).toBe(10);
    expect(scorePhoto({ ...base, headingDiffDeg: 40 }).score).toBe(5);
    expect(scorePhoto({ ...base, headingDiffDeg: 41 }).ok).toBe(false);
    expect(scorePhoto({ ...base, distM: 300 }).ok).toBe(false);
    expect(scorePhoto({ ...base, inFrustum: false }).ok).toBe(false);
    expect(scorePhoto({ ...base, inFrustum: null }).ok).toBe(true);
  });

  it('gives a golden-hour bonus only for challenges that ask for it', () => {
    const base = { distM: 50, standRadiusM: 250, headingDiffDeg: 0, toleranceDeg: 40, points: 10, goldenHour: true, sunElevationDeg: 3, inFrustum: true };
    expect(scorePhoto(base)).toMatchObject({ ok: true, score: 15, golden: true });
    expect(scorePhoto({ ...base, sunElevationDeg: 45 }).score).toBe(10);
    expect(scorePhoto({ ...base, goldenHour: false }).score).toBe(10);
  });

  it('ticks checklist items in reach', () => {
    const items = [{ id: 'a', lat: 0, lon: 0, radiusM: 100 }, { id: 'b', lat: 0.01, lon: 0, radiusM: 100 }];
    const flat = (a: number, b: number, c: number, d: number) => Math.hypot((a - c) * 111_132, (b - d) * 111_320);
    expect(reachedItems(items, new Set(), 0, 0, flat)).toEqual(['a']);
    expect(reachedItems(items, new Set(['a']), 0, 0, flat)).toEqual([]);
    expect(reachedItems(items, new Set(), 0.01, 0, flat)).toEqual(['b']);
  });
});

describe('activity persistence', () => {
  it('round-trips progress through storage and totals points', () => {
    const store = new MemoryStorage();
    expect(loadProgress(store)).toEqual(emptyProgress());
    const p = emptyProgress();
    p.photos['photo-gateway'] = { score: 10, at: '2026-09-07T00:00:00Z' };
    p.landmarks['lm-gateway'] = '2026-09-07T00:00:00Z';
    p.observations.crow = { label: 'House crow', count: 2, at: '2026-09-07T00:00:00Z' };
    p.checklists['rail-mumbai-pune'] = ['csmt', 'dadar'];
    p.cleanup['cleanup-campus'] = ['cleanup-campus:0'];
    p.basketball = { attempts: 5, made: 2, best: 2, streak: 0 };
    p.courses['boat-harbour'] = { completed: 1, bestMs: 90_000 };
    expect(saveProgress(p, store)).toBe(true);
    expect(loadProgress(store)).toEqual(p);
    expect(totalPoints(p)).toBe(10 + 5 + 3 + 4 + 4 + 4 + 10);
    clearProgress(store);
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(loadProgress(store)).toEqual(emptyProgress());
  });

  it('ignores corrupt or foreign versions and works without storage', () => {
    const store = new MemoryStorage();
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 7, photos: { x: 1 } }));
    expect(loadProgress(store)).toEqual(emptyProgress());
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(saveProgress(emptyProgress(), null)).toBe(false);
  });
});

describe('basketball model', () => {
  it('lands the ideal shot in the hoop and misses when aimed away', () => {
    const d = 4.6;
    const v = idealSpeed(d);
    // The ideal speed brings the ball to hoop height on the way down at the hoop distance.
    let landing = 0;
    for (let t = 0; t < 3; t += 0.001) { const p = ballAt(v, t, 0, 1); if (t > 0.3 && Math.abs(p.z - HOOP_HEIGHT_M) < 0.02 && p.x > d * 0.5) { landing = p.x; break; } }
    expect(landing).toBeCloseTo(d, 0);
    expect(ballAt(v, 0, 0, 1).z).toBe(RELEASE_HEIGHT_M);
    let made = 0;
    for (let s = 1; s <= 60; s++) if (simulateThrow({ distM: d, aimErrorDeg: 0, seed: s }).made) made++;
    expect(made).toBeGreaterThan(15);
    expect(made).toBeLessThan(60);
    for (let s = 1; s <= 20; s++) expect(simulateThrow({ distM: d, aimErrorDeg: 25, seed: s }).made).toBe(false);
    expect(simulateThrow({ distM: d, aimErrorDeg: 0, seed: 3 })).toEqual(simulateThrow({ distM: d, aimErrorDeg: 0, seed: 3 }));
  });
});

describe('living-world data', () => {
  it('has unique ids, approximate notes and lies inside Maharashtra (except nothing here is external)', () => {
    const ids = new Set<string>();
    const all = [...PHOTO_CHALLENGES, ...COLLECTIBLE_LANDMARKS, ...CINEMATIC_TOURS, ...JOURNEY_CHECKLISTS, ...BOAT_COURSES, ...MUSEUMS, ...CLEANUP_PARKS, ...CROWD_HOTSPOTS];
    for (const x of all) { expect(ids.has(x.id), x.id).toBe(false); ids.add(x.id); expect(x.dataNote.length).toBeGreaterThan(10); }
    for (const x of [...PHOTO_CHALLENGES, ...COLLECTIBLE_LANDMARKS, ...MUSEUMS, ...CLEANUP_PARKS, ...CROWD_HOTSPOTS]) expect(inMaharashtra(x.lat, x.lon), x.id).toBe(true);
    for (const t of CINEMATIC_TOURS) expect(t.keyframes.length).toBeGreaterThanOrEqual(3);
    for (const m of MUSEUMS) expect(m.dataNote).toMatch(/fictional/i);
  });
});
