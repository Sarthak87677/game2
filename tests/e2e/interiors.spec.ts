import { test, expect } from '@playwright/test';
import { collectErrors, waitForTiles } from './helpers';

/**
 * Procedural interiors for OpenStreetMap buildings (synthetic fixture city): a categorised building near the player
 * is offered at its door point, entering builds a level with rooms and labels, the plan is deterministic for the same
 * footprint, and leaving clears the collision override.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the page-side engine is driven loosely through window.__terra */
interface W { __terra: { ready: boolean; engine: any; spawn: (s: unknown) => Promise<void>; interact: () => void; gameplay: () => { prompt: { label: string } | null; status: string | null } } }

const SPAWN = { id: 'fixture-city', name: 'Fixture city', region: 'test', lat: 48.858, lon: 2.35, headingDeg: 0, description: '', dataNote: 'synthetic', approximate: true };

test('an OSM fixture building offers and builds a procedural interior', async ({ page }) => {
  test.setTimeout(900_000);
  const { pageErrors, errors } = collectErrors(page);
  await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as unknown as W).__terra?.ready === true, null, { timeout: 180_000 });
  await page.evaluate(() => (window as unknown as W).__terra.engine.setDate(new Date('2026-06-21T11:00:00Z')));
  await page.evaluate((s) => (window as unknown as W).__terra.spawn(s), SPAWN);
  await waitForTiles(page, 120_000);
  await page.waitForFunction(() => (window as unknown as W).__terra.engine.osmStatus.loaded > 0, null, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  // Pick the nearest categorised fixture building and stand at its door point (computed by the system's scan).
  const target = await page.evaluate(() => {
    const w = window as unknown as W;
    const e = w.__terra.engine;
    const sys = e.gameplay.systems.find((s: { id: string }) => s.id === 'interiors');
    const body = e.modes.bodyLatLon();
    const tile = e.osm.tileFor(body.lat, body.lon);
    if (!tile) return null;
    // Walk toward the closest building so the scan (60 m radius) can see it.
    let best: { lat: number; lon: number; d: number } | null = null;
    for (const b of tile.buildings) {
      const d = Math.hypot((b.centroid[1] - body.lat) * 111_132, (b.centroid[0] - body.lon) * 111_320 * Math.cos((body.lat * Math.PI) / 180));
      if (!best || d < best.d) best = { lat: b.centroid[1], lon: b.centroid[0], d };
    }
    if (!best) return null;
    e.gameplay.teleport(best.lat + 0.0002, best.lon);
    void sys;
    return { ...best, buildings: tile.buildings.length };
  });
  expect(target).not.toBeNull();
  expect(target!.buildings).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const door = await page.evaluate(() => {
    const w = window as unknown as W;
    const sys = w.__terra.engine.gameplay.systems.find((s: { id: string }) => s.id === 'interiors');
    const body = w.__terra.engine.modes.bodyLatLon();
    const list = sys.scan(body.lat, body.lon) as { id: string; door: { lat: number; lon: number }; source: string; category: string; name: string }[];
    const c = list.find((x) => x.source === 'osm') ?? list[0];
    return c ? { lat: c.door.lat, lon: c.door.lon, id: c.id, source: c.source, category: c.category, count: list.length } : null;
  });
  expect(door).not.toBeNull();
  expect(door!.source).toBe('osm');
  await page.evaluate(([la, lo]) => (window as unknown as W).__terra.engine.gameplay.teleport(la, lo), [door!.lat, door!.lon]);
  await page.waitForFunction(() => /\(procedural interior\)/.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 30_000 });
  const label = await page.evaluate(() => (window as unknown as W).__terra.gameplay().prompt?.label);
  expect(label).toMatch(/^Enter /);
  await page.evaluate(() => (window as unknown as W).__terra.interact());
  await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.groundOverride !== null, null, { timeout: 20_000 });
  await page.waitForTimeout(3000);
  const inside = await page.evaluate(() => {
    const w = window as unknown as W;
    const sys = w.__terra.engine.gameplay.systems.find((s: { id: string }) => s.id === 'interiors');
    const level = sys.activeLevel();
    const plan = sys.activePlan();
    return { active: !!level, floors: plan.floors.length, rooms: plan.floors[0].rooms.length, labels: level.stats().labels, seed: plan.seed, status: w.__terra.gameplay().status, category: plan.category, hero: plan.hero, origin: plan.origin, moveFilter: w.__terra.engine.modes.moveFilter !== null, room: level.roomAtPlayer() };
  });
  expect(inside.active).toBe(true);
  expect(inside.hero).toBe(false);
  expect(inside.rooms).toBeGreaterThan(0);
  expect(inside.labels).toBeGreaterThan(0);
  expect(inside.moveFilter).toBe(true);
  expect(inside.status).toContain('Generated interior — fictional, not surveyed');
  await page.evaluate(() => (window as unknown as W).__terra.engine.modes.setView('first'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/25-osm-interior.png' });
  // Exit via the interaction and re-enter: the seed (and therefore the interior) is identical.
  const exitPt = await page.evaluate(() => { const w = window as unknown as W; const sys = w.__terra.engine.gameplay.systems.find((s: { id: string }) => s.id === 'interiors'); const l = sys.activeLevel(); const e = l.plan.floors[0].exits[0]; return l.toLonLat(e.x, e.y); });
  await page.evaluate(([la, lo]) => (window as unknown as W).__terra.engine.gameplay.teleport(la, lo), [exitPt.lat, exitPt.lon]);
  await page.waitForFunction(() => /^Exit /.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 20_000 });
  await page.evaluate(() => (window as unknown as W).__terra.interact());
  await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.groundOverride === null, null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(([la, lo]) => (window as unknown as W).__terra.engine.gameplay.teleport(la, lo), [door!.lat, door!.lon]);
  await page.waitForFunction(() => /\(procedural interior\)/.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as W).__terra.interact());
  await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.groundOverride !== null, null, { timeout: 20_000 });
  const again = await page.evaluate(() => { const w = window as unknown as W; const sys = w.__terra.engine.gameplay.systems.find((s: { id: string }) => s.id === 'interiors'); const p = sys.activePlan(); return { seed: p.seed, rooms: p.floors[0].rooms.length, entered: sys.stats().entered }; });
  expect(again.seed).toBe(inside.seed);
  expect(again.rooms).toBe(inside.rooms);
  expect(again.entered).toBe(2);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(errors.filter((e) => /Rendering has stopped|Render error|shader/i.test(e)), errors.join('\n')).toEqual([]);
});
