#!/usr/bin/env node
/**
 * Headless-browser diagnostics for Terra Infinite: checks WebGL2 availability, proxy access to data hosts,
 * then loads the running dev server (default http://127.0.0.1:5173) and reports console errors + a screenshot.
 * Usage: node scripts/diagnose-browser.mjs [url] [screenshot.png]
 */
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const shot = process.argv[3] ?? 'test-results/diagnose.png';
const proxy = process.env.HTTPS_PROXY;
const extraArgs = (process.env.TERRA_BROWSER_ARGS ?? '').split(' ').filter(Boolean);
const executablePath = process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', ...extraArgs],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.setContent('<canvas id=c></canvas>');
const info = await page.evaluate(() => {
  const c = document.getElementById('c');
  const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { webgl2: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), floatColor: !!gl.getExtension('EXT_color_buffer_float'), webgpu: 'gpu' in navigator, cores: navigator.hardwareConcurrency };
});
console.log('WebGL:', JSON.stringify(info));
for (const u of ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/5/17/11.png', 'https://tile.openstreetmap.org/3/4/3.png']) {
  try { const resp = await page.goto(u, { timeout: 30000 }); console.log(u, '->', resp?.status(), resp?.headers()['content-type'], 'ACAO=' + (resp?.headers()['access-control-allow-origin'] ?? 'none')); }
  catch (e) { console.log(u, '-> ERROR', String(e).split('\n')[0]); }
}
await page.close();
const page2 = await ctx.newPage();
const errors = []; const logs = [];
page2.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (m.type() === 'error') errors.push(t); });
page2.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page2.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
console.log('Loading', url);
const t0 = Date.now();
await page2.goto(url, { waitUntil: 'load', timeout: 60000 });
await page2.waitForFunction(() => window.__terra?.ready, null, { timeout: 150000 }).catch(() => console.log('app readiness flag not seen within 150s'));
await page2.waitForTimeout(8000);
const state = await page2.evaluate(() => window.__terra?.state?.() ?? null);
console.log('ready after', Date.now() - t0, 'ms; state:', JSON.stringify(state).slice(0, 1500));
await page2.screenshot({ path: shot });
console.log('screenshot:', shot);
console.log('console errors:', errors.length); errors.slice(0, 20).forEach((e) => console.log('  ', e.slice(0, 300)));
console.log('log sample:'); logs.slice(0, 25).forEach((l) => console.log('  ', l.slice(0, 200)));
await browser.close();
