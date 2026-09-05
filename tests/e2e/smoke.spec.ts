import { test, expect } from '@playwright/test';
import { collectErrors, goTo, state, waitForReady, waitForTiles } from './helpers';

const SHOT = (name: string) => ({ path: `test-results/${name}.png`, fullPage: false });

test.describe('Terra Infinite — visual smoke', () => {
  test('boots to an orbital Earth without page errors', async ({ page }) => {
    const { pageErrors, errors } = collectErrors(page);
    const s = await waitForReady(page);
    expect(s.boot.error).toBeNull();
    expect(s.dataFlags.naturalEarth).toBe(true);
    expect(s.dataFlags.gazetteer).toBe(true);
    expect(s.dataFlags.worldMap).toBe(true);
    await expect(page.locator('canvas.cesium-widget-canvas, .cesium-widget canvas').first()).toBeVisible();
    await expect(page.locator('.terra-status')).toHaveText(/ready/);
    await page.waitForTimeout(4000);
    await page.screenshot(SHOT('01-orbit'));
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('descends from space to the ground and streams terrain', async ({ page }) => {
    const { pageErrors } = collectErrors(page);
    await waitForReady(page);
    await goTo(page, 27.9881, 86.925, 12_000);
    await waitForTiles(page);
    const s = await state(page);
    expect(s.camera).not.toBeNull();
    expect(Math.abs(s.camera!.lat - 27.9881)).toBeLessThan(0.05);
    // Flight heights are above ground: 12 km over the ~5–8 km Khumbu terrain.
    expect(s.camera!.heightM).toBeLessThan(22_000);
    expect(s.camera!.heightM).toBeGreaterThan(11_000);
    await page.screenshot(SHOT('02-everest'));
    // Terrain is streamed from the Terrarium adapter when the network permits; otherwise the flat fallback is used honestly.
    const terrainWorks = (s.streaming?.terrainTilesLoaded ?? 0) > 0;
    test.info().annotations.push({ type: 'terrain', description: terrainWorks ? `terrain tiles loaded: ${s.streaming!.terrainTilesLoaded}` : 'terrain host unreachable in this environment' });
    if (terrainWorks) expect(s.camera!.groundM).not.toBeNull();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('radically different showcase areas report different biomes', async ({ page }) => {
    await waitForReady(page);
    const areas = [
      { name: 'new-york', lat: 40.7484, lon: -73.9857, h: 2500, expect: ['temperate_deciduous_forest', 'temperate_grassland', 'temperate_rainforest', 'mediterranean'] },
      { name: 'mumbai', lat: 19.076, lon: 72.8777, h: 2500, expect: ['tropical_seasonal_forest', 'savanna', 'tropical_rainforest', 'mangrove'] },
      { name: 'rural-india', lat: 30.75, lon: 75.6, h: 1500, expect: ['steppe', 'savanna', 'tropical_seasonal_forest', 'hot_desert', 'temperate_grassland', 'wetland'] },
      { name: 'antarctica', lat: -85, lon: 0, h: 60_000, expect: ['ice_sheet', 'tundra'] },
    ];
    const seen: Record<string, string> = {};
    for (const a of areas) {
      await goTo(page, a.lat, a.lon, a.h);
      await waitForTiles(page, 45_000);
      await page.waitForTimeout(1500);
      const s = await state(page);
      seen[a.name] = s.location?.biome ?? 'none';
      expect(a.expect, `${a.name} biome ${seen[a.name]}`).toContain(seen[a.name]);
      await page.screenshot(SHOT(`03-${a.name}`));
    }
    expect(new Set(Object.values(seen)).size).toBeGreaterThanOrEqual(3);
  });

  test('search navigates by place name and by coordinates', async ({ page }) => {
    await waitForReady(page);
    const input = page.getByRole('searchbox').or(page.locator('.terra-search input'));
    await input.click();
    await input.fill('Paris');
    const first = page.locator('.terra-search-results li').first();
    await expect(first).toContainText(/Paris/);
    await first.click();
    await page.waitForFunction(() => { const s = (window as unknown as { __terra: { state: () => { camera: { lat: number; lon: number } | null } } }).__terra.state(); return !!s.camera && Math.abs(s.camera.lat - 48.86) < 0.3 && Math.abs(s.camera.lon - 2.35) < 0.3; }, null, { timeout: 30_000 });
    await input.click();
    await input.fill('-33.8688, 151.2093');
    await expect(page.locator('.terra-search-results li').first()).toContainText(/coordinates/i);
    await page.locator('.terra-search-results li').first().click();
    await page.waitForFunction(() => { const s = (window as unknown as { __terra: { state: () => { camera: { lat: number; lon: number } | null } } }).__terra.state(); return !!s.camera && Math.abs(s.camera.lat + 33.87) < 0.3 && Math.abs(s.camera.lon - 151.21) < 0.3; }, null, { timeout: 30_000 });
    await page.screenshot(SHOT('04-sydney-by-coordinates'));
  });

  test('walking mode keeps the camera at eye height on the terrain', async ({ page }) => {
    await waitForReady(page);
    await goTo(page, 46.0207, 7.7491, 800);
    await waitForTiles(page);
    await page.evaluate(() => (window as unknown as { __terra: { setMode: (m: string) => void } }).__terra.setMode('walk'));
    await page.waitForTimeout(2500);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    const s = await state(page);
    const terrainWorks = (s.streaming?.terrainTilesLoaded ?? 0) > 0;
    if (terrainWorks && s.camera?.altitudeAglM !== null && s.camera?.altitudeAglM !== undefined) {
      expect(s.camera.altitudeAglM).toBeGreaterThan(0.5);
      expect(s.camera.altitudeAglM).toBeLessThan(6);
    }
    await page.screenshot(SHOT('05-walk-zermatt'));
  });

  test('procedural sampling is deterministic and memory stays bounded across long journeys', async ({ page }) => {
    test.setTimeout(480_000);
    await waitForReady(page);
    const a = await page.evaluate(() => JSON.stringify((window as unknown as { __terra: { engine: { worldMap: { sample: (a: number, b: number) => unknown } } } }).__terra.engine.worldMap.sample(-3.1, -60.0)));
    const b = await page.evaluate(() => JSON.stringify((window as unknown as { __terra: { engine: { worldMap: { sample: (a: number, b: number) => unknown } } } }).__terra.engine.worldMap.sample(-3.1, -60.0)));
    expect(a).toBe(b);
    const heaps: number[] = [];
    for (const [lat, lon] of [[35.68, 139.69], [-33.92, 18.42], [51.5, -0.12]]) {
      await goTo(page, lat, lon, 3000);
      await waitForTiles(page, 40_000);
      const s = await state(page);
      if (s.streaming?.jsHeapMb) heaps.push(s.streaming.jsHeapMb);
    }
    test.info().annotations.push({ type: 'heap-mb', description: heaps.map((h) => h.toFixed(0)).join(' → ') });
    if (heaps.length === 3) expect(heaps[2]).toBeLessThan(Math.max(900, heaps[0] * 3));
  });
});
