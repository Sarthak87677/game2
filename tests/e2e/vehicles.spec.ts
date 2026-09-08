import { test, expect } from '@playwright/test';
import { collectErrors, state } from './helpers';

/**
 * Vehicles track: spawn at the Gateway of India (synthetic OSM fixtures) → enter the nearest parked vehicle → drive
 * for 5 s → speed > 0, gear D, cameras/lamps respond → stop and exit → walk mode; ambient traffic has junctions,
 * signals, pedestrians and lent 3D bodies; the Worli showroom builds, its inspect overlay opens and a test drive
 * puts the player in the driver's seat.
 */
type Snap = { active: string | null; camera: string; gear: string; speedMs: number; parkedNear: number; parked: { kind: string; lat: number; lon: number; headingDeg: number }[]; indicator: string; headlights: boolean; damage: number };
type W = { __terra: { spawn: (s: unknown) => Promise<void>; interact: () => void; gameplay: () => { prompt: { id: string; label: string } | null; overlay: { title: string; actions: { id: string }[]; note?: string } | null; vehicle: { speedKmh: number; gear: string; headingDeg?: number; destination?: { name: string } | null } | null; status: string | null }; engine: { modes: { getMode: () => string }; traffic: { stats: () => Record<string, number> } | null; gameplay: { teleport: (lat: number, lon: number, h?: number) => void; chooseOverlayAction: (id: string) => void; systems: { id: string; snapshot: () => unknown; command: (c: string) => void }[] }; setDate: (d: Date) => void } } };

const GATEWAY = { id: 'gateway-of-india', name: 'Gateway of India, Mumbai', region: 'Mumbai', lat: 18.9218, lon: 72.834, headingDeg: 90, description: '', dataNote: '', approximate: true };
const WORLI = { id: 'showroom-worli', name: 'Seaface Motors showroom, Worli', region: 'Mumbai', lat: 19.009, lon: 72.8168, headingDeg: 90, description: '', dataNote: '', approximate: true };

const vehicles = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.systems.find((s) => s.id === 'vehicles')!.snapshot() as Snap);

test.describe('Vehicles (synthetic OSM fixture)', () => {
  test('enter the nearest parked vehicle at the Gateway, drive, cycle cameras and lamps, exit to walk mode', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors, errors } = collectErrors(page);
    await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => (window as unknown as W).__terra.engine.setDate(new Date('2026-06-21T09:00:00Z')));
    await page.evaluate((s) => (window as unknown as W).__terra.spawn(s), GATEWAY);
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'walk', null, { timeout: 60_000 });
    // Parked vehicles appear once their ground height resolves.
    await page.waitForFunction(() => ((window as unknown as W).__terra.engine.gameplay.systems.find((s) => s.id === 'vehicles')!.snapshot() as Snap).parked.length >= 3, null, { timeout: 60_000 });
    const before = await vehicles(page);
    expect(before.parked.length).toBeGreaterThanOrEqual(3);
    const target = before.parked[0];
    await page.evaluate(([lat, lon, h]) => (window as unknown as W).__terra.engine.gameplay.teleport(lat + 0.00002, lon - 0.00002, h), [target.lat, target.lon, target.headingDeg]);
    await page.waitForFunction(() => /^Enter /.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 10_000 });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'drive', null, { timeout: 10_000 });
    const entered = await vehicles(page);
    expect(entered.active).toBe(target.kind);
    expect(entered.gear).toBe('P');
    // Drive forward for 5 s.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(5000);
    const driving = await vehicles(page);
    const hud = await page.evaluate(() => (window as unknown as W).__terra.gameplay().vehicle);
    await page.screenshot({ path: 'test-results/10-vehicle-driving.png' });
    expect(driving.speedMs).toBeGreaterThan(0.5);
    expect(driving.gear).toBe('D');
    expect(hud).not.toBeNull();
    expect(hud!.speedKmh).toBeGreaterThan(1);
    expect(hud!.headingDeg).toBeDefined();
    // Cameras (C twice → dashboard), left indicator, headlights.
    await page.evaluate(() => { const v = (window as unknown as W).__terra.engine.gameplay.systems.find((s) => s.id === 'vehicles')!; v.command('camera'); v.command('camera'); v.command('left'); v.command('headlights'); });
    await page.waitForTimeout(800);
    const dash = await vehicles(page);
    expect(dash.camera).toBe('dashboard');
    expect(dash.indicator).toBe('left');
    expect(dash.headlights).toBe(true);
    await page.screenshot({ path: 'test-results/11-vehicle-dashboard.png' });
    await page.keyboard.up('KeyW');
    // Handbrake to a stop, then E exits next to the door.
    await page.keyboard.down('Space');
    await page.waitForTimeout(3000);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => (window as unknown as W).__terra.gameplay().prompt?.label === 'Exit vehicle', null, { timeout: 15_000 });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'walk', null, { timeout: 10_000 });
    const after = await vehicles(page);
    expect(after.active).toBeNull();
    expect(await page.evaluate(() => (window as unknown as W).__terra.gameplay().vehicle)).toBeNull();
    // Ambient traffic upgrade: junctions with signals, pedestrians and 3D bodies near the player.
    const traffic = await page.evaluate(() => (window as unknown as W).__terra.engine.traffic?.stats() ?? null);
    expect(traffic).not.toBeNull();
    expect(traffic!.vehicles).toBeGreaterThan(0);
    expect(traffic!.intersections).toBeGreaterThan(0);
    expect(traffic!.signals).toBeGreaterThan(0);
    expect(traffic!.simulated).toBeGreaterThan(0);
    // Traffic's own walkers stand down when the crowd system is registered (it owns pedestrians then).
    const crowds = await page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.systems.some((s) => s.id === 'crowds'));
    if (!crowds) expect(traffic!.pedestrians).toBeGreaterThan(0);
    expect(traffic!.bodies3d).toBeGreaterThan(0);
    const s = await state(page);
    expect(s.boot.error).toBeNull();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    expect(errors.filter((e) => /Rendering has stopped|shader|Gameplay/i.test(e)), errors.join('\n')).toEqual([]);
  });

  test('showroom builds at Worli, inspect overlay opens with cameras, test drive seats the player', async ({ page }) => {
    test.setTimeout(600_000);
    const { pageErrors } = collectErrors(page);
    await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => (window as unknown as W).__terra.engine.setDate(new Date('2026-06-21T09:00:00Z')));
    await page.evaluate((s) => (window as unknown as W).__terra.spawn(s), WORLI);
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'walk', null, { timeout: 60_000 });
    type SR = { built: string[]; inspecting: string | null; plinths: { lat: number; lon: number }[] };
    const showroom = () => page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.systems.find((s) => s.id === 'showroom')!.snapshot() as SR);
    await page.waitForFunction(() => ((window as unknown as W).__terra.engine.gameplay.systems.find((s) => s.id === 'showroom')!.snapshot() as SR).built.includes('worli'), null, { timeout: 60_000 });
    const sr = await showroom();
    expect(sr.plinths.length).toBeGreaterThanOrEqual(4);
    const p = sr.plinths[1];
    await page.evaluate(([lat, lon]) => (window as unknown as W).__terra.engine.gameplay.teleport(lat, lon + 0.00003, 270), [p.lat, p.lon]);
    await page.waitForFunction(() => /^Inspect /.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/12-showroom-floor.png' });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => !!(window as unknown as W).__terra.gameplay().overlay, null, { timeout: 5000 });
    const overlay = await page.evaluate(() => (window as unknown as W).__terra.gameplay().overlay);
    expect(overlay!.title).toMatch(/^Inspect — /);
    expect(overlay!.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['orbit', 'interior', 'dashboard', 'cinematic', 'testdrive']));
    expect(overlay!.note).toMatch(/Original showroom interior/);
    await expect(page.locator('.terra-overlay-card')).toBeVisible();
    await page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.chooseOverlayAction('orbit'));
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'cinematic', null, { timeout: 5000 });
    expect((await showroom()).inspecting).toBe('orbit');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/13-showroom-orbit.png' });
    // Back to the cameras overlay, then a test drive.
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => !!(window as unknown as W).__terra.gameplay().overlay, null, { timeout: 5000 });
    await page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.chooseOverlayAction('testdrive'));
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.getMode() === 'drive', null, { timeout: 15_000 });
    const snap = await vehicles(page);
    expect(snap.active).toBe('sedan');
    await page.waitForFunction(() => !!(window as unknown as W).__terra.gameplay().vehicle?.destination, null, { timeout: 15_000 });
    const hud = await page.evaluate(() => (window as unknown as W).__terra.gameplay().vehicle);
    expect(hud?.destination?.name).toMatch(/return/);
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
