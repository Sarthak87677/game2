import { test, expect } from '@playwright/test';
import { collectErrors, state } from './helpers';

/**
 * Living world and activities, driven through window.__terra with the synthetic OSM fixture: crowds at Marine Drive,
 * the basketball interaction at the campus, and a scored photography challenge at the Gateway of India.
 */
type Stats = Record<string, string | number>;

const spawn = (page: import('@playwright/test').Page, id: string, lat: number, lon: number, headingDeg: number) =>
  page.evaluate(([i, la, lo, h]) => (window as unknown as { __terra: { spawn: (s: unknown) => Promise<void> } }).__terra.spawn({ id: i, name: String(i), region: 'Maharashtra', lat: la, lon: lo, headingDeg: h, description: '', dataNote: 'test', approximate: true }), [id, lat, lon, headingDeg] as const);

const stats = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __terra: { engine: { gameplay: { stats: () => Stats } } } }).__terra.engine.gameplay.stats());

test.describe('Living world and activities (synthetic OSM fixture)', () => {
  test('crowds appear at Marine Drive, basketball is offered at the campus, and a photo scores at the Gateway', async ({ page }) => {
    test.setTimeout(900_000);
    const { pageErrors } = collectErrors(page);
    await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => { try { localStorage.removeItem('terra-infinite.activities.v1'); } catch { /* ignore */ } });
    // Late afternoon in July: monsoon preset, busy promenade.
    await page.evaluate(() => (window as unknown as { __terra: { engine: { setDate: (d: Date) => void } } }).__terra.engine.setDate(new Date('2026-07-15T12:30:00Z')));

    // 1) Marine Drive: pedestrians simulated around the player, wildlife present, monsoon preset applied.
    await spawn(page, 'marine-drive', 18.9432, 72.8236, 340);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __terra: { engine: { gameplay: { stats: () => Stats } } } }).__terra.engine.gameplay.stats();
      return Number(s['Crowds: pedestrians']) > 0;
    }, null, { timeout: 120_000 });
    await page.waitForTimeout(4000);
    const marine = await stats(page);
    expect(Number(marine['Crowds: pedestrians'])).toBeGreaterThan(0);
    expect(Number(marine['Crowds: pedestrians'])).toBeLessThanOrEqual(120);
    expect(String(marine['Crowds: place'])).toContain('promenade');
    expect(String(marine['Wildlife: birds'])).toMatch(/gull|crow|pigeon/);
    expect(String(marine['Season: preset'])).toMatch(/^monsoon/);
    expect(String(marine['Activities: landmarks'])).toMatch(/^[1-9]/);
    await page.screenshot({ path: 'test-results/10-living-marine-drive.png' });

    // 2) Campus: the basketball interaction is offered on spawn; at the free-throw line a throw is scored.
    await spawn(page, 'sgis-campus', 16.7335, 74.4015, 20);
    await page.waitForFunction(() => {
      const g = (window as unknown as { __terra: { gameplay: () => { prompt: { id: string } | null } } }).__terra.gameplay();
      return !!g.prompt && g.prompt.id.startsWith('basketball');
    }, null, { timeout: 60_000 });
    const promptAtSpawn = await page.evaluate(() => (window as unknown as { __terra: { gameplay: () => { prompt: { id: string; label: string } | null } } }).__terra.gameplay().prompt);
    expect(promptAtSpawn?.id).toMatch(/^basketball/);
    await page.evaluate(() => (window as unknown as { __terra: { interact: () => void } }).__terra.interact()); // walk over to the court
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => { prompt: { id: string } | null } } }).__terra.gameplay().prompt?.id === 'basketball', null, { timeout: 30_000 });
    const throwResult = await page.evaluate(() => {
      const e = (window as unknown as { __terra: { engine: { gameplay: { systems: { id: string; throwBasketball?: () => { made: boolean; reason: string } }[] } } } }).__terra.engine;
      const a = e.gameplay.systems.find((s) => s.id === 'activities')!;
      return a.throwBasketball!();
    });
    expect(typeof throwResult.made).toBe('boolean');
    expect(throwResult.reason.length).toBeGreaterThan(0);
    const campus = await stats(page);
    expect(String(campus['Activities: court'])).toBe('built');
    expect(String(campus['Activities: basketball'])).toMatch(/\/1$/);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/11-living-basketball.png' });

    // 3) Gateway of India: face the arch and press P — the challenge scores and persists.
    await spawn(page, 'gateway-of-india', 18.9218, 72.8340, 90);
    await page.waitForTimeout(2000);
    const photo = await page.evaluate(() => {
      const w = window as unknown as { __terra: { engine: { modes: { setHeading: (r: number) => void; setView: (v: string) => void }; gameplay: { systems: { id: string; takePhoto?: () => { ok: boolean; score: number; reason: string } }[] } } } };
      w.__terra.engine.modes.setView('first');
      // Bearing from the spawn to the arch is ~73°.
      w.__terra.engine.modes.setHeading((73 * Math.PI) / 180);
      return new Promise<{ ok: boolean; score: number; reason: string }>((resolve) => setTimeout(() => {
        const a = w.__terra.engine.gameplay.systems.find((s) => s.id === 'activities')!;
        resolve(a.takePhoto!());
      }, 800));
    });
    expect(photo.ok, photo.reason).toBe(true);
    expect(photo.score).toBeGreaterThan(0);
    // Facing away must not score.
    const away = await page.evaluate(() => {
      const w = window as unknown as { __terra: { engine: { modes: { setHeading: (r: number) => void }; gameplay: { systems: { id: string; takePhoto?: () => { ok: boolean } }[] } } } };
      w.__terra.engine.modes.setHeading((253 * Math.PI) / 180);
      return new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve(w.__terra.engine.gameplay.systems.find((s) => s.id === 'activities')!.takePhoto!()), 800));
    });
    expect(away.ok).toBe(false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terra-infinite.activities.v1') ?? '{}') as { photos?: Record<string, { score: number }> });
    expect(saved.photos?.['photo-gateway']?.score).toBe(photo.score);
    const gp = await page.evaluate(() => (window as unknown as { __terra: { gameplay: () => { status: string | null } } }).__terra.gameplay());
    expect(gp.status ?? '').toContain('📷');
    await page.screenshot({ path: 'test-results/12-living-gateway-photo.png' });

    const s = await state(page);
    expect(s.boot.error).toBeNull();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    const gameplayErrors = s.diagnostics.filter((d) => d.level === 'error' && /Gameplay|Interaction|Overlay/.test(d.message));
    expect(gameplayErrors, JSON.stringify(gameplayErrors)).toEqual([]);
  });
});
