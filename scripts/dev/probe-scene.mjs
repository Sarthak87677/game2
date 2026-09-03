#!/usr/bin/env node
/**
 * Scripted visual inspection: loads the app and executes steps against window.__terra, saving screenshots.
 * Usage: node scripts/dev/probe-scene.mjs <url> <outDir> '<json steps>'
 * Steps: {goTo:[lat,lon,h]} {setDate:"ISO"} {setMode:"walk"} {wait:ms} {shot:"name"} {waitTiles:ms} {eval:"js"} {key:"KeyW",ms:1000} {weather:"rain"} {quality:"high"}
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';
const [url = 'http://127.0.0.1:5173/', outDir = 'test-results/probe', stepsJson = '[]'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const steps = JSON.parse(stepsJson);
const proxy = process.env.HTTPS_PROXY;
const extraArgs = (process.env.TERRA_BROWSER_ARGS ?? '').split(' ').filter(Boolean);
const browser = await chromium.launch({ executablePath: process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), headless: true, proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', ...extraArgs] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ` + m.text().slice(0, 400)); });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__terra?.ready === true, null, { timeout: 200000 });
console.log('ready');
const waitTiles = async (ms) => { await page.waitForFunction(() => { const s = window.__terra.state(); return s.streaming && s.streaming.queuedTiles === 0; }, null, { timeout: ms }).catch(() => console.log('tiles still loading')); await page.waitForTimeout(1500); };
for (const step of steps) {
  if (step.goTo) { await page.evaluate(([la, lo, h]) => window.__terra.goTo(la, lo, h), step.goTo); console.log('goTo', step.goTo); }
  if (step.setDate) { await page.evaluate((d) => window.__terra.engine.setDate(new Date(d)), step.setDate); }
  if (step.setMode) { await page.evaluate((m) => window.__terra.setMode(m), step.setMode); }
  if (step.weather) { await page.evaluate((w) => window.__terra.engine.setWeatherPreset(w), step.weather); }
  if (step.quality) { await page.evaluate((q) => window.__terra.engine.setQuality(q), step.quality); }
  if (step.eval) { const r = await page.evaluate(step.eval); console.log('eval →', JSON.stringify(r)?.slice(0, 800)); }
  if (step.key) { await page.keyboard.down(step.key); await page.waitForTimeout(step.ms ?? 1000); await page.keyboard.up(step.key); }
  if (step.waitTiles) await waitTiles(step.waitTiles);
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.shot) { const p = `${outDir}/${step.shot}.png`; await page.screenshot({ path: p }); const s = await page.evaluate(() => { const st = window.__terra.state(); return { cam: st.camera && { lat: +st.camera.lat.toFixed(4), lon: +st.camera.lon.toFixed(4), h: Math.round(st.camera.heightM), agl: st.camera.altitudeAglM && Math.round(st.camera.altitudeAglM), ground: st.camera.groundM && Math.round(st.camera.groundM) }, loc: st.location && { place: st.location.place, biome: st.location.biome, sun: st.location.sunElevationDeg?.toFixed(1) }, fps: st.streaming?.fps.toFixed(1), terrain: st.streaming?.terrainTilesLoaded, osm: window.__terra.engine.osmStatus }; }); console.log('shot', p, JSON.stringify(s)); }
}
console.log('errors/warnings:', errors.length); errors.slice(0, 15).forEach((e) => console.log('  ', e));
await browser.close();
