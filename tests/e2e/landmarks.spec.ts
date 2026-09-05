import { test, expect } from '@playwright/test';
import { collectErrors, waitForReady, waitForTiles } from './helpers';

/** Landmark stand-ins appear at their measured positions and are labelled as procedural interpretations. */
test('the Eiffel Tower stand-in renders near its real position', async ({ page }) => {
  test.setTimeout(420_000);
  const { pageErrors } = collectErrors(page);
  await waitForReady(page);
  // 650 m south of the tower, 250 m up, looking north so the stand-in fills the frame.
  await page.evaluate(() => (window as unknown as { __terra: { goTo: (a: number, b: number, c: number, h?: number, p?: number) => Promise<boolean> } }).__terra.goTo(48.8525, 2.2945, 250, 0, -18));
  await waitForTiles(page, 120_000);
  await page.waitForFunction(() => (window as unknown as { __terra: { engine: { landmarks: { stats: () => { visible: number } } } } }).__terra.engine.landmarks.stats().visible >= 1, null, { timeout: 60_000 });
  await page.waitForTimeout(6000);
  const stats = await page.evaluate(() => (window as unknown as { __terra: { engine: { landmarks: { stats: () => { visible: number; total: number } } } } }).__terra.engine.landmarks.stats());
  await page.screenshot({ path: 'test-results/10-eiffel-standin.png' });
  expect(stats.visible).toBeGreaterThanOrEqual(1);
  expect(stats.total).toBeGreaterThanOrEqual(30);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
