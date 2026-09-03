#!/usr/bin/env node
/**
 * Measures real frame rates, tile streaming and memory at showcase locations in headless Chromium and writes
 * docs/performance-<timestamp>.json plus a Markdown table to stdout. Pass a URL to measure a running server
 * (default: starts `vite preview` on port 4173 — run `npm run build` first).
 * The renderer in use (e.g. SwiftShader software GL in CI) is recorded so numbers are never misattributed to a GPU.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const proxy = process.env.HTTPS_PROXY;
const extraArgs = (process.env.TERRA_BROWSER_ARGS ?? '').split(' ').filter(Boolean);
const executablePath = process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let server = null;
if (!process.argv[2]) {
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 4000));
}
const browser = await chromium.launch({ executablePath, headless: true, proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', ...extraArgs] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__terra?.ready === true, null, { timeout: 180000 });
const renderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d && gl ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
const spots = [
  { name: 'Orbit', lat: 20, lon: 20, h: 24000000 },
  { name: 'Himalaya (Everest)', lat: 27.9881, lon: 86.925, h: 12000 },
  { name: 'Manhattan', lat: 40.7484, lon: -73.9857, h: 1800 },
  { name: 'Zermatt ground', lat: 46.0207, lon: 7.7491, h: 300 },
  { name: 'Antarctica', lat: -85, lon: 0, h: 60000 },
];
const results = [];
for (const s of spots) {
  await page.evaluate(([la, lo, h]) => window.__terra.goTo(la, lo, h), [s.lat, s.lon, s.h]);
  await page.waitForFunction(() => { const st = window.__terra.state(); return st.streaming && st.streaming.queuedTiles === 0; }, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const samples = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); samples.push(await page.evaluate(() => window.__terra.state().streaming)); }
  const fps = samples.reduce((a, b) => a + b.fps, 0) / samples.length;
  const last = samples[samples.length - 1];
  results.push({ ...s, fps: Number(fps.toFixed(1)), frameMs: Number(last.frameMs.toFixed(1)), terrainTiles: last.terrainTilesLoaded, terrainErrors: last.terrainTileErrors, heapMb: last.jsHeapMb ? Number(last.jsHeapMb.toFixed(0)) : null });
  console.log(`${s.name.padEnd(22)} ${fps.toFixed(1).padStart(6)} fps  ${last.frameMs.toFixed(1).padStart(6)} ms  heap ${last.jsHeapMb?.toFixed(0) ?? 'n/a'} MB`);
}
await browser.close();
server?.kill();
mkdirSync('docs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = { measuredAt: new Date().toISOString(), renderer, userAgent: 'headless chromium', viewport: '1920x1080', results };
writeFileSync(`docs/performance-${stamp}.json`, JSON.stringify(out, null, 2));
console.log(`\nRenderer: ${renderer}`);
console.log('| Location | FPS | Frame ms | Terrain tiles | Heap MB |\n|---|---:|---:|---:|---:|');
for (const r of results) console.log(`| ${r.name} | ${r.fps} | ${r.frameMs} | ${r.terrainTiles} | ${r.heapMb ?? 'n/a'} |`);
