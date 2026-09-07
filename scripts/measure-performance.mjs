#!/usr/bin/env node
/**
 * Performance measurement for the Terra Infinite browser client (perf contract, docs/PERFORMANCE.md).
 *
 *   npm run build && npm run perf              # full run: 7 Maharashtra/Taj spots × 20 s + 5-minute traversal soak
 *   npm run perf -- --quick                    # CI: 3 spots × 5 s + 40 s soak
 *   npm run perf -- --url=http://127.0.0.1:5173/?terraFixtures=1   # measure a running server instead of `vite preview`
 *   npm run perf -- --min-fps=1                # relax the boot gate (software renderers); default: the app decides
 *
 * Per spot it runs the in-app benchmark (`window.__terra.benchmark`) and records current / average / 1 % low FPS,
 * frame ms, p99 frame ms, JS heap, globe tiles, draw commands, primitives and actors. The soak walks continuously
 * (walk mode, W held) alternating between the SGIS-inspired campus and the Mumbai spot, samples the heap every 10 s
 * (after a forced GC when `--js-flags=--expose-gc` is honoured) and p99 frame time per minute, and FAILS the run when
 * the heap grows more than 25 % from minute 1 to minute 5 or the p99 doubles. Output: a Markdown table on stdout and
 * docs/performance-<stamp>.json. The renderer string and a software-renderer flag are recorded so SwiftShader numbers
 * are never mistaken for GPU numbers.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const quick = flag('quick');
const positionalUrl = args.find((a) => /^https?:\/\//.test(a));
const baseUrl = opt('url') ?? positionalUrl ?? 'http://127.0.0.1:4173/';
const minFps = opt('min-fps');
const spotSeconds = Number(opt('spot-seconds') ?? (quick ? 5 : 20));
const soakSeconds = Number(opt('soak-seconds') ?? (quick ? 40 : 300));
const soakSampleMs = quick ? 5000 : 10_000;
const soakMinuteMs = quick ? 10_000 : 60_000;
const quality = opt('quality');
const proxy = process.env.HTTPS_PROXY;
const extraArgs = (process.env.TERRA_BROWSER_ARGS ?? '').split(' ').filter(Boolean);
const executablePath = process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/** Benchmark spots (contract). Coordinates are approximate reference values, not surveyed positions. */
const ALL_SPOTS = [
  { id: 'mumbai-marine-drive', name: 'Mumbai Marine Drive / CSMT traffic area', lat: 18.9432, lon: 72.8236, h: 300 },
  { id: 'rural-satara', name: 'Rural Maharashtra near Satara', lat: 17.6, lon: 74.05, h: 300 },
  { id: 'campus', name: 'SGIS-inspired campus (procedural)', lat: 16.7335, lon: 74.4015, h: 300 },
  { id: 'lonavala-rail', name: 'Train corridor near Lonavala', lat: 18.75, lon: 73.41, h: 300 },
  { id: 'air-mumbai', name: 'Air-travel view over Mumbai (3 000 m)', lat: 19.09, lon: 72.87, h: 3000 },
  { id: 'ganpatipule', name: 'Konkan coast, Ganpatipule', lat: 17.146, lon: 73.265, h: 300 },
  { id: 'taj-mahal', name: 'Taj Mahal, Agra', lat: 27.1751, lon: 78.0421, h: 300 },
];
const spots = quick ? ALL_SPOTS.filter((s) => ['mumbai-marine-drive', 'campus', 'air-mumbai'].includes(s.id)) : ALL_SPOTS;
const soakSpots = [ALL_SPOTS[2], ALL_SPOTS[0]];

let server = null;
if (!opt('url') && !positionalUrl) {
  if (!existsSync('dist/index.html')) { console.error('dist/ missing — run `npm run build` first (or pass --url=…)'); process.exit(2); }
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore', env: { ...process.env, TERRA_FIXTURES: process.env.TERRA_FIXTURES ?? '1' } });
  await new Promise((r) => setTimeout(r, 4000));
}
const url = new URL(baseUrl);
if (quality) url.searchParams.set('terraQuality', quality);
if (minFps !== null) url.searchParams.set('terraMinFps', minFps);

const browser = await chromium.launch({
  executablePath, headless: true,
  proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--js-flags=--expose-gc', ...extraArgs],
});
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: Number(process.env.TERRA_PERF_W ?? 1920), height: Number(process.env.TERRA_PERF_H ?? 1080) } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 300)));
const bootStart = Date.now();
await page.goto(url.toString(), { waitUntil: 'load', timeout: 120_000 });
await page.waitForFunction(() => window.__terra?.ready === true, null, { timeout: 300_000 });
const bootS = (Date.now() - bootStart) / 1000;
const env = await page.evaluate(() => { const s = window.__terra.state(); return { hardware: s.hardware, quality: s.quality, readiness: s.readiness, adaptive: s.adaptive, ua: navigator.userAgent }; });
const renderer = env.hardware?.gpuRenderer ?? 'unknown';
console.log(`Ready after ${bootS.toFixed(1)} s · preset ${env.quality} · ${renderer}${env.hardware?.softwareRenderer ? ' (SOFTWARE RENDERER — not a GPU)' : ''}`);
if (env.readiness?.degraded?.length) console.log(`Degraded: ${env.readiness.degraded.join(' | ')}`);

const waitTiles = async (ms) => { await page.waitForFunction(() => { const s = window.__terra.state(); return s.streaming && s.streaming.queuedTiles === 0 && s.streaming.tilesLoaded; }, null, { timeout: ms }).catch(() => console.log('  (tiles still streaming — measuring anyway)')); await page.waitForTimeout(2000); };
const gc = () => page.evaluate(() => { if (typeof window.gc === 'function') { window.gc(); return true; } return false; });
const heapMb = () => page.evaluate(() => window.__terra.state().streaming?.jsHeapMb ?? null);

// ---- Spot benchmarks -------------------------------------------------------------------------------------------------
const results = [];
for (const s of spots) {
  console.log(`\n▶ ${s.name} (${s.lat}, ${s.lon} @ ${s.h} m)`);
  await page.evaluate(([la, lo, h]) => window.__terra.goTo(la, lo, h), [s.lat, s.lon, s.h]);
  await waitTiles(quick ? 40_000 : 90_000);
  const r = await page.evaluate((sec) => window.__terra.benchmark(sec), spotSeconds);
  const row = {
    id: s.id, name: s.name, lat: s.lat, lon: s.lon, heightM: s.h, seconds: r.durationS,
    fps: Number(r.frames.currentFps.toFixed(1)), avgFps: Number(r.frames.avgFps.toFixed(1)), onePercentLowFps: Number(r.frames.onePercentLowFps.toFixed(1)),
    frameMs: Number(r.frames.frameMs.toFixed(1)), p99Ms: Number(r.frames.p99Ms.toFixed(1)), frames: r.frames.frames,
    heapMb: r.heapMb.end === null ? null : Math.round(r.heapMb.end), globeTiles: r.tiles.globeRendered, terrainTiles: r.tiles.terrainLoaded,
    drawCalls: r.drawCommands.avg, primitives: r.primitives, actors: r.actors, adaptiveStep: r.adaptive?.step ?? null, resolutionScale: r.viewport.resolutionScale,
  };
  results.push(row);
  console.log(`  ${row.avgFps} fps avg · ${row.fps} current · ${row.onePercentLowFps} 1 % low · ${row.frameMs} ms (p99 ${row.p99Ms} ms) · heap ${row.heapMb ?? 'n/a'} MB · ${row.globeTiles ?? '?'} tiles · ${row.drawCalls ?? '?'} draw calls · ${row.actors} actors · adaptive step ${row.adaptiveStep}`);
}

// ---- Traversal soak ---------------------------------------------------------------------------------------------------
console.log(`\n▶ Traversal soak: ${soakSeconds} s walking through ${soakSpots.map((s) => s.id).join(' ↔ ')}`);
const soak = { seconds: soakSeconds, heapSamples: [], p99PerMinute: [], failures: [], gcAvailable: false };
const walkTo = async (s) => {
  await page.keyboard.up('KeyW').catch(() => {});
  await page.evaluate(([la, lo, h]) => window.__terra.goTo(la, lo, h), [s.lat, s.lon, 150]);
  await waitTiles(quick ? 20_000 : 60_000);
  await page.evaluate(() => window.__terra.setMode('walk'));
  await page.waitForTimeout(1500);
  await page.keyboard.down('KeyW');
};
let spotIdx = 0;
await walkTo(soakSpots[spotIdx]);
soak.gcAvailable = await gc();
const soakStart = Date.now();
let lastSample = soakStart, lastMinute = soakStart, lastSwitch = soakStart;
let minuteFrames = [];
const removeFrames = await page.evaluate(() => { window.__perfFrames = []; window.__perfRemove = window.__terra.engine.streaming.addFrameListener((dt) => window.__perfFrames.push(dt)); return true; });
void removeFrames;
while (Date.now() - soakStart < soakSeconds * 1000) {
  await page.waitForTimeout(1000);
  const now = Date.now();
  // Turn a little every few seconds so the walk keeps covering new ground instead of pushing into one wall.
  if (Math.floor((now - soakStart) / 1000) % 7 === 0) { await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD'); }
  if (now - lastSample >= soakSampleMs) {
    lastSample = now;
    await gc();
    const h = await heapMb();
    soak.heapSamples.push({ t: Number(((now - soakStart) / 1000).toFixed(0)), heapMb: h === null ? null : Number(h.toFixed(1)) });
    process.stdout.write(`  t=${((now - soakStart) / 1000).toFixed(0)}s heap ${h?.toFixed(0) ?? 'n/a'} MB\r`);
  }
  if (now - lastMinute >= soakMinuteMs) {
    lastMinute = now;
    minuteFrames = await page.evaluate(() => { const f = window.__perfFrames; window.__perfFrames = []; return f; });
    const sorted = [...minuteFrames].sort((a, b) => a - b);
    const p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : null;
    const avgFps = sorted.length ? (sorted.length * 1000) / sorted.reduce((a, b) => a + b, 0) : null;
    soak.p99PerMinute.push({ minute: soak.p99PerMinute.length + 1, p99Ms: p99 === null ? null : Number(p99.toFixed(1)), avgFps: avgFps === null ? null : Number(avgFps.toFixed(2)), frames: sorted.length });
    console.log(`\n  minute ${soak.p99PerMinute.length}: p99 ${p99?.toFixed(0) ?? 'n/a'} ms · ${avgFps?.toFixed(2) ?? 'n/a'} fps avg · ${sorted.length} frames`);
  }
  if (now - lastSwitch >= (quick ? 15_000 : 60_000)) { lastSwitch = now; spotIdx = (spotIdx + 1) % soakSpots.length; await walkTo(soakSpots[spotIdx]); }
}
await page.keyboard.up('KeyW').catch(() => {});
await page.evaluate(() => { window.__perfRemove?.(); });
const heapAt = (sec) => { const s = soak.heapSamples.filter((x) => x.heapMb !== null && x.t >= sec - soakSampleMs / 1000 && x.t <= sec + soakSampleMs / 1000); return s.length ? s[s.length - 1].heapMb : null; };
const m1 = heapAt(soakMinuteMs / 1000), m5 = heapAt((soakMinuteMs / 1000) * 5) ?? soak.heapSamples.filter((x) => x.heapMb !== null).at(-1)?.heapMb ?? null;
soak.heapMinute1Mb = m1; soak.heapMinute5Mb = m5;
soak.heapGrowthPct = m1 && m5 ? Number((((m5 - m1) / m1) * 100).toFixed(1)) : null;
if (soak.heapGrowthPct !== null && soak.heapGrowthPct > 25) soak.failures.push(`heap grew ${soak.heapGrowthPct} % from minute 1 to minute 5 (${m1} → ${m5} MB)`);
const p99s = soak.p99PerMinute.map((m) => m.p99Ms).filter((v) => v !== null);
if (p99s.length >= 2 && p99s[p99s.length - 1] > 2 * p99s[0]) soak.failures.push(`p99 frame time doubled (${p99s[0]} → ${p99s[p99s.length - 1]} ms)`);
if (!soak.gcAvailable) soak.note = 'window.gc unavailable (--js-flags=--expose-gc not honoured): heap samples include garbage not yet collected';
console.log(`\n  heap minute 1 → 5: ${m1 ?? 'n/a'} → ${m5 ?? 'n/a'} MB (${soak.heapGrowthPct ?? 'n/a'} %) · ${soak.failures.length ? 'FAIL: ' + soak.failures.join('; ') : 'PASS'}`);

await browser.close();
server?.kill();

// ---- Report -----------------------------------------------------------------------------------------------------------
mkdirSync('docs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = { measuredAt: new Date().toISOString(), quick, url: url.toString(), bootSeconds: Number(bootS.toFixed(1)), renderer, softwareRenderer: env.hardware?.softwareRenderer ?? null, hardware: env.hardware, preset: env.quality, readiness: env.readiness, userAgent: env.ua, viewport: `${process.env.TERRA_PERF_W ?? 1920}x${process.env.TERRA_PERF_H ?? 1080}`, spotSeconds, results, soak, pageErrors };
const file = `docs/performance-${stamp}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nRenderer: ${renderer}${out.softwareRenderer ? '  ← software rasteriser, not a GPU' : ''}`);
console.log(`Hardware: ${env.hardware?.cpuCores ?? '?'} cores · ${env.hardware?.deviceMemoryGb ?? '?'} GB · ${env.hardware?.graphicsApi} · VRAM ${env.hardware?.vram}`);
console.log(`\n| Spot | Avg FPS | Current FPS | 1 % low | Frame ms | p99 ms | Heap MB | Globe tiles | Draw calls | Actors | Adaptive step |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const r of results) console.log(`| ${r.name} | ${r.avgFps} | ${r.fps} | ${r.onePercentLowFps} | ${r.frameMs} | ${r.p99Ms} | ${r.heapMb ?? 'n/a'} | ${r.globeTiles ?? 'n/a'} | ${r.drawCalls ?? 'n/a'} | ${r.actors} | ${r.adaptiveStep ?? 'n/a'} |`);
console.log(`\n| Soak minute | p99 ms | Avg FPS | Frames |\n|---:|---:|---:|---:|`);
for (const m of soak.p99PerMinute) console.log(`| ${m.minute} | ${m.p99Ms ?? 'n/a'} | ${m.avgFps ?? 'n/a'} | ${m.frames} |`);
console.log(`\nSoak heap: ${soak.heapSamples.map((h) => `${h.t}s=${h.heapMb ?? 'n/a'}`).join(' ')}`);
console.log(`Soak result: ${soak.failures.length ? 'FAIL — ' + soak.failures.join('; ') : 'PASS'}${soak.note ? ` (${soak.note})` : ''}`);
if (pageErrors.length) console.log(`Page errors (${pageErrors.length}): ${pageErrors.slice(0, 5).join(' | ')}`);
console.log(`Written ${file}`);
process.exit(soak.failures.length ? 1 : 0);
