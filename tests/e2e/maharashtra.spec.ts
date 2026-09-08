import { test, expect } from '@playwright/test';
import { collectErrors, waitForReady, waitForTiles } from './helpers';

// Not intersected with Window: TerraEngine's global declaration types state()/gameplay() as unknown.
interface TerraWindow {
  __terra: {
    goTo: (lat: number, lon: number, h: number, heading?: number, pitch?: number) => Promise<boolean>;
    spawn: (s: unknown) => Promise<void>;
    gameplay: () => { player: { spawned: boolean; spawnId: string | null }; prompt: { id: string; label: string } | null };
    state: () => { camera: { lat: number; lon: number; heightM: number; altitudeAglM: number | null; groundM: number | null } | null };
    engine: {
      search: (q: string, limit?: number) => Promise<{ id: string; name: string; lat: number; lon: number; kind: string; score: number }[]>;
      landmarks: { stats: () => { visible: number; total: number } };
      gameplay: { systems: { id: string; stats?: () => Record<string, string | number> }[]; interact: () => void };
      modes: { bodyLatLon: () => { lat: number; lon: number }; getMode: () => string };
      groundHeightAt: (lat: number, lon: number) => number | null;
    };
  };
}

const tajStats = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as TerraWindow).__terra.engine.gameplay.systems.find((s) => s.id === 'taj-mahal')?.stats?.() ?? null);

/** Named Maharashtra places must resolve offline through TerraEngine.search (gazetteer + MaharashtraIndex). */
test('search resolves named Maharashtra places offline', async ({ page }) => {
  const { pageErrors } = collectErrors(page);
  await waitForReady(page);
  const queries: [string, number, number][] = [
    ['Kolhapur', 16.705, 74.2433], ['CSMT', 18.9398, 72.8355], ['Ganpatipule', 17.1461, 73.2653], ['SGIS', 16.7335, 74.4015],
    ['Gateway of India', 18.922, 72.8347], ['Shaniwar Wada', 18.5195, 73.8553], ['Deekshabhoomi', 21.1287, 79.0656], ['Ajanta', 20.5519, 75.7033],
    ['Mahabaleshwar', 17.9237, 73.6586], ['Taj Mahal', 27.1751, 78.0421], ['Sindhudurg fort', 16.0447, 73.4625], ['Bandra Worli Sea Link', 19.0367, 72.8169],
  ];
  let resolved = 0;
  for (const [q, lat, lon] of queries) {
    const results = await page.evaluate((query) => (window as unknown as TerraWindow).__terra.engine.search(query, 8), q);
    const hit = results.find((r) => Math.abs(r.lat - lat) < 0.03 && Math.abs(r.lon - lon) < 0.03);
    test.info().annotations.push({ type: 'search', description: `${q} → ${results[0]?.name ?? 'no result'} (${results.length})` });
    if (hit) resolved += 1;
    expect(hit, `${q} should resolve near ${lat},${lon}; got ${results.map((r) => r.name).join(' | ')}`).toBeDefined();
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
  }
  expect(resolved).toBeGreaterThanOrEqual(8);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

/** Flying to Agra streams the Taj Mahal hero primitives and its height sampler answers on the platform. */
test('goTo Taj Mahal streams the hero reconstruction', async ({ page }) => {
  test.setTimeout(420_000);
  const { pageErrors } = collectErrors(page);
  await waitForReady(page);
  // From the Great Gate looking north over the garden at the mausoleum.
  await page.evaluate(() => (window as unknown as TerraWindow).__terra.goTo(27.1712, 78.0421, 60, 0, -12));
  await waitForTiles(page, 120_000);
  await page.waitForFunction(() => {
    const s = (window as unknown as TerraWindow).__terra.engine.gameplay.systems.find((x) => x.id === 'taj-mahal')?.stats?.();
    return !!s && s.streamed === 'yes';
  }, null, { timeout: 90_000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/11-taj-mahal-gate.png' });
  const stats = await tajStats(page);
  expect(stats).not.toBeNull();
  expect(stats!.primitives).toBeGreaterThanOrEqual(5);
  expect(Number(stats!.vertices)).toBeGreaterThan(10_000);
  // The hero must own the Taj: the generic landmark layer skips the old stand-in.
  const landmarks = await page.evaluate(() => (window as unknown as TerraWindow).__terra.engine.landmarks.stats());
  expect(landmarks.total).toBeGreaterThanOrEqual(50);
  // Walk on the platform: spawn near the plinth's south edge and check the body stands on the marble level.
  await page.evaluate(() => (window as unknown as TerraWindow).__terra.spawn({ id: 'taj-plinth', name: 'Taj Mahal plinth', region: 'Agra', lat: 27.17472, lon: 78.0421, headingDeg: 0, description: 'e2e', dataNote: 'e2e', approximate: true }));
  await page.waitForTimeout(3000);
  const onPlinth = await page.evaluate(() => {
    const t = (window as unknown as TerraWindow).__terra;
    const b = t.engine.modes.bodyLatLon();
    const stats = t.engine.gameplay.systems.find((x) => x.id === 'taj-mahal')?.stats?.();
    return { mode: t.engine.modes.getMode(), body: b, ground: t.engine.groundHeightAt(b.lat, b.lon), base: stats?.['base m'], cam: t.state().camera };
  });
  expect(onPlinth.mode).toBe('walk');
  expect(typeof onPlinth.base).toBe('number');
  // The camera (third person, ~3 m above the body) must be above the marble plinth level (base + 8 m).
  expect(onPlinth.cam!.heightM).toBeGreaterThan(Number(onPlinth.base) + 8);
  await page.screenshot({ path: 'test-results/12-taj-mahal-plinth.png' });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

/** Spawning at the Gateway of India lands the walker on the ground with the stand-in nearby. */
test('spawn at Gateway of India lands on the ground', async ({ page }) => {
  test.setTimeout(420_000);
  const { pageErrors } = collectErrors(page);
  await waitForReady(page);
  await page.evaluate(() => (window as unknown as TerraWindow).__terra.spawn({ id: 'gateway-of-india', name: 'Gateway of India, Mumbai', region: 'Mumbai', lat: 18.9218, lon: 72.8340, headingDeg: 90, description: 'e2e', dataNote: 'e2e', approximate: true }));
  await waitForTiles(page, 120_000);
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => {
    const t = (window as unknown as TerraWindow).__terra;
    const b = t.engine.modes.bodyLatLon();
    return { mode: t.engine.modes.getMode(), gameplay: t.gameplay(), body: b, ground: t.engine.groundHeightAt(b.lat, b.lon), cam: t.state().camera, landmarks: t.engine.landmarks.stats() };
  });
  await page.screenshot({ path: 'test-results/13-gateway-of-india-spawn.png' });
  expect(s.mode).toBe('walk');
  expect(s.gameplay.player.spawned).toBe(true);
  expect(s.gameplay.player.spawnId).toBe('gateway-of-india');
  expect(Math.abs(s.body.lat - 18.9218)).toBeLessThan(0.001);
  expect(Math.abs(s.body.lon - 72.8340)).toBeLessThan(0.001);
  // Third-person camera sits a few metres above the body, which stands on the terrain (or the ellipsoid offline).
  expect(s.cam!.altitudeAglM === null || (s.cam!.altitudeAglM > 0.5 && s.cam!.altitudeAglM < 40)).toBe(true);
  expect(s.landmarks.visible).toBeGreaterThanOrEqual(1);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
