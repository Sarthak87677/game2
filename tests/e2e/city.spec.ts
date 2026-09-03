import { test, expect } from '@playwright/test';
import { collectErrors, goTo, state, waitForTiles } from './helpers';

/**
 * Exercises the OpenStreetMap rendering path with the synthetic fixture responder (real Overpass is often
 * unreachable in CI): buildings, roads, night windows, traffic and walking collisions.
 */
test.describe('City rendering (synthetic OSM fixture)', () => {
  test('renders buildings and roads, lights up at night, and blocks walking through walls', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors, errors } = collectErrors(page);
    await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => (window as unknown as { __terra: { engine: { setDate: (d: Date) => void } } }).__terra.engine.setDate(new Date('2026-06-21T11:00:00Z')));
    await goTo(page, 48.858, 2.35, 700);
    await waitForTiles(page, 120_000);
    await page.waitForFunction(() => (window as unknown as { __terra: { engine: { osmStatus: { loaded: number } } } }).__terra.engine.osmStatus.loaded > 0, null, { timeout: 120_000 });
    await page.waitForTimeout(8000);
    const day = await page.evaluate(() => (window as unknown as { __terra: { engine: { osmStatus: { loaded: number; failed: number }; traffic: { stats: () => { vehicles: number; lamps: number } } | null } } }).__terra.engine);
    await page.screenshot({ path: 'test-results/06-city-day.png' });
    const stats = await page.evaluate(() => { const e = (window as unknown as { __terra: { engine: { osmStatus: { loaded: number; failed: number }; traffic: { stats: () => { vehicles: number; lamps: number } } | null } } }).__terra.engine; return { osm: e.osmStatus, traffic: e.traffic?.stats() ?? null }; });
    expect(stats.osm.loaded).toBeGreaterThan(0);
    expect(stats.traffic?.vehicles ?? 0).toBeGreaterThan(0);
    void day;
    await page.evaluate(() => (window as unknown as { __terra: { engine: { setDate: (d: Date) => void } } }).__terra.engine.setDate(new Date('2026-06-21T22:30:00Z')));
    await page.waitForTimeout(6000);
    await page.screenshot({ path: 'test-results/07-city-night.png' });
    // Walk into a building: the collision sampler must report a roof height above the terrain.
    const collision = await page.evaluate(() => {
      const e = (window as unknown as { __terra: { engine: { osm: { loadedTiles: { buildings: { centroid: [number, number]; heightM: number }[] }[]; heightAt: (lat: number, lon: number) => number | null }; groundHeightAt: (lat: number, lon: number) => number | null } } }).__terra.engine;
      const b = e.osm.loadedTiles.flatMap((t) => t.buildings)[0];
      if (!b) return null;
      return { roof: e.osm.heightAt(b.centroid[1], b.centroid[0]), ground: e.groundHeightAt(b.centroid[1], b.centroid[0]), heightM: b.heightM };
    });
    expect(collision).not.toBeNull();
    expect(collision!.roof).not.toBeNull();
    if (collision!.ground !== null) expect(collision!.roof! - collision!.ground!).toBeGreaterThan(2);
    const s = await state(page);
    expect(s.boot.error).toBeNull();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    expect(errors.filter((e) => /Rendering has stopped|shader/i.test(e)), errors.join('\n')).toEqual([]);
  });
});
