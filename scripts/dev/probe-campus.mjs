#!/usr/bin/env node
/**
 * Scripted screenshots of the SGIS-inspired campus and its procedural interiors for docs/screenshots/.
 * Usage: node scripts/dev/probe-campus.mjs [url] [outDir]
 * Needs the fixture dev server: TERRA_FIXTURES=1 npx vite --host 127.0.0.1 --port 5179
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';
const [url = 'http://127.0.0.1:5179/?terraFixtures=1&terraQuality=low', outDir = 'docs/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const browser = await chromium.launch({ executablePath: process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), headless: true, proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('[error] ' + m.text().slice(0, 300)); });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__terra?.ready === true, null, { timeout: 200000 });
console.log('ready');
await page.evaluate(() => window.__terra.engine.setDate(new Date('2026-02-10T09:30:00Z')));
await page.evaluate(() => window.__terra.engine.setUi?.({ hidden: true }));
await page.evaluate(() => window.__terra.spawn({ id: 'sgis-campus', name: 'SGIS-inspired campus, Atigre (Kolhapur)', region: 'Kolhapur', lat: 16.7335, lon: 74.4015, headingDeg: 20, description: '', dataNote: 'probe', approximate: true }));
await page.waitForFunction(() => window.__terra.engine.gameplay.systems.find((s) => s.id === 'interiors')?.campus.placed === true, null, { timeout: 120000 });
await page.waitForTimeout(3000);

const sys = () => window.__terra.engine.gameplay.systems.find((s) => s.id === 'interiors');
const shot = async (name) => { await page.waitForTimeout(1800); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); };
const campusPoint = (e, n) => page.evaluate(([e, n]) => { const c = window.__terra.engine.gameplay.systems.find((s) => s.id === 'interiors').campus; return c.toLonLat(e, n); }, [e, n]);
const stand = async (lat, lon, headingDeg, view = 'first', pitchDeg = -6) => {
  await page.evaluate(([la, lo, h, v, p]) => { const e = window.__terra.engine; e.modes.setView(v); e.gameplay.teleport(la, lo, h); e.modes.setHeading((h * Math.PI) / 180); e.modes.pitch = (p * Math.PI) / 180; }, [lat, lon, headingDeg, view, pitchDeg]);
  await page.waitForTimeout(900);
};

// 1. Entrance: from just outside the gate looking north up the main road.
const gate = await campusPoint(0, -6);
await stand(gate.lat, gate.lon, 0, 'third', -8);
await shot('campus-entrance');

// Enter Academic block A.
const enter = async (id) => {
  await page.evaluate((id) => { const s = window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors'); const body = window.__terra.engine.modes.bodyLatLon(); const c = s.scan(body.lat, body.lon).find((x) => x.id === `campus:${id}`); if (!c) throw new Error('no candidate ' + id); s.enter(c); }, id);
  await page.waitForFunction(() => window.__terra.engine.modes.groundOverride !== null, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
};
const doorA = await campusPoint(-55, 81);
await stand(doorA.lat, doorA.lon, 0);
await enter('academic-a');
// 2. Corridor: stand at the east end of the ground-floor corridor looking west toward the stairs.
const corridor = await page.evaluate(() => { const l = window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').activeLevel(); const c = l.plan.floors[0].corridors[0].rect; const p = l.toLonLat(c.x1 - 2, (c.y0 + c.y1) / 2); const f = l.frame; const east = -Math.cos(f.rotationRad), north = -Math.sin(f.rotationRad); return { ...p, heading: (Math.atan2(east, north) * 180) / Math.PI }; });
await stand(corridor.lat, corridor.lon, corridor.heading, 'first', -4);
await shot('campus-corridor');
// 3. Classroom on the first floor: ride the lift, stand in a classroom's door corner looking across the desks.
await page.evaluate(() => window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').rideTo(1));
await page.waitForTimeout(2500);
const classroom = await page.evaluate(() => { const l = window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').activeLevel(); const r = l.plan.floors[1].rooms.find((x) => x.kind === 'classroom'); const north = r.rect.y0 > l.plan.usable.y0 + 1; const x = r.rect.x0 + 0.9, y = north ? r.rect.y0 + 0.9 : r.rect.y1 - 0.9; const p = l.toLonLat(x, y); const f = l.frame; const dx = 1, dy = north ? 1 : -1; const east = dx * Math.cos(f.rotationRad) - dy * Math.sin(f.rotationRad), nn = dx * Math.sin(f.rotationRad) + dy * Math.cos(f.rotationRad); return { ...p, heading: (Math.atan2(east, nn) * 180) / Math.PI, label: r.label }; });
await stand(classroom.lat, classroom.lon, classroom.heading, 'first', -8);
await shot('campus-classroom');
// Leave block A.
await page.evaluate(() => window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').exit(false));
await page.waitForTimeout(1500);
// 4. Library: enter and look down the reading hall from the door end.
const doorLib = await campusPoint(-40 + 15, 36);
await stand(doorLib.lat, doorLib.lon, 270);
await enter('library');
const library = await page.evaluate(() => { const l = window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').activeLevel(); const r = l.plan.floors[0].rooms[0]; const p = l.toLonLat(r.rect.x1 - 1.2, r.rect.y0 + 1.2); const f = l.frame; const dx = -1, dy = 0.5; const east = dx * Math.cos(f.rotationRad) - dy * Math.sin(f.rotationRad), nn = dx * Math.sin(f.rotationRad) + dy * Math.cos(f.rotationRad); return { ...p, heading: (Math.atan2(east, nn) * 180) / Math.PI }; });
await stand(library.lat, library.lon, library.heading, 'first', -6);
await shot('campus-library');
// 5. Terrace of the library: third person from the roof, looking toward the academic blocks.
await page.evaluate(() => { const l = window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').activeLevel(); const t = l.plan.floors[l.plan.floors.length - 1]; l.forceReference(t.index); const p = l.toLonLat(l.plan.usable.x0 + 4, (l.plan.usable.y0 + l.plan.usable.y1) / 2); window.__terra.engine.modes.setView('third'); window.__terra.engine.modes.setBody(p.lat, p.lon, 20, l.baseHeightM + t.z); });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__terra.engine.modes.pitch = -0.2; });
await shot('campus-terrace');
const stats = await page.evaluate(() => window.__terra.engine.gameplay.systems.find((x) => x.id === 'interiors').stats());
console.log('stats', JSON.stringify(stats));
console.log('errors:', errors.length); errors.slice(0, 10).forEach((e) => console.log('  ', e));
await browser.close();
