// Reproduces runtime errors with real stack traces: opens the app, pauses on EVERY thrown exception (caught ones
// included) through the Chrome DevTools Protocol and records the call frames. Usage:
//   node scripts/dev/capture-exceptions.mjs http://127.0.0.1:5174/ out.json [waitMs]
import { chromium } from '@playwright/test';
import { writeFileSync, existsSync } from 'node:fs';

const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null;

const [url, out, waitArg] = process.argv.slice(2);
const waitMs = Number(waitArg ?? 60000);
const browser = await chromium.launch({ executablePath: process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), headless: true, proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--ssl-version-max=tls1.2'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
const scripts = new Map();
const caught = [];
await cdp.send('Debugger.enable');
await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 8 });
await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' });
cdp.on('Debugger.scriptParsed', (e) => scripts.set(e.scriptId, e.url));
cdp.on('Debugger.paused', async (e) => {
  try {
    if (e.reason === 'exception') {
      const desc = e.data?.description ?? e.data?.value ?? '';
      const frames = e.callFrames.slice(0, 8).map((f) => `${f.functionName || '<anon>'} @ ${(scripts.get(f.location.scriptId) ?? '?').replace(/^https?:\/\/[^/]+/, '')}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`);
      let asyncFrames = [];
      let parent = e.asyncStackTrace;
      while (parent && asyncFrames.length < 6) { asyncFrames.push(`[async ${parent.description ?? ''}] ` + parent.callFrames.slice(0, 2).map((f) => `${f.functionName || '<anon>'} @ ${(f.url || '?').replace(/^https?:\/\/[^/]+/, '')}:${f.lineNumber + 1}`).join(' <- ')); parent = parent.parent; }
      if (/scene|undefined|null|destroyed|Illegal/i.test(String(desc))) caught.push({ t: Date.now(), message: String(desc).split('\n')[0].slice(0, 200), frames, asyncFrames });
    }
  } finally { await cdp.send('Debugger.resume').catch(() => {}); }
});
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text().slice(0, 300)); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(waitMs);
const state = await page.evaluate(() => {
  const st = window.__terraStore?.getState?.();
  const toasts = Array.from(document.querySelectorAll('.terra-toast, [class*=toast]')).map((el) => el.textContent?.trim().slice(0, 200));
  return { boot: st?.boot, diagnostics: st?.diagnostics?.filter((d) => d.level !== 'info').map((d) => ({ level: d.level, message: d.message.slice(0, 220), stack: d.stack })), toasts, engines: document.querySelectorAll('.cesium-viewer').length };
});
await page.screenshot({ path: out.replace(/\.json$/, '.png') });
writeFileSync(out, JSON.stringify({ url, caught, consoleErrors: consoleErrors.slice(0, 40), state }, null, 2));
console.log(JSON.stringify({ url, caughtCount: caught.length, distinct: [...new Set(caught.map((c) => c.message))], toasts: state.toasts, engines: state.engines, boot: state.boot?.phase }, null, 1));
await browser.close();
