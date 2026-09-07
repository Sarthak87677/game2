import { test, expect, type Page } from '@playwright/test';
import { collectErrors } from './helpers';

/**
 * Performance contract: the "ready" pill only after tiles loaded and the FPS gate passed, hardware detection,
 * the Diagnostics readouts + benchmark, and the adaptive degradation ladder. SwiftShader renders at a few fps, so
 * the gate is driven through `?terraMinFps=` (1 = relaxed, 1000 = never satisfiable).
 */
interface PerfState {
  boot: { phase: string; message: string; error: string | null };
  streaming: { fps: number; avgFps: number; onePercentLowFps: number; p99Ms: number; frameMs: number; tilesLoadedOnce: boolean; drawCommands: number | null; primitives: number; actors: number; globeTilesRendered: number | null; vramNote: string } | null;
  readiness: { phase: string; fpsGatePassed: boolean; fpsSustainedMs: number; blocking: string[]; degraded: string[]; minFps: number } | null;
  adaptive: { enabled: boolean; step: number; maxStep: number; stepLabel: string | null; resolutionScale: number; reason: string; minFps: number };
  hardware: { cpuCores: number | null; gpuRenderer: string; graphicsApi: string; softwareRenderer: boolean; vram: string; maxTextureSize: number | null; screen: { width: number; height: number; devicePixelRatio: number } } | null;
  dataFlags: { naturalEarth: boolean; worldMap: boolean; gazetteer: boolean };
}

const sample = (page: Page) => page.evaluate(() => {
  const t = (window as unknown as { __terra?: { ready: boolean; state: () => PerfState } }).__terra;
  const pill = document.querySelector('.terra-status')?.textContent ?? '';
  return { ready: t?.ready ?? false, pill, s: t?.state() ?? null };
});

test.describe('Performance contract', () => {
  test('the ready pill appears only after tiles loaded once and the FPS gate passed; hardware is recorded', async ({ page }) => {
    test.setTimeout(300_000);
    const { pageErrors } = collectErrors(page);
    await page.goto('/?terraQuality=low&terraMinFps=1', { waitUntil: 'load' });
    const history: { t: number; ready: boolean; pill: string; phase: string; tilesOnce: boolean; gate: boolean }[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      const x = await sample(page);
      if (x.s) history.push({ t: Date.now() - t0, ready: x.ready, pill: x.pill, phase: x.s.boot.phase, tilesOnce: x.s.streaming?.tilesLoadedOnce ?? false, gate: x.s.readiness?.fpsGatePassed ?? false });
      if (x.ready) break;
      await page.waitForTimeout(250);
    }
    const first = history.findIndex((h) => h.pill === 'ready');
    expect(first, 'pill never became ready').toBeGreaterThanOrEqual(0);
    // Never "ready" while the phase was not ready, and at the moment it turned ready both gates were satisfied.
    for (const h of history) if (h.pill === 'ready') expect(h.phase).toBe('ready');
    expect(history[first].tilesOnce).toBe(true);
    expect(history[first].gate).toBe(true);
    for (const h of history.slice(0, first)) { expect(h.ready).toBe(false); expect(h.pill).not.toBe('ready'); }
    // There was a visible streaming / warming-up phase before ready.
    expect(history.slice(0, first).some((h) => /Streaming…|Warming up|Loading|Climate|place index/i.test(h.pill))).toBe(true);
    const { s } = await sample(page);
    expect(s!.boot.error).toBeNull();
    expect(s!.readiness!.fpsGatePassed).toBe(true);
    expect(s!.readiness!.blocking).toEqual([]);
    expect(s!.readiness!.minFps).toBe(1);
    // Hardware block (perf contract #1).
    expect(s!.hardware).not.toBeNull();
    expect(s!.hardware!.gpuRenderer.length).toBeGreaterThan(3);
    expect(s!.hardware!.graphicsApi).toMatch(/WebGL2/);
    expect(s!.hardware!.vram).toMatch(/not exposed by WebGL/);
    expect(s!.hardware!.screen.width).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'hardware', description: `${s!.hardware!.cpuCores} cores · ${s!.hardware!.gpuRenderer} · ${s!.hardware!.graphicsApi}` });
    // Streaming snapshot carries the new frame statistics (perf contract #2).
    expect(s!.streaming!.avgFps).toBeGreaterThan(0);
    expect(s!.streaming!.p99Ms).toBeGreaterThan(0);
    expect(s!.streaming!.onePercentLowFps).toBeGreaterThan(0);
    expect(s!.streaming!.vramNote).toBe('not exposed by WebGL');
    expect(s!.streaming!.drawCommands === null || s!.streaming!.drawCommands >= 0).toBe(true);
    test.info().annotations.push({ type: 'boot', description: `ready after ${(history[first].t / 1000).toFixed(1)} s; degraded: ${s!.readiness!.degraded.join(' | ') || 'none'}` });
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('the pill stays on "Warming up" while the FPS gate is unsatisfied, and the ladder degrades then restores', async ({ page }) => {
    test.setTimeout(300_000);
    const { pageErrors } = collectErrors(page);
    await page.goto('/?terraQuality=low&terraMinFps=1000', { waitUntil: 'load' });
    // Wait for every data layer and the globe tiles, so only the FPS gate can be blocking.
    await page.waitForFunction(() => {
      const t = (window as unknown as { __terra?: { state: () => PerfState } }).__terra;
      const s = t?.state();
      return !!s && s.dataFlags.naturalEarth && s.dataFlags.worldMap && s.dataFlags.gazetteer && !!s.streaming?.tilesLoadedOnce;
    }, null, { timeout: 200_000 });
    await page.waitForTimeout(6000);
    const x = await sample(page);
    expect(x.ready).toBe(false);
    expect(x.s!.boot.phase).toBe('data');
    expect(x.pill).toMatch(/Warming up \([\d.]+ fps\)/);
    expect(x.pill).not.toBe('ready');
    expect(x.s!.readiness!.fpsGatePassed).toBe(false);
    expect(x.s!.readiness!.blocking.join(' ')).toMatch(/Warming up/);
    await page.screenshot({ path: 'test-results/perf-warming-up.png' });

    // Adaptive ladder (perf contract #3): activate it by hand (it normally starts at "ready") with minFps 1000 so
    // every sample is "too slow": one rung per 2 s, resolution untouched until rung 6, then 0.9 → 0.5 × preset.
    const before = await page.evaluate(() => (window as unknown as { __terra: { engine: { viewer: { resolutionScale: number } } } }).__terra.engine.viewer.resolutionScale);
    expect(before).toBeCloseTo(0.75, 5);
    await page.evaluate(() => (window as unknown as { __terra: { engine: { adaptive: { setActive: (a: boolean) => void } } } }).__terra.engine.adaptive.setActive(true));
    await page.waitForFunction(() => (window as unknown as { __terra: { state: () => PerfState } }).__terra.state().adaptive.step >= 3, null, { timeout: 60_000 });
    let a = (await sample(page)).s!.adaptive;
    expect(a.enabled).toBe(true);
    expect(a.stepLabel).toBeTruthy();
    expect(a.resolutionScale).toBeCloseTo(0.75, 5); // rungs 1–5 never touch resolution
    await page.waitForFunction(() => (window as unknown as { __terra: { state: () => PerfState } }).__terra.state().adaptive.step >= 7, null, { timeout: 60_000 });
    // Read the store readout and the live viewer in one evaluate: the ladder is still stepping every 2 s.
    const during = await page.evaluate(() => {
      const t = (window as unknown as { __terra: { state: () => PerfState; engine: { viewer: { resolutionScale: number }; effectiveQuality: () => { oceanReflections: boolean; vegetationDensity: number; trafficDensity: number; nearFieldRadiusM: number; resolutionScale: number } } } }).__terra;
      return { adaptive: t.state().adaptive, res: t.engine.viewer.resolutionScale, q: t.engine.effectiveQuality() };
    });
    expect(during.adaptive.step).toBeGreaterThanOrEqual(7);
    expect(during.adaptive.resolutionScale).toBeLessThanOrEqual(0.75 * 0.8 + 1e-6);
    expect(during.adaptive.resolutionScale).toBeGreaterThanOrEqual(0.75 * 0.5 - 1e-6);
    expect(during.res).toBeCloseTo(during.q.resolutionScale, 5);
    expect(during.q.oceanReflections).toBe(false);
    expect(during.q.vegetationDensity).toBeCloseTo(0.15, 5);
    expect(during.q.trafficDensity).toBeCloseTo(0.3, 5);
    expect(during.q.nearFieldRadiusM).toBe(180);
    const logged = await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { diagnostics: { message: string }[] } } }).__terraStore.getState().diagnostics.filter((d) => /Adaptive quality/.test(d.message)).length);
    expect(logged).toBeGreaterThanOrEqual(7);
    // Settings toggle off → everything restored to the preset.
    await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { setSettings: (p: { protectFrameRate: boolean }) => void } } }).__terraStore.getState().setSettings({ protectFrameRate: false }));
    await page.waitForFunction(() => (window as unknown as { __terra: { state: () => PerfState } }).__terra.state().adaptive.step === 0, null, { timeout: 20_000 });
    const after = await page.evaluate(() => { const e = (window as unknown as { __terra: { engine: { viewer: { resolutionScale: number }; effectiveQuality: () => { oceanReflections: boolean; vegetationDensity: number } } } }).__terra.engine; return { res: e.viewer.resolutionScale, q: e.effectiveQuality() }; });
    expect(after.res).toBeCloseTo(0.75, 5);
    expect(after.q.oceanReflections).toBe(true);
    expect(after.q.vegetationDensity).toBeCloseTo(0.3, 5);
    expect((await sample(page)).s!.adaptive.enabled).toBe(false);
    await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { setSettings: (p: { protectFrameRate: boolean }) => void } } }).__terraStore.getState().setSettings({ protectFrameRate: true }));
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('Diagnostics shows the performance, hardware and readiness blocks and runs the benchmark', async ({ page }) => {
    test.setTimeout(300_000);
    const { pageErrors } = collectErrors(page);
    await page.goto('/?terraQuality=low&terraMinFps=1', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 240_000 });
    await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { setUi: (p: { panel: string }) => void } } }).__terraStore.getState().setUi({ panel: 'diagnostics' }));
    const perf = page.getByTestId('perf-grid');
    await expect(perf).toBeVisible();
    await expect(perf).toContainText('FPS (current)');
    await expect(perf).toContainText('FPS (1 % low)');
    await expect(perf).toContainText('p99');
    await expect(perf).toContainText('not exposed by WebGL');
    await expect(perf).toContainText('Active tiles');
    await expect(perf).toContainText('Actors');
    await expect(perf).toContainText('Draw calls');
    await expect(page.getByTestId('adaptive-step')).toContainText(/\d+\/10/);
    const hw = page.getByTestId('hardware-grid');
    await expect(hw).toContainText('logical cores');
    await expect(hw).toContainText('Graphics API');
    await expect(hw).toContainText('WebGL2');
    await expect(page.locator('.terra-panel-body')).toContainText('FPS gate');
    await expect(page.locator('.terra-panel-body')).toContainText('passed');
    // Benchmark: the button runs 20 s; the same API is called with a short duration to keep the test fast.
    await expect(page.getByRole('button', { name: /Benchmark \(20 s\)/ })).toBeEnabled();
    const result = await page.evaluate(() => (window as unknown as { __terra: { benchmark: (s: number) => Promise<{ kind: string; frames: { frames: number; p99Ms: number; avgFps: number }; hardware: { softwareRenderer: boolean } | null; note: string } > } }).__terra.benchmark(4));
    expect(result.kind).toBe('terra-benchmark');
    expect(result.frames.frames).toBeGreaterThan(0);
    expect(result.frames.p99Ms).toBeGreaterThan(0);
    const logLine = await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { diagnostics: { message: string }[] } } }).__terraStore.getState().diagnostics.map((d) => d.message).find((m) => m.startsWith('benchmark {')));
    expect(logLine).toBeTruthy();
    expect(JSON.parse(logLine!.slice('benchmark '.length)).kind).toBe('terra-benchmark');
    await expect(page.locator('.terra-log')).toContainText('terra-benchmark');
    test.info().annotations.push({ type: 'benchmark', description: `${result.frames.frames} frames · avg ${result.frames.avgFps.toFixed(1)} fps · p99 ${result.frames.p99Ms.toFixed(0)} ms · ${result.note}` });
    await page.screenshot({ path: 'test-results/perf-diagnostics.png' });
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
