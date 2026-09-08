# Track summary — perf (branch `claude/track-perf`)

Goal: implement the mandatory performance contract in the browser client and prove it with recorded measurements.
Everything below was verified in the cloud sandbox (4 vCPUs, no GPU, SwiftShader software WebGL, OSM/terrain hosts
blocked, synthetic OSM fixture). **No GPU has run this build; 60/30 fps is unverified** — see PERFORMANCE.md.

## What works

| Deliverable | Where | Status |
|---|---|---|
| 1. Hardware detection | `src/perf/hardware.ts`, store `hardware`, Diagnostics "Hardware" block, "Copy report" | done |
| 2. Frame statistics | `src/perf/frameStats.ts`, `src/engine/streaming.ts` (`StreamingSnapshot` extended, old fields unchanged) | done |
| 3. Presets + ladder | `src/engine/quality.ts` (`performance` preset, `targetFps`/`minFps`, `degradationLadder`, `resolveQuality`), `src/perf/adaptive.ts`, store `adaptive`, Settings toggle "Protect frame rate (dynamic resolution)" (default on) | done |
| 4. Ready gating | `src/perf/readiness.ts`, `TerraEngine.loadDataInBackground` → `awaitReadiness` | done |
| 5. Diagnostics panel | `src/ui/panels/DiagnosticsPanel.tsx` (FPS current/avg/1 % low, frame ms, p99, heap, VRAM n/a, tiles, actors, draw calls, adaptive step, hardware, readiness, Benchmark 20 s → JSON log line) | done |
| 6. Measurement script | `scripts/measure-performance.mjs` (7 spots, 5-min soak, `--quick`, Markdown + JSON) | done; quick run and full SwiftShader run recorded (`docs/performance-2026-09-0{7,8}T*.json`) |
| 7. PERFORMANCE.md | rewritten (contract, methodology, SwiftShader numbers, hardware block, GPU command, honest gaps) | done |
| 8. Tests | `tests/unit/perf/*` (36), `tests/e2e/perf.spec.ts` (3) | passing |

Store additions (all additive): `hardware`, `adaptive`, `readiness`, `settings.protectFrameRate`. The brief's
`quality.adaptive` readout lives at `state.adaptive` because `state.quality` is the preset-id string that the Toolbar
and Settings already read; documented in `docs/PLAN_MAHARASHTRA.md`.

Engine additions: `engine.adaptive`, `engine.hardware`, `engine.effectiveQuality()`, `engine.benchmark(seconds)`,
`window.__terra.benchmark`, `window.__terra.state()` now includes `readiness`, `adaptive`, `hardware`, `quality`.

URL flags: `?terraQuality=performance|low|medium|high|ultra`, `?terraMinFps=<n>` (0 = no FPS gate).

## How it was verified

* `npm run typecheck && npm run lint && npm test` — 253 unit tests pass (36 new under `tests/unit/perf`).
* `TERRA_E2E_DEV=1 npx playwright test tests/e2e/perf.spec.ts` (SwiftShader, `?terraQuality=low`):
  1. **ready pill** — sampled every 250 ms from page load: no sample says "ready" before `boot.phase === 'ready'`; the
     first ready sample has `tilesLoadedOnce === true` and `readiness.fpsGatePassed === true`; a visible
     "Streaming… / Warming up" phase precedes it; hardware block and the new frame statistics are present.
  2. **warming-up hold + ladder** — with `?terraMinFps=1000` and every layer loaded the pill stays "Warming up (x fps)"
     (`ready === false`); activating the ladder steps one rung per 2 s: rungs 1–5 leave resolution at 0.75, rung ≥ 7
     scales it (0.9…0.5 ×), `effectiveQuality()` shows ocean off, vegetation 0.15, traffic 0.3, near field 180 m; the
     log has ≥ 7 "Adaptive quality" lines; switching the toggle off restores rung 0 and the preset values.
  3. **Diagnostics** — perf grid, hardware grid, readiness block visible; `benchmark(4)` returns a `terra-benchmark`
     record and the log line appears in the panel. Screenshot `docs/screenshots/perf-diagnostics.png`
     (and `perf-warming-up.png`).
* Full suite `TERRA_FIXTURES=1 npx playwright test` against the production build (`npm run build`, `vite preview`,
  SwiftShader): **12 passed, 0 failed (26.9 min)** — city, landmarks, nature, 3 × perf, 6 × smoke. The existing specs
  boot through the new gate without changes (software renderers auto-relax the FPS gate to 1 fps; the terrain host is
  blocked here so each boot ends on the 45 s ellipsoid fallback and still reaches ready within the 180 s helper
  timeout).
* `node scripts/measure-performance.mjs --quick --url=… --quality=low --min-fps=1` → `docs/performance-2026-09-07T13-45-36-612Z.json`.

## What is not done / caveats

* **60 fps / 30 fps unverified** (no GPU here). SwiftShader gives 0.6–3.8 fps at 1920×1080; the ladder bottoms out
  at rung 9–10 on this machine, which is the contractually correct behaviour but means the recorded spot numbers are
  for the degraded configuration.
* The sandbox cannot reach the terrain host, so every boot here ends on the ellipsoid fallback (45 s) and the climate
  atlas has no elevation; both are listed as degradations by the gate rather than hidden.
* Actor counts depend on the other tracks' `stats()` keys (vehicle/passenger/crowd/… are summed); with no gameplay
  systems registered on this branch the count is ambient traffic only.
* Vegetation-density rungs regenerate near-field tiles (brief worker hitch); traffic-density rungs cap new spawns only.

## Files touched

`src/perf/{hardware,frameStats,readiness,adaptive,benchmark}.ts`, `src/engine/{quality,streaming,TerraEngine}.ts`,
`src/state/store.ts` (additive slices), `src/ui/panels/{DiagnosticsPanel,SettingsPanel}.tsx`,
`scripts/measure-performance.mjs`, `tests/unit/perf/*.test.ts`, `tests/e2e/perf.spec.ts`,
`PERFORMANCE.md`, `PROJECT_STATUS.md` (track section), `docs/PLAN_MAHARASHTRA.md` (contract note),
`docs/screenshots/perf-*.png`, `docs/performance-*.json`, this file.

## Full-run results (SwiftShader, not a GPU)

`docs/performance-2026-09-08T04-12-22-114Z.json` — production build, 1920×1080, medium preset, `--min-fps=0`
(gate off, ladder idle), 7 spots × 20 s, 300 s soak, exit 0:

* Spots: 1.0–1.3 fps average, 1 % low 0.3–0.4 fps, 752–959 ms mean frame, p99 2.3–3.6 s, heap 73–132 MB,
  26–36 globe tiles, 22–74 draw calls, 0 actors (OSM offline in this run — no `?terraFixtures=1` on the preview URL).
* Soak: heap 89.7 → 86.5 MB (−3.6 %), p99 4.5 → 6.6 s (< 2×) → **PASS**; no page errors.
* Full tables in PERFORMANCE.md §3.2. A second full run with `?terraFixtures=1` (traffic present) is recorded in §3.3
  when available.
