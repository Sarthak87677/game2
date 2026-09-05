#!/usr/bin/env node
/**
 * Records a short ground-level walkthrough (WebM video + key frames) to prove the playable slice, e.g.
 *   node scripts/dev/capture-walkthrough.mjs http://127.0.0.1:5173/ docs/walkthrough gateway
 * Scenario steps come from scripts/dev/walkthroughs/<name>.json (same step format as probe-scene.mjs) or the built-in
 * default (spawn → walk → third person → drive). In the cloud sandbox the video is rendered by SwiftShader at a few
 * frames per second; on a GPU machine it reflects real frame rates.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';
const [url = 'http://127.0.0.1:5173/', outDir = 'docs/walkthrough', name = 'default'] = process.argv.slice(2);
const proxy = process.env.HTTPS_PROXY;
const executablePath = process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const scenarioFile = `scripts/dev/walkthroughs/${name}.json`;
const steps = existsSync(scenarioFile) ? JSON.parse(readFileSync(scenarioFile, 'utf8')) : [
  { spawn: 'gateway-of-india' }, { waitTiles: 90000 }, { wait: 2000 }, { shot: 'spawn' },
  { key: 'KeyW', ms: 4000 }, { look: [300, 0] }, { key: 'KeyW', ms: 3000 }, { shot: 'walk' },
  { eval: "window.__terra.engine.modes.setView('third')" }, { key: 'KeyW', ms: 3000 }, { shot: 'third-person' },
  { setMode: 'drive' }, { key: 'KeyW', ms: 5000 }, { shot: 'drive' },
];
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--ssl-version-max=tls1.2'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: outDir, size: { width: 1280, height: 720 } }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto(`${url}${url.includes('?') ? '&' : '?'}terraQuality=low`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__terra?.ready === true, null, { timeout: 240000 });
const spawns = await page.evaluate(async () => (await import('/src/data/maharashtra/spawns.ts')).MAHARASHTRA_SPAWNS);
const frames = [];
for (const step of steps) {
  if (step.spawn) { const s = spawns.find((x) => x.id === step.spawn); if (!s) throw new Error(`unknown spawn ${step.spawn}`); await page.evaluate((sp) => window.__terra.spawn(sp), s); }
  if (step.goTo) await page.evaluate(([la, lo, h]) => window.__terra.goTo(la, lo, h), step.goTo);
  if (step.setMode) await page.evaluate((m) => window.__terra.setMode(m), step.setMode);
  if (step.waitTiles) await page.waitForFunction(() => { const st = window.__terra.state(); return st.streaming && st.streaming.queuedTiles === 0 && st.streaming.tilesLoaded; }, null, { timeout: step.waitTiles }).catch(() => {});
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.key) { await page.keyboard.down(step.key); await page.waitForTimeout(step.ms ?? 1000); await page.keyboard.up(step.key); }
  if (step.look) await page.mouse.move(640 + step.look[0], 360 + step.look[1]);
  if (step.eval) await page.evaluate(step.eval);
  if (step.shot) { const p = join(outDir, `${name}-${step.shot}.png`); await page.screenshot({ path: p }); frames.push(p); console.log('frame', p, JSON.stringify(await page.evaluate(() => { const st = window.__terra.state(); return { fps: st.streaming?.fps.toFixed(1), tiles: st.streaming?.terrainTilesLoaded, cam: st.camera && { lat: +st.camera.lat.toFixed(4), lon: +st.camera.lon.toFixed(4), agl: st.camera.altitudeAglM && +st.camera.altitudeAglM.toFixed(1) } }; }))); }
}
const diag = await page.evaluate(() => window.__terraStore.getState().diagnostics.filter((d) => d.level === 'error').map((d) => d.message.slice(0, 160)));
await context.close();
await browser.close();
const video = readdirSync(outDir).filter((f) => f.endsWith('.webm')).map((f) => join(outDir, f)).sort((a, b) => b.localeCompare(a))[0];
if (video) { const target = join(outDir, `${name}.webm`); renameSync(video, target); console.log('video', target); }
console.log('diagnostics errors:', diag.length ? diag : 'none');
