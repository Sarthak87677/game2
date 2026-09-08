import { test, expect, type Page } from '@playwright/test';
import { collectErrors, state } from './helpers';

/**
 * Passenger journeys driven through window.__terra: rail (CSMT → Pune intercity), air (BOM → PNQ) and the Gateway ↔
 * Mandwa ferry. Every journey is time-compressed and uses the overlay's "Skip to arrival" so the spec stays within CI
 * budgets on software WebGL; the terrain host is often unreachable in CI, in which case tracks lie on the ellipsoid.
 */
type Gameplay = { prompt: { id: string; label: string } | null; overlay: { title: string; actions: { id: string; label: string; disabled?: boolean }[] } | null; status: string | null };

async function ready(page: Page): Promise<void> {
  await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 180_000 });
  await page.evaluate(() => (window as unknown as { __terra: { engine: { setDate: (d: Date) => void } } }).__terra.engine.setDate(new Date('2026-09-10T09:30:00Z')));
}

async function spawnAt(page: Page, id: string, lat: number, lon: number, headingDeg: number): Promise<void> {
  await page.evaluate(([i, la, lo, h]) => (window as unknown as { __terra: { spawn: (s: unknown) => Promise<void> } }).__terra.spawn({ id: i, name: String(i), region: 'Maharashtra', lat: la, lon: lo, headingDeg: h, description: '', dataNote: 'approximate', approximate: true }), [id, lat, lon, headingDeg] as const);
  await page.waitForFunction(() => (window as unknown as { __terra: { engine: { modes: { getMode: () => string } } } }).__terra.engine.modes.getMode() === 'walk', null, { timeout: 60_000 });
}

const gameplay = (page: Page) => page.evaluate(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay());
const interact = (page: Page) => page.evaluate(() => (window as unknown as { __terra: { interact: () => void } }).__terra.interact());
const choose = (page: Page, id: string) => page.evaluate((a) => (window as unknown as { __terra: { engine: { gameplay: { chooseOverlayAction: (id: string) => void } } } }).__terra.engine.gameplay.chooseOverlayAction(a), id);
const mode = (page: Page) => page.evaluate(() => (window as unknown as { __terra: { engine: { modes: { getMode: () => string } } } }).__terra.engine.modes.getMode());

async function waitPrompt(page: Page, re: RegExp, timeout = 60_000): Promise<string> {
  await page.waitForFunction((src) => { const g = (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay(); return !!g.prompt && new RegExp(src).test(g.prompt.label); }, re.source, { timeout });
  return (await gameplay(page)).prompt!.label;
}

async function waitOverlay(page: Page, re: RegExp, timeout = 30_000): Promise<Gameplay['overlay']> {
  await page.waitForFunction((src) => { const g = (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay(); return !!g.overlay && new RegExp(src).test(g.overlay.title); }, re.source, { timeout });
  return (await gameplay(page)).overlay;
}

async function waitStatus(page: Page, re: RegExp, timeout = 60_000): Promise<string> {
  await page.waitForFunction((src) => { const g = (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay(); return !!g.status && new RegExp(src).test(g.status); }, re.source, { timeout });
  return (await gameplay(page)).status!;
}

test.describe('Passenger journeys', () => {
  test('rail: CSMT → ticket → board → aboard status → skip → leave at Pune', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors } = collectErrors(page);
    await ready(page);
    await spawnAt(page, 'csmt', 18.94, 72.8353, 180);
    expect(await waitPrompt(page, /Enter station · Chhatrapati Shivaji Maharaj Terminus/)).toBeTruthy();
    await interact(page);
    const board = await waitOverlay(page, /next departures/);
    const pune = board!.actions.find((a) => /Pune/.test(a.label));
    expect(pune, board!.actions.map((a) => a.label).join(', ')).toBeDefined();
    await choose(page, pune!.id);
    const ticket = await waitOverlay(page, /^Ticket$/);
    expect(ticket!.actions.some((a) => a.id === 'wait')).toBe(true);
    await choose(page, 'wait');
    await waitStatus(page, /Waiting for|arriving/);
    // The train approaches along the corridor, stops with the doors open and offers boarding.
    expect(await waitPrompt(page, /^Board .* to Pune Junction/, 180_000)).toMatch(/Board/);
    await page.screenshot({ path: 'test-results/20-rail-platform.png' });
    await interact(page);
    await waitOverlay(page, /^Board /);
    await choose(page, 'window');
    await page.waitForFunction(() => (window as unknown as { __terra: { engine: { modes: { getMode: () => string } } } }).__terra.engine.modes.getMode() === 'passenger', null, { timeout: 20_000 });
    const aboard = await waitStatus(page, /^Aboard .* → Pune Junction/);
    expect(aboard).toMatch(/Aboard/);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-results/21-rail-window.png' });
    await waitPrompt(page, /Journey options/);
    await interact(page);
    await waitOverlay(page, /^Aboard /);
    await choose(page, 'skip');
    const arrived = await waitOverlay(page, /Arrived at Pune Junction/);
    expect(arrived).not.toBeNull();
    await choose(page, 'leave');
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay().status === null, null, { timeout: 20_000 });
    expect(await mode(page)).toBe('walk');
    const s = await state(page);
    expect(Math.abs(s.camera!.lat - 18.5285)).toBeLessThan(0.01);
    expect(Math.abs(s.camera!.lon - 73.8745)).toBeLessThan(0.01);
    expect(await waitPrompt(page, /Departure board · Pune Junction/)).toBeTruthy();
    await page.screenshot({ path: 'test-results/22-rail-pune.png' });
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('air: BOM terminal → check-in → security → gate → board → skip → leave at PNQ', async ({ page }) => {
    test.setTimeout(480_000);
    const { pageErrors } = collectErrors(page);
    await ready(page);
    await spawnAt(page, 'bom', 19.0975, 72.8745, 180);
    expect(await waitPrompt(page, /Enter terminal · BOM/)).toBeTruthy();
    await interact(page);
    await waitOverlay(page, /departures/);
    await choose(page, 'to-pnq');
    await waitOverlay(page, /Check-in/);
    await choose(page, 'window');
    await waitOverlay(page, /Security/);
    await choose(page, 'go');
    await waitOverlay(page, /Gate \d+/);
    await choose(page, 'board');
    const aboard = await waitStatus(page, /^Aboard TI \d+ BOM → PNQ · taxiing/);
    expect(aboard).toContain('BOM → PNQ');
    expect(await mode(page)).toBe('passenger');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/23-air-taxi.png' });
    // Jump to cruise for the cabin/window screenshot, then skip to arrival.
    await page.evaluate(() => (window as unknown as { __terra: { engine: { gameplay: { systems: { id: string; debugJump?: (f: number) => void }[] } } } }).__terra.engine.gameplay.systems.find((s) => s.id === 'air')!.debugJump!(0.5));
    await waitStatus(page, /cruising/);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/24-air-cruise.png' });
    await waitPrompt(page, /Flight options/);
    await interact(page);
    await waitOverlay(page, /^Aboard TI/);
    await choose(page, 'skip');
    await waitOverlay(page, /Arrived at PNQ/);
    await choose(page, 'leave');
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay().status === null, null, { timeout: 20_000 });
    expect(await mode(page)).toBe('walk');
    const s = await state(page);
    expect(Math.abs(s.camera!.lat - 18.579)).toBeLessThan(0.01);
    expect(Math.abs(s.camera!.lon - 73.908)).toBeLessThan(0.01);
    expect(await waitPrompt(page, /Enter terminal · PNQ/)).toBeTruthy();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('marine: Gateway ferry → deck camera → skip → Mandwa; speedboat course; cruise decks move with the ship', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors } = collectErrors(page);
    await ready(page);
    await spawnAt(page, 'gateway', 18.9218, 72.834, 90);
    expect(await waitPrompt(page, /Board ferry to Mandwa jetty/)).toBeTruthy();
    await interact(page);
    await waitOverlay(page, /Ferry ticket/);
    await choose(page, 'deck');
    const aboard = await waitStatus(page, /Aboard the Gateway–Mandwa ferry → Mandwa jetty/);
    expect(aboard).toContain('Mandwa');
    expect(await mode(page)).toBe('passenger');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-results/25-ferry-deck.png' });
    await waitPrompt(page, /Ferry options/);
    await interact(page);
    await waitOverlay(page, /Ferry to Mandwa/);
    await choose(page, 'skip');
    await waitOverlay(page, /Arrived at Mandwa jetty/);
    await choose(page, 'leave');
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay().status === null, null, { timeout: 20_000 });
    expect(await mode(page)).toBe('walk');
    let s = await state(page);
    expect(Math.abs(s.camera!.lat - 18.803)).toBeLessThan(0.005);
    expect(Math.abs(s.camera!.lon - 72.883)).toBeLessThan(0.005);
    // Speedboat course from Mandwa: drive mode on water with a capped speed; the first buoy is reached by throttling.
    await page.evaluate(() => { const e = (window as unknown as { __terra: { engine: { gameplay: { systems: { id: string; interactions: (c: unknown) => { id: string; run: () => void }[] }[]; player: () => unknown } } } }).__terra.engine; const m = e.gameplay.systems.find((x) => x.id === 'marine')!; m.interactions({ player: e.gameplay.player() }).find((i) => i.id.startsWith('speedboat'))!.run(); });
    await waitOverlay(page, /speedboat/i);
    await choose(page, 'go');
    await waitStatus(page, /Speedboat course · buoy 1\/8/);
    expect(await mode(page)).toBe('drive');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(5000);
    await page.keyboard.up('KeyW');
    const speed = await page.evaluate(() => (window as unknown as { __terraStore: { getState: () => { mode: { groundSpeedMs: number } } } }).__terraStore.getState().mode.groundSpeedMs);
    expect(speed).toBeGreaterThan(5);
    expect(speed).toBeLessThanOrEqual(16.8);
    await page.screenshot({ path: 'test-results/26-speedboat.png' });
    await interact(page); // end the course → back on the jetty
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay().status === null, null, { timeout: 20_000 });
    expect(await mode(page)).toBe('walk');
    // Cruise ship at Ballard Pier: board, walk on the promenade deck while the ship sails, then dock and disembark.
    await spawnAt(page, 'ballard', 18.944, 72.842, 90);
    expect(await waitPrompt(page, /Board the cruise ship/)).toBeTruthy();
    await interact(page);
    await waitOverlay(page, /Cruise boarding pass/);
    await choose(page, 'board');
    await waitStatus(page, /Aboard MV Terra Konkan/);
    expect(await mode(page)).toBe('walk');
    await page.waitForTimeout(12_000);
    const dbg = await page.evaluate(() => (window as unknown as { __terra: { engine: { gameplay: { systems: { id: string; debug?: () => { cruise: { s: number; playerZ: number; place: string } | null } }[] } } } }).__terra.engine.gameplay.systems.find((x) => x.id === 'marine')!.debug!());
    expect(dbg.cruise).not.toBeNull();
    expect(dbg.cruise!.s).toBeGreaterThan(50);
    expect(Math.abs(dbg.cruise!.playerZ - 8)).toBeLessThan(0.6);
    expect(dbg.cruise!.place).toContain('Promenade');
    s = await state(page);
    // The walker has been carried away from the pier by the moving ship.
    expect(Math.hypot((s.camera!.lat - 18.944) * 111_000, (s.camera!.lon - 72.842) * 105_000)).toBeGreaterThan(40);
    await page.screenshot({ path: 'test-results/27-cruise-deck.png' });
    await waitPrompt(page, /Cruise options/);
    await interact(page);
    await waitOverlay(page, /MV Terra Konkan/);
    await choose(page, 'skip');
    await waitStatus(page, /docked at/);
    await interact(page);
    await waitOverlay(page, /MV Terra Konkan/);
    await choose(page, 'disembark');
    await page.waitForFunction(() => (window as unknown as { __terra: { gameplay: () => Gameplay } }).__terra.gameplay().status === null, null, { timeout: 20_000 });
    s = await state(page);
    expect(Math.abs(s.camera!.lat - 18.944)).toBeLessThan(0.005);
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
