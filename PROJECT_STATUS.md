# Project status — Terra Infinite

Resumable task ledger. Update after every completed task. Dates are UTC.

## Current state (2026-09-05)

| Milestone | Status | Notes |
|---|---|---|
| 1. Working Earth | **done** | Globe, Terrarium terrain (worker-decoded, cached), offline inferred imagery + optional OSM/Esri/GIBS/MapTiler/ion layers, atmosphere/sun/moon/stars, search (offline gazetteer + coordinates, optional Nominatim/Photon), camera modes, loading/error states, diagnostics. |
| 2. Geographic Structure | **done** | Overpass adapter + OSM buildings (custom night-window shader), towers, roads, rail, water, land use, POI/place labels; bookmarks (246 highlights, 19 showcase areas); DATA_SOURCES/ATTRIBUTIONS; provenance UI; synthetic fixture responder for offline testing. |
| 3. Ground-Level World | **done** | Walk/drive with gravity, terrain, OSM-building and procedural-building collision; tile-anchored local frames (floating origin) for every ground-level mesh; procedural vegetation/rocks/crops/fields/villages/urban blocks generated in a worker from the climate atlas, height fields and OSM (`src/world/procedural`, `src/world/render`). Verified in headless Chromium: 2 572 trees across 15 tiles in the Black Forest, rocks only on the Antarctic ice sheet. |
| 4. Hyperrealistic Nature | **done (first pass)** | 100-species library with hemisphere-aware fruit/flower windows and leaf phenology, leaf cards/needles/palm fronds/fruit at close range, wind-sway vertex shader, weather particles, ground material (snow line, wetness, season tint, cloud shadows, water), ocean surface, orbital + cumulus clouds, underwater fog, procedural ambient audio. Not done: snow accumulation on vegetation geometry, puddles, subsurface leaf translucency. |
| 5. Cities and Landmarks | **done (first pass)** | OSM building meshes with day glass / night window emission, towers, roads, rail, water, land use, POI labels, population night lights, simulated traffic with headlights/tail-lights, street lamps, procedural villages and urban blocks where OSM is absent, 36 landmark stand-ins at measured positions (labelled procedural), 19 showcase areas with tours. Not done: street furniture (benches, signs), road markings, real 3D landmark models (none legally available offline). |
| 6. Optimisation | **done (first pass)** | Budgets in place (tile caches, OSM/near-field radii and LRU unloading, in-flight limits, impostor LOD, vertex caps, request scheduling, adaptive presets, `?terraQuality` override). Profiling found and fixed a real streaming bug (throttled terrain requests were treated as failures). `npm run perf` records real numbers (see PERFORMANCE.md); the sandbox only has software WebGL, so they are SwiftShader numbers — GPU measurement is the next task. |
| 7. Verification & Packaging | **done** | 217 unit tests, 8 Playwright end-to-end tests all passing on the current build (smoke ×6, synthetic city, nature, landmarks), production build, CI workflow, all documents. Visually inspected frames in `docs/screenshots/`. No console errors in the verified runs apart from expected blocked-host network failures in the sandbox. |

## Verified commands

```
npm run setup      # install, .env, derived data
npm run dev        # http://127.0.0.1:5173
npm run typecheck
npm test           # vitest unit tests
npm run build      # tsc + vite build → dist/
npm run test:e2e   # Playwright (needs a built dist for preview, or TERRA_E2E_DEV=1 for the dev server)
npm run perf       # headless FPS/memory measurement
TERRA_FIXTURES=1 npm run dev   # synthetic OSM responder for offline development
```

## Decisions

* **CesiumJS only** — no second render loop; near-field geometry is built in tile-local ENU frames with per-tile model matrices (floating origin) and Cesium's relative-to-eye encoding.
* **No keys required** — AWS Terrarium terrain + Natural Earth + climate model form the offline baseline; keyed providers are opt-in via `.env`.
* **Inferred climate atlas** — a 1024×512 raster built in a worker from 400+ approximate station normals; documented as inferred everywhere it is shown.
* **Sandbox constraints** — this development environment blocks OSM/Overpass/Nominatim/GIBS/Esri hosts; those adapters are unit-tested with fixtures and exercised through the synthetic responder.

## Known limitations (honest list)

* The development sandbox has no GPU and blocks OSM/Overpass/Nominatim/Esri/GIBS hosts, so real-OSM rendering was validated only through unit tests and the synthetic fixture; frame-rate targets (60/30 fps) could not be measured on real hardware here.
* Terrarium tiles have coarse/odd data in parts of Antarctica and the open ocean; the climate atlas is 39 km resolution.
* The Köppen/biome model is an inference from ~400 approximate station normals; microclimates are not represented.
* Landmarks are abstract procedural interpretations, not models (see `docs/screenshots/eiffel-standin.png`). Vegetation species are archetypes.
* Day/night and slope shading of the terrain come from the ground material (derivative normals); Cesium's own globe lighting is disabled because it only acts beyond 10 000 km and heightmap terrain has no vertex normals.
* Coastal cells of the 39 km climate raster inherit the neighbouring land biome; the vector coastline decides land vs water for readouts and generation.
* Reverse geocoding and live weather need network access and are rate-limited by policy.

## Next task

Run `npm run build && npm run perf` on a machine with a GPU and network access to the OSM/Overpass hosts, paste the table into PERFORMANCE.md, and use the Diagnostics panel at the showcase ground spots to check real-OSM rendering (this sandbox could only exercise the synthetic fixture).

## Track: perf — performance contract (2026-09-07, branch `claude/track-perf`)

**Completed**

* `src/perf/hardware.ts` — logical cores, `deviceMemory`, GPU vendor/renderer (`WEBGL_debug_renderer_info`), graphics
  API string with the ANGLE backend parsed from the renderer string, max texture size, screen + DPR, VRAM "not exposed
  by WebGL", software-renderer flag. Stored in `useTerraStore().hardware`, shown in Diagnostics and in "Copy report".
* `src/engine/streaming.ts` — rolling 10 s frame window: current/average/1 % low FPS, frame ms, p99, heap, globe tiles
  rendered, primitives (recursive), draw commands (postRender), actors (gameplay `stats()` + traffic). Snapshot is
  backward compatible (fields added only).
* `src/engine/quality.ts` — `performance` preset (0.7× resolution, no shadows/AO/bloom/clouds, vegetation 0.25,
  near field 250 m, traffic 0.4), `targetFps`/`minFps` per preset (performance 60/45, low/medium/high 60/30, ultra
  30/24), `trafficDensity`, `oceanReflections`, the reversible `degradationLadder` and `resolveQuality`.
* `src/perf/adaptive.ts` — ladder controller (2 s below minFps → one rung down; 6 s above target + 8 → one rung up;
  resolution 0.9 → 0.5 last; never nearby buildings/player) with the store readout `adaptive` and the Settings toggle
  "Protect frame rate (dynamic resolution)" (default on). `engine.effectiveQuality()` is what scene systems read.
* `src/perf/readiness.ts` + `TerraEngine.awaitReadiness` — "ready" only after terrain active + tiles loaded once,
  required layers loaded or explicitly degraded (reason listed), imagery present, FPS ≥ minFps for 3 s; failed
  required layer → error pill; terrain host silent for 45 s → ellipsoid fallback listed as degraded; `?terraMinFps=`
  override; software renderers relax the gate to 1 fps with a visible note.
* Diagnostics panel: all readouts above, hardware block, readiness block (blocking/degraded/FPS gate), Benchmark
  (20 s) button appending a JSON line to the log; `window.__terra.benchmark(seconds)` for scripts.
* `scripts/measure-performance.mjs` — 7 Maharashtra/Taj spots via the in-app benchmark, 5-minute walking soak with
  GC'd heap every 10 s and p99 per minute (fails on > 25 % heap growth or p99 doubling), `--quick`, Markdown tables,
  `docs/performance-<stamp>.json`.
* `PERFORMANCE.md` rewritten: contract, methodology, SwiftShader numbers labelled as software rendering, hardware
  block, GPU instructions, explicit "60/30 fps not verified" statement.

**Tested (how)**

* Unit: `tests/unit/perf/{frameStats,readiness,ladder,hardware,benchmark}.test.ts` (36 tests) — percentiles and the
  rolling window, readiness state machine (sustain/reset/latch/error/degraded), ladder order + reversibility +
  untouched settings, adaptive controller timing, ANGLE parsing, benchmark aggregation.
* e2e: `tests/e2e/perf.spec.ts` (3 specs, headless SwiftShader Chromium, `?terraQuality=low`) — the pill only turns
  ready after tiles loaded once and the FPS gate passed (`?terraMinFps=1`); with `?terraMinFps=1000` it stays on
  "Warming up (x fps)" and the ladder climbs to rung ≥ 7 (resolution untouched until rung 6) then returns to 0 when the
  toggle is switched off; Diagnostics shows every block and the benchmark writes a `terra-benchmark` log line.
  Screenshots: `docs/screenshots/perf-diagnostics.png`, `docs/screenshots/perf-warming-up.png`.
* Full e2e suite against the production build (`TERRA_FIXTURES=1 npx playwright test`): 12 passed / 0 failed in
  26.9 min — the readiness gate does not break the smoke, city, nature or landmark specs.
* `npm run perf -- --quick` run recorded in `docs/performance-2026-09-07T13-45-36-612Z.json` (0.6–3.8 fps, SwiftShader,
  ladder at rung 9–10, soak heap −1 %); full run `docs/performance-2026-09-08T04-12-22-114Z.json` (7 spots × 20 s,
  1.0–1.3 fps at medium/1080p in software, 300 s soak PASS: heap −3.6 %, p99 < 2×) and the fixture run
  `docs/performance-2026-09-08T04-36-37-315Z.json` (buildings + 400 vehicles: 0.3–0.5 fps, soak PASS: heap +2.1 %;
  two coastal outliers flagged as unexplained).

**Broken / limitations**

* 60/30 fps could not be verified: the sandbox has no GPU (SwiftShader 0.6–3.8 fps). Numbers are honest software
  numbers only; see PERFORMANCE.md §4–5 for what a GPU run must do.
* Vegetation-density rungs regenerate near-field tiles (worker), which is a brief hitch on a struggling machine;
  traffic-density rungs only cap new spawns.
* The terrain host was unreachable in this sandbox, so every boot here ends on the ellipsoid fallback after 45 s; on a
  connected machine the gate passes as soon as real tiles load.

**Next**

* Run `npm run build && npm run perf` on a GPU machine and paste the tables into PERFORMANCE.md.
* Feed real actor counts from the gameplay tracks' `stats()` (keys containing vehicle/passenger/crowd… are summed).
