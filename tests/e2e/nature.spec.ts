import { test, expect } from '@playwright/test';
import { collectErrors, goTo, state, waitForReady, waitForTiles } from './helpers';

interface NearFieldStats { tiles: number; treeInstances: number; grassInstances: number; rockInstances: number; buildings: number; fields: number }

async function nearFieldStats(page: import('@playwright/test').Page): Promise<NearFieldStats | null> {
  return page.evaluate(() => {
    const e = (window as unknown as { __terra: { engine: { nearField?: { stats: () => NearFieldStats } } } }).__terra.engine;
    return e.nearField ? e.nearField.stats() : null;
  });
}

/**
 * Ground-level nature: approaching the ground in a temperate forest area produces procedural trees whose
 * placements are deterministic; polar and desert areas produce none or few.
 */
test.describe('Procedural nature', () => {
  test('trees appear near the ground in a temperate forest and not on the Antarctic plateau', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors } = collectErrors(page);
    await waitForReady(page);
    await page.evaluate(() => (window as unknown as { __terra: { engine: { setDate: (d: Date) => void } } }).__terra.engine.setDate(new Date('2026-09-10T10:00:00Z')));
    // Black Forest, Germany — temperate deciduous/mixed forest, no OSM in CI.
    await goTo(page, 48.35, 8.2, 180);
    await waitForTiles(page, 120_000);
    await page.waitForFunction(() => {
      const e = (window as unknown as { __terra: { engine: { nearField?: { stats: () => NearFieldStats } } } }).__terra.engine;
      const s = e.nearField?.stats();
      return !!s && s.tiles > 0 && s.treeInstances > 0;
    }, null, { timeout: 180_000 });
    await page.waitForTimeout(6000);
    const forest = await nearFieldStats(page);
    await page.screenshot({ path: 'test-results/08-forest-ground.png' });
    expect(forest!.treeInstances).toBeGreaterThan(50);
    // Determinism: regenerate the same tile and compare placement digests.
    const digests = await page.evaluate(async () => {
      const e = (window as unknown as { __terra: { engine: { generateNearFieldTile: (z: number, x: number, y: number) => Promise<{ placements: { x: number; y: number; species: string }[] } | null> } } }).__terra.engine;
      const z = 16, x = 34260, y = 22685; // Black Forest spot (48.35 N, 8.2 E)
      const a = await e.generateNearFieldTile(z, x, y);
      const b = await e.generateNearFieldTile(z, x, y);
      const digest = (t: { placements: { x: number; y: number; species: string }[] } | null) => (t ? t.placements.slice(0, 200).map((p) => `${p.species}:${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|') : 'null');
      return { a: digest(a), b: digest(b), count: a?.placements.length ?? 0 };
    });
    expect(digests.count).toBeGreaterThan(0);
    expect(digests.a).toBe(digests.b);
    // Antarctic plateau: nothing grows.
    await goTo(page, -80, 80, 150);
    await waitForTiles(page, 90_000);
    await page.waitForTimeout(8000);
    const polar = await nearFieldStats(page);
    await page.screenshot({ path: 'test-results/09-antarctica-ground.png' });
    expect(polar!.treeInstances).toBe(0);
    const s = await state(page);
    expect(s.boot.error).toBeNull();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
