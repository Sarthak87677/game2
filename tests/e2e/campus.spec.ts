import { test, expect, type Page } from '@playwright/test';
import { collectErrors, waitForTiles } from './helpers';
import { SGIS_CAMPUS, campusBuildingById, campusBuildingDoor } from '../../src/data/maharashtra/campus';
import { offsetToLonLat } from '../../src/util/geo';

/**
 * Hero campus + procedural interiors: spawn at the campus, walk to the academic block, enter it (groundOverride
 * active, room labels present), climb the stairs to the first floor, ride the elevator, exit, and check that the
 * interior/campus notes are shown and no render errors occur. Runs against the synthetic OSM fixture, low quality.
 */
const SPAWN = { id: 'sgis-campus', name: 'SGIS-inspired campus, Atigre (Kolhapur)', region: 'Kolhapur', lat: SGIS_CAMPUS.origin.lat, lon: SGIS_CAMPUS.origin.lon, headingDeg: 20, description: '', dataNote: 'test', approximate: true };

/* eslint-disable @typescript-eslint/no-explicit-any -- the page-side engine is driven loosely through window.__terra */
interface W { __terra: { ready: boolean; engine: any; spawn: (s: unknown) => Promise<void>; interact: () => void; gameplay: () => { prompt: { label: string } | null; overlay: { actions: { id: string }[] } | null; status: string | null } } }

const doorOf = (id: string) => { const b = campusBuildingById(id)!; const [e, n] = campusBuildingDoor(b); return offsetToLonLat(SGIS_CAMPUS.origin.lat, SGIS_CAMPUS.origin.lon, e, n); };

async function teleport(page: Page, lat: number, lon: number, heading?: number): Promise<void> {
  await page.evaluate(([la, lo, h]) => (window as unknown as W).__terra.engine.gameplay.teleport(la, lo, h), [lat, lon, heading] as [number, number, number | undefined]);
  await page.waitForTimeout(700);
}

/** Holds Shift+W in short bursts until the predicate on the interior state holds or the time runs out. */
async function walkUntil(page: Page, done: (s: Awaited<ReturnType<typeof interiorState>>) => boolean, maxMs: number): Promise<Awaited<ReturnType<typeof interiorState>>> {
  const t0 = Date.now();
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  let s = await interiorState(page);
  try {
    while (!done(s) && Date.now() - t0 < maxMs) { await page.waitForTimeout(600); s = await interiorState(page); }
  } finally {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  }
  return s;
}

async function promptLabel(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as W).__terra.gameplay().prompt?.label ?? null);
}

async function interiorState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as W;
    const s = sysIn(w);
    const level = s.activeLevel();
    return { active: !!level, override: w.__terra.engine.modes.groundOverride !== null, moveFilter: w.__terra.engine.modes.moveFilter !== null, floor: level ? level.floorIndex() : null, floorName: level ? level.floor().name : null, z: level ? level.player.z : null, labels: level ? level.stats().labels : 0, room: level ? level.roomAtPlayer() : null, status: w.__terra.gameplay().status, stats: s.stats() };
    function sysIn(w: W) { return w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); }
  });
}

test.describe('SGIS-inspired campus and procedural interiors', () => {
  test('spawn → enter academic block → stairs to floor 1 → elevator → exit', async ({ page }) => {
    test.setTimeout(900_000);
    const { pageErrors, errors } = collectErrors(page);
    await page.goto('/?terraFixtures=1&terraQuality=low', { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as W).__terra?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => (window as unknown as W).__terra.engine.setDate(new Date('2026-02-10T09:30:00Z')));
    await page.evaluate((s) => (window as unknown as W).__terra.spawn(s), SPAWN);
    await waitForTiles(page, 120_000);
    await page.waitForFunction(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); return s?.campus.placed === true; }, null, { timeout: 120_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-results/20-campus-entrance.png' });
    const gate = await interiorState(page);
    expect(gate.active).toBe(false);
    expect(gate.status).toContain('fictionalised campus');

    // Walk up to the academic block door: the prompt must offer the procedural interior.
    const door = doorOf('academic-a');
    await teleport(page, door.lat, door.lon, 0);
    await page.waitForFunction(() => /Enter Academic block A/.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 20_000 });
    expect(await promptLabel(page)).toContain('(procedural interior)');
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => { const w = window as unknown as W; return w.__terra.engine.modes.groundOverride !== null; }, null, { timeout: 20_000 });
    await page.waitForTimeout(2500);
    const inside = await interiorState(page);
    expect(inside.active).toBe(true);
    expect(inside.override).toBe(true);
    expect(inside.moveFilter).toBe(true);
    expect(inside.floor).toBe(0);
    expect(inside.labels).toBeGreaterThan(0);
    expect(inside.status).toContain('Generated interior — fictional, not surveyed');
    expect(inside.status).toContain('not the school');
    // The plan has the handcrafted rooms and every door is linked or decorative.
    const plan = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const p = s.activePlan(); return { hero: p.hero, floors: p.floors.length, rooms: p.floors[0].rooms.map((r: { label: string }) => r.label), doorsOk: p.floors.every((f: { doors: { links: unknown; decorative: boolean }[] }) => f.doors.every((d) => d.decorative || d.links)), terrace: p.floors[p.floors.length - 1].kind, floorH: p.floorHeightM }; });
    expect(plan.hero).toBe(true);
    expect(plan.rooms).toContain('Classroom G1');
    expect(plan.doorsOk).toBe(true);
    expect(plan.terrace).toBe('terrace');
    // Corridor view.
    const corr = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const c = l.plan.floors[0].corridors[0].rect; const st = l.plan.floors[0].stairs[0]; const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2; const p = l.toLonLat(cx, cy); return { ...p, cx, cy, nearX: st.nearX, farX: st.farX, yA: (st.laneA.y0 + st.laneA.y1) / 2, yB: (st.laneB.y0 + st.laneB.y1) / 2 }; });
    await page.evaluate(([la, lo]) => { const w = window as unknown as W; w.__terra.engine.modes.setView('first'); w.__terra.engine.gameplay.teleport(la, lo); }, [corr.lat, corr.lon]);
    // Face along the corridor toward the stairs (building −x when the core is at the west end).
    const faceStairs = await page.evaluate(([nx, cx]) => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const f = l.frame; const c = Math.cos(f.rotationRad), sn = Math.sin(f.rotationRad); const dx = Math.sign(nx - cx), dy = 0; const east = dx * c - dy * sn, north = dx * sn + dy * c; const h = Math.atan2(east, north); w.__terra.engine.modes.setHeading(h); return h; }, [corr.nearX, corr.cx]);
    expect(Number.isFinite(faceStairs)).toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/21-campus-corridor.png' });

    // Stairs: stand at the mouth of lane A, walk up to the landing, cross to lane B, walk up to floor 1.
    const laneA = await page.evaluate(([nx, y]) => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); return s.activeLevel().toLonLat(nx, y); }, [corr.nearX, corr.yA]);
    await teleport(page, laneA.lat, laneA.lon);
    const headingUp = await page.evaluate(([nx, fx]) => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const f = s.activeLevel().frame; const dx = Math.sign(fx - nx); const east = dx * Math.cos(f.rotationRad), north = dx * Math.sin(f.rotationRad); const h = Math.atan2(east, north); w.__terra.engine.modes.setHeading(h); return h; }, [corr.nearX, corr.farX]);
    expect(Number.isFinite(headingUp)).toBe(true);
    const mid = await walkUntil(page, (s) => (s.z ?? 0) >= plan.floorH * 0.5 - 0.15, 40_000);
    expect(mid.z!).toBeGreaterThan(plan.floorH * 0.5 - 0.2);
    expect(mid.z!).toBeLessThan(plan.floorH * 0.5 + 0.2);
    const laneB = await page.evaluate(([fx, y]) => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); return s.activeLevel().toLonLat(fx, y); }, [corr.farX, corr.yB]);
    await teleport(page, laneB.lat, laneB.lon);
    await page.evaluate((h) => (window as unknown as W).__terra.engine.modes.setHeading(h + Math.PI), headingUp);
    await walkUntil(page, (s) => (s.z ?? 0) >= plan.floorH - 0.1 && s.floor === 1, 40_000);
    await page.waitForTimeout(800);
    const up = await interiorState(page);
    expect(up.floor).toBe(1);
    expect(up.z!).toBeGreaterThan(plan.floorH - 0.3);
    expect(up.status).toContain('First floor');

    // Classroom on the first floor.
    const classroom = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const r = l.plan.floors[1].rooms.find((x: { kind: string }) => x.kind === 'classroom'); const p = l.toLonLat((r.rect.x0 + r.rect.x1) / 2, r.rect.y0 + 1.2); return { ...p, label: r.label }; });
    await teleport(page, classroom.lat, classroom.lon);
    await page.evaluate(() => { const w = window as unknown as W; w.__terra.engine.modes.setHeading(0); });
    await page.waitForTimeout(1500);
    const inRoom = await interiorState(page);
    expect(inRoom.floor).toBe(1);
    expect(inRoom.room).toBe(classroom.label);
    await page.screenshot({ path: 'test-results/22-campus-classroom.png' });

    // Elevator: call it from the lobby, choose the third floor (index 3), arrive there.
    const lobby = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const el = l.plan.floors[1].elevators[0]; return l.toLonLat(el.lobby.x, el.lobby.y); });
    await teleport(page, lobby.lat, lobby.lon);
    await page.waitForFunction(() => /Call elevator/.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 20_000 });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => !!(window as unknown as W).__terra.gameplay().overlay, null, { timeout: 10_000 });
    const overlay = await page.evaluate(() => (window as unknown as W).__terra.gameplay().overlay);
    expect(overlay!.actions.some((a) => a.id === 'floor-3')).toBe(true);
    await page.evaluate(() => (window as unknown as W).__terra.engine.gameplay.chooseOverlayAction('floor-3'));
    await page.waitForFunction(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); return s.activeLevel()?.floorIndex() === 3; }, null, { timeout: 15_000 });
    const top = await interiorState(page);
    expect(top.floor).toBe(3);
    expect(top.status).toContain('Third floor');

    // Fall protection: a simulated 10 m fall fades and returns the player to a recorded safe point.
    await page.waitForTimeout(3500);
    const respawn = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); w.__terra.engine.modes.onFall(10); return s.stats().fallRespawns; });
    expect(respawn).toBe(1);

    // Exit through the ground-floor door: the override is cleared and the player stands outside.
    await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); s.rideTo(0); });
    await page.waitForFunction(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); return s.activeLevel()?.floorIndex() === 0; }, null, { timeout: 15_000 });
    const exitPt = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const e = l.plan.floors[0].exits[0]; return l.toLonLat(e.x, e.y); });
    await teleport(page, exitPt.lat, exitPt.lon);
    await page.waitForFunction(() => /^Exit /.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 20_000 });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.groundOverride === null, null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const outside = await interiorState(page);
    expect(outside.active).toBe(false);
    expect(outside.moveFilter).toBe(false);
    expect(outside.stats.entered).toBe(1);

    // Library hall (handcrafted single-space layout) and its terrace.
    const lib = doorOf('library');
    await teleport(page, lib.lat, lib.lon, 270);
    await page.waitForFunction(() => /Enter Library/.test((window as unknown as W).__terra.gameplay().prompt?.label ?? ''), null, { timeout: 20_000 });
    await page.evaluate(() => (window as unknown as W).__terra.interact());
    await page.waitForFunction(() => (window as unknown as W).__terra.engine.modes.groundOverride !== null, null, { timeout: 20_000 });
    await page.waitForTimeout(2500);
    const library = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const r = l.plan.floors[0].rooms[0]; const p = l.toLonLat(r.rect.x0 + 3, (r.rect.y0 + r.rect.y1) / 2); w.__terra.engine.gameplay.teleport(p.lat, p.lon); const f = l.frame; w.__terra.engine.modes.setHeading(Math.atan2(Math.cos(f.rotationRad), Math.sin(f.rotationRad))); return { label: r.label, corridors: l.plan.floors[0].corridors.length }; });
    expect(library.label).toContain('Library');
    expect(library.corridors).toBe(0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/23-campus-library.png' });
    const terraceIdx = await page.evaluate(() => { const w = window as unknown as W; const s = w.__terra.engine.gameplay.systems.find((x: { id: string }) => x.id === 'interiors'); const l = s.activeLevel(); const t = l.plan.floors[l.plan.floors.length - 1]; l.forceReference(t.index); const p = l.toLonLat((l.plan.usable.x0 + l.plan.usable.x1) / 2, (l.plan.usable.y0 + l.plan.usable.y1) / 2); w.__terra.engine.modes.setBody(p.lat, p.lon, 200, l.baseHeightM + t.z); return t.index; });
    await page.waitForTimeout(2000);
    const terrace = await interiorState(page);
    expect(terrace.floor).toBe(terraceIdx);
    expect(terrace.floorName).toBe('Terrace');
    await page.screenshot({ path: 'test-results/24-campus-terrace.png' });

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    expect(errors.filter((e) => /Rendering has stopped|Render error|shader/i.test(e)), errors.join('\n')).toEqual([]);
    const diag = await page.evaluate(() => (window as unknown as W).__terra.engine ? (window as unknown as { __terra: { state: () => { diagnostics: { level: string; message: string }[] } } }).__terra.state().diagnostics : []);
    expect(diag.filter((d) => d.level === 'error' && /Gameplay|Render error|Interaction/.test(d.message)).map((d) => d.message)).toEqual([]);
  });
});
