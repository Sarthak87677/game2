import { test, expect } from '@playwright/test';
import { collectErrors, state, waitForReady, waitForTiles } from './helpers';

/** The Play panel and the spawn flow: the player becomes a walking character at a Maharashtra spawn point. */
test.describe('Play — spawn as a player', () => {
  test('spawns at the Gateway of India, walks, and switches views without errors', async ({ page }) => {
    test.setTimeout(360_000);
    const { pageErrors, errors } = collectErrors(page);
    await waitForReady(page);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('heading', { name: 'Play — Maharashtra' })).toBeVisible();
    const buttons = page.locator('.terra-list-btn');
    expect(await buttons.count()).toBeGreaterThanOrEqual(8);
    await buttons.filter({ hasText: 'Gateway of India' }).first().click();
    await page.waitForFunction(() => {
      const st = (window as unknown as { __terraStore: { getState: () => { mode: { mode: string }; gameplay: { player: { spawned: boolean } } } } }).__terraStore.getState();
      return st.mode.mode === 'walk' && st.gameplay.player.spawned;
    }, null, { timeout: 120_000 });
    await waitForTiles(page, 60_000);
    const before = await state(page);
    expect(before.camera).not.toBeNull();
    expect(Math.abs(before.camera!.lat - 18.9218)).toBeLessThan(0.01);
    expect(Math.abs(before.camera!.lon - 72.834)).toBeLessThan(0.01);
    // Walk forward for a moment; the body must move.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    const after = await state(page);
    const movedM = Math.hypot((after.camera!.lat - before.camera!.lat) * 111_000, (after.camera!.lon - before.camera!.lon) * 111_000 * Math.cos((18.92 * Math.PI) / 180));
    expect(movedM).toBeGreaterThan(0.5);
    // Third person and back; the gameplay slice reports the spawn.
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(800);
    const gp = await page.evaluate(() => (window as unknown as { __terra: { gameplay: () => { player: { spawnName: string | null } } } }).__terra.gameplay());
    expect(gp.player.spawnName).toContain('Gateway of India');
    await page.screenshot({ path: 'test-results/play-gateway-third-person.png' });
    await page.keyboard.press('KeyV');
    const diag = (await state(page)).diagnostics.filter((d) => d.level === 'error' && !/fetch|Overpass|Nominatim|network/i.test(d.message));
    expect(diag.map((d) => d.message), 'no runtime errors while spawned').toEqual([]);
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
    // The build stamp is rendered so screenshots identify their build.
    await expect(page.locator('.terra-attribution .mono')).toHaveText(/build [0-9a-f]{7}/);
  });
});
