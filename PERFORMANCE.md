# Performance

This document is the performance contract for the Terra Infinite browser client, the methodology used to measure it,
and the numbers actually recorded. **Nothing here is estimated: every number is copied from a
`docs/performance-<stamp>.json` file written by `npm run perf`, and each file carries the renderer string it was
measured on.**

> **Read this first.** The only machine this project has been run on so far is a cloud sandbox with **no GPU**. Chromium
> renders through **SwiftShader**, a CPU rasteriser (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…))`,
> 4 vCPUs, 8 GB). Every frame rate below is a *software-rendering* number and says nothing about what a graphics card
> does. **The 60 fps / 30 fps targets have not been verified on real hardware.** The evidence that exists is listed in
> "What is verified and what is not". To get real numbers, run the command in "Measuring on a real GPU".

## 1. Contract

### 1.1 Presets and targets (`src/engine/quality.ts`)

| Preset | Target FPS | Minimum FPS | Resolution | Shadows | AO / bloom | Vegetation | Near-field radius | Traffic | Clouds |
|---|---:|---:|---:|---|---|---:|---:|---:|---|
| `performance` ("60-FPS Performance Mode") | 60 | 45 | 0.7 | off | off | 0.25 | 250 m | 0.4 | off |
| `low` | 60 | 30 | 0.75 | off | off | 0.3 | 300 m | 0.6 | off |
| `medium` | 60 | 30 | 1.0 | on (2 k) | off | 0.6 | 500 m | 0.8 | on |
| `high` | 60 | 30 | 1.0 | on (4 k, soft) | AO | 1.0 | 800 m | 1.0 | on |
| `ultra` | 30 | 24 | 1.0 | on (8 k, soft) | AO + bloom | 1.0 | 1 200 m | 1.0 | on |

`?terraQuality=<preset>` forces a preset; the choice is otherwise remembered in `localStorage` or detected from cores,
memory and user agent.

### 1.2 Adaptive degradation ladder (`src/perf/adaptive.ts`, `degradationLadder` in `quality.ts`)

"Protect frame rate (dynamic resolution)" (Settings, **on by default**) runs an ordered, reversible ladder:

| Rung | Step | What changes |
|---:|---|---|
| 1 | Shorter shadow distance | shadow distance ≤ 1 000 m, soft shadows off |
| 2 | Ocean reflections off | animated reflective sea surface disabled |
| 3 | Vegetation density halved | new near-field tiles generate at 0.5× (tiles regenerate) |
| 4 | Traffic density halved | vehicle cap halved for new spawns |
| 5 | Shorter draw distance | near-field radius × 0.6 (≥ 150 m), terrain SSE ≥ 4 |
| 6–10 | Dynamic resolution 0.9 → 0.5 | renderer resolution scale × 0.9, 0.8, 0.7, 0.6, 0.5 of the preset |

* A rung is added after **2 s** of FPS below the preset's minimum, one rung per 2 s.
* A rung is removed after **6 s** of FPS above target + 8, one rung per 6 s.
* Nearby building geometry, the player/vehicle models, MSAA/FXAA/HDR and the tile cache are **never** touched.
* The ladder starts only after the boot gate reports ready. The current rung, effective resolution scale and the reason
  for the last move are in Diagnostics ("Adaptive step") and in the store (`adaptive`).

### 1.3 Boot readiness gate (`src/perf/readiness.ts`, `TerraEngine.awaitReadiness`)

The top-right pill says **ready** only when all of the following hold:

1. a terrain provider is active and `globe.tilesLoaded` has been true at least once;
2. Natural Earth vectors, the place index and the climate atlas are loaded — or **explicitly degraded** with a reason
   that is listed in Diagnostics (e.g. "climate atlas built without measured elevation");
3. an imagery layer is present;
4. FPS ≥ the preset's minimum **sustained for 3 s**.

Until then the pill reads "Streaming… / Warming up (xx fps)". A **failed** required layer turns the pill and the loading
card into an error with the reason; the pill never says ready in that state. If no terrain tile arrives within 45 s the
engine falls back to the flat ellipsoid and lists it as a degradation (a blank globe is never "ready").

Software renderers (SwiftShader, llvmpipe…) cannot reach 30 fps, so the gate is relaxed to 1 fps **with a visible
note** ("FPS gate relaxed to 1 fps: software renderer, not a GPU"). `?terraMinFps=<n>` overrides the minimum
(`0` disables the gate); tests use `?terraMinFps=1` and `?terraMinFps=1000`.

### 1.4 Measurements available at runtime (`src/engine/streaming.ts`, Diagnostics panel)

Rolling **10 s** window of frame times → current FPS (last second), average FPS, **1 % low** (1000 / p99 frame time),
mean frame ms, **p99 frame ms**, JS heap (Chromium only), globe tiles rendered, primitives (recursive), draw commands
(`frameState.commandList.length`, read in `postRender`), actors (gameplay `stats()` counts + ambient traffic). VRAM is
reported as **"not exposed by WebGL"** — there is no API for it. The Diagnostics panel also shows the detected
hardware (logical cores, `navigator.deviceMemory`, GPU vendor/renderer, WebGL2 + ANGLE backend parsed from the renderer
string, max texture size, screen and DPR) and a **Benchmark (20 s)** button that appends a JSON line to the log.
"Copy report" copies hardware, quality, adaptive state, readiness, streaming and the log.

### 1.5 Budgets

| System | Budget |
|---|---|
| Simulation | full simulation only within ~300 m of the player, statistical beyond; unload when far |
| Hot loops | no per-frame allocations (frame window is a preallocated ring buffer; stats sort into a scratch buffer at most every 100 ms) |
| Terrain | `tileCacheSize` per preset (100–800), IndexedDB tile cache budget in Settings |
| OSM | ≤ 48 tiles, altitude-scaled radius, unload beyond 2.2× radius |
| Near field | ≤ 2 generations in flight, ≤ 64 cached tiles, unload beyond 4R, vertex cap per tile |
| Traffic | ≤ 500 × `trafficDensity` vehicles, ≤ 2 500 lamps, hidden above 3.5 km |
| Requests | `RequestScheduler.maximumRequestsPerServer = 12` |

## 2. Methodology (`scripts/measure-performance.mjs`)

```
npm run build && npm run perf            # full run (≈ 20–25 min on SwiftShader, ≈ 8 min on a GPU)
npm run perf -- --quick                  # CI: 3 spots × 5 s, 40 s soak
npm run perf -- --url=http://127.0.0.1:5173/?terraFixtures=1 --quality=low --min-fps=1
```

1. Starts `vite preview` on the production build (or measures `--url`), launches headless Chromium at 1920×1080 with
   `--js-flags=--expose-gc`, waits for the boot gate (`window.__terra.ready`), and records the hardware block.
2. Flies to each benchmark spot, waits for tile streaming to settle (bounded), then runs the **in-app benchmark**
   (`window.__terra.benchmark(20)`): every frame for 20 s → current / average / 1 % low FPS, mean and p99 frame ms,
   heap, globe tiles, draw commands, primitives, actors and the adaptive rung in force.

   | Spot | Position | Height |
   |---|---|---:|
   | Mumbai Marine Drive / CSMT traffic area | 18.9432, 72.8236 | 300 m |
   | Rural Maharashtra near Satara | 17.60, 74.05 | 300 m |
   | SGIS-inspired campus (procedural) | 16.7335, 74.4015 | 300 m |
   | Train corridor near Lonavala | 18.75, 73.41 | 300 m |
   | Air-travel view over Mumbai | 19.09, 72.87 | 3 000 m |
   | Konkan coast, Ganpatipule | 17.146, 73.265 | 300 m |
   | Taj Mahal, Agra | 27.1751, 78.0421 | 300 m |

   Coordinates are approximate reference values, not surveyed positions.
3. **Traversal soak**: 5 minutes in walk mode with W held (a short turn every 7 s), teleporting between the campus and
   the Mumbai spot every minute. Heap is sampled every 10 s after a forced GC; p99 frame time per minute. The run
   **fails** when the heap grows > 25 % from minute 1 to minute 5 or the p99 doubles.
4. Prints the Markdown tables and writes `docs/performance-<stamp>.json` (hardware, readiness/degradation list, every
   row, soak samples, page errors).

## 3. Recorded numbers — SwiftShader software rendering (NOT a GPU)

Environment for every run below: cloud sandbox, 4 vCPUs, 8 GB, headless Chromium, renderer
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`,
`WebGL2 via ANGLE (SwiftShader (Vulkan software rasteriser))`, VRAM not exposed by WebGL, synthetic OSM fixture
(`TERRA_FIXTURES=1`; the real Overpass/terrain hosts are blocked here, so the terrain fell back to the flat ellipsoid
and the climate atlas was built without elevation — both listed as degradations by the gate).

### 3.1 Quick run, 2026-09-07 (`docs/performance-2026-09-07T13-45-36-612Z.json`)

`--quick --quality=low --min-fps=1`, dev server, 1920×1080, 5 s per spot, 40 s soak. Because the frame rate is far
below even the relaxed 1 fps minimum, the **adaptive ladder had reached rung 9–10** (resolution 0.5 × 0.75) at every
spot — these numbers are therefore the *degraded* configuration, which is what the contract prescribes on such a
machine.

| Spot | Avg FPS | Current FPS | 1 % low | Frame ms | p99 ms | Heap MB | Globe tiles | Draw calls | Actors | Adaptive step |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mumbai Marine Drive / CSMT traffic area | 0.6 | 0.6 | 0.4 | 1755.9 | 2656.2 | 89 | 17 | 97 | 300 | 9 |
| SGIS-inspired campus (procedural) | 0.8 | 0.8 | 0.4 | 1302.5 | 2634.7 | 144 | 17 | 95 | 150 | 10 |
| Air-travel view over Mumbai (3 000 m) | 3.8 | 3.8 | 1.3 | 261.6 | 798.9 | 105 | 18 | 108 | 150 | 10 |

Soak (40 s, quick): heap 100.5 → 100.9 → 99.9 MB (−1 %), p99 2 708 ms, 1.22 fps average, **PASS** (no growth). Boot to
ready took 94.7 s, of which 45 s was the terrain-host timeout before the ellipsoid fallback.

### 3.2 Full run, 2026-09-08 (`docs/performance-2026-09-08T04-12-22-114Z.json`)

`node scripts/measure-performance.mjs --url=http://127.0.0.1:4173/ --quality=medium --min-fps=0` on the production
build (`vite preview`), 1920×1080, **20 s per spot, 5-minute soak**. `--min-fps=0` disables the FPS gate *and* keeps
the ladder idle (rung 0), so these are the **undegraded medium preset** numbers — the plain cost of the scene in
software. Boot to ready 105.8 s (45 s of it the terrain-host timeout). **OSM was offline in this run** (the preview
server does not serve the synthetic fixture unless `?terraFixtures=1` is in the URL), so no buildings or traffic were
present and the actor count is 0 — see the fixture run below for the traffic case.

| Spot | Avg FPS | Current FPS | 1 % low | Frame ms | p99 ms | Heap MB | Globe tiles | Draw calls | Actors | Adaptive step |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mumbai Marine Drive / CSMT traffic area | 1.1 | 1.1 | 0.3 | 874.2 | 3345.5 | 77 | 26 | 32 | 0 | 0 |
| Rural Maharashtra near Satara | 1.3 | 1.3 | 0.4 | 753.5 | 2363.5 | 102 | 32 | 22 | 0 | 0 |
| SGIS-inspired campus (procedural) | 1 | 1 | 0.3 | 959.2 | 3553.3 | 81 | 32 | 60 | 0 | 0 |
| Train corridor near Lonavala | 1.3 | 1.3 | 0.3 | 751.7 | 2956.5 | 73 | 34 | 25 | 0 | 0 |
| Air-travel view over Mumbai (3 000 m) | 1.2 | 1.2 | 0.4 | 858.3 | 2695.8 | 91 | 29 | 61 | 0 | 0 |
| Konkan coast, Ganpatipule | 1.3 | 1.3 | 0.4 | 770.3 | 2325.2 | 93 | 36 | 27 | 0 | 0 |
| Taj Mahal, Agra | 1.1 | 1.1 | 0.4 | 919.2 | 2745.1 | 132 | 34 | 74 | 0 | 0 |

Traversal soak (300 s walking, campus ↔ Mumbai, GC forced before each heap sample):

| Soak minute | p99 ms | Avg FPS | Frames |
|---:|---:|---:|---:|
| 1 | 4516.3 | 0.67 | 41 |
| 2 | 6831 | 1.06 | 68 |
| 3 | 7129.9 | 0.96 | 64 |
| 4 | 6647.8 | 1.07 | 64 |

Heap samples (s → MB): 11→87.7, 22→93.4, 33→89, 44→89.7, 54→89.7, 101→81.6, 112→84.2, 123→84.6, 188→94.8,
237→82.2, 247→86.5. Minute 1 → last sample: 89.7 → 86.5 MB (**−3.6 %**), p99 4.5 s → 6.6 s (< 2×): **PASS**. Only four
per-minute rows exist because each teleport between the two spots waits up to 60 s for tiles, which eats into the
300 s budget at this frame rate. No page errors.

What this run says: in software rendering the scene costs ~0.75–0.95 s per frame at 1080p regardless of spot (the
globe material, atmosphere and post-processing dominate; draw calls are only 22–74), the 1 % low is 0.3–0.4 fps, and
five minutes of continuous walking does not grow the heap. It says nothing about a GPU.

### 3.3 Full run with the synthetic OSM fixture (traffic present), 2026-09-08 (`docs/performance-2026-09-08T04-36-37-315Z.json`)

Same build, viewport and flags as 3.2 but with `?terraFixtures=1`, so every spot has synthetic OSM buildings, roads
and the simulated traffic (the vehicle cap 500 × 0.8 = 400 is reached everywhere: "Actors 400").

| Spot | Avg FPS | Current FPS | 1 % low | Frame ms | p99 ms | Heap MB | Globe tiles | Draw calls | Actors | Adaptive step |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mumbai Marine Drive / CSMT traffic area | 18.9 | 18.9 | 12 | 53 | 83.1 | 83 | 26 | 110 | 400 | 0 |
| Rural Maharashtra near Satara | 0.5 | 0.5 | 0.1 | 2039.8 | 9993.8 | 88 | 32 | 139 | 400 | 0 |
| SGIS-inspired campus (procedural) | 0.3 | 0.3 | 0.1 | 2907.6 | 8343.8 | 91 | 32 | 143 | 400 | 0 |
| Train corridor near Lonavala | 0.3 | 0.3 | 0.1 | 3215.3 | 9619.6 | 80 | 34 | 144 | 400 | 0 |
| Air-travel view over Mumbai (3 000 m) | 0.5 | 0.5 | 0.2 | 1823.7 | 6348.4 | 117 | 29 | 194 | 400 | 0 |
| Konkan coast, Ganpatipule | 17.4 | 17.4 | 6 | 57.5 | 168 | 98 | 36 | 141 | 400 | 0 |
| Taj Mahal, Agra | 0.4 | 0.4 | 0.1 | 2377.4 | 9716.3 | 103 | 2 | 49 | 400 | 0 |

| Soak minute | p99 ms | Avg FPS | Frames |
|---:|---:|---:|---:|
| 1 | 9216.4 | 0.53 | 13 |
| 2 | 9930.5 | 0.44 | 32 |
| 3 | 9475.3 | 0.48 | 29 |

Heap (s → MB): 20→89, 31→89.1, 43→89.3, 57→89.3, 174→85.6, 285→91.2; minute 1 → last: 89.3 → 91.2 MB (**+2.1 %**),
p99 9.2 s → 9.5 s: **PASS** (three per-minute rows only — at 0.5 fps the teleports' tile waits consume most of the
300 s).

Two rows need a caveat: the **Mumbai (18.9 fps) and Ganpatipule (17.4 fps)** values are far above every other spot
and above the same spots without the fixture (1.1 fps in 3.2). With the fixture on, the software rasteriser rendered
those two coastal frames an order of magnitude faster while still issuing 110–141 draw commands; the most likely
explanation is that little of the fill-heavy globe/ocean/near-field content was actually visible from the resolved
camera position (e.g. the view resolved inside or below synthetic geometry), but **this run did not verify that** and
the two numbers should not be quoted as representative. Everything else is consistent with 3.2 plus the cost of the
buildings and 400 vehicles: 0.3–0.5 fps, p99 6–10 s.

### 3.4 Summary of the software runs

| Configuration | Typical ground spot | Soak |
|---|---|---|
| low preset, ladder active (rung 9–10), fixtures (3.1) | 0.6–0.8 fps, p99 ≈ 2.6 s | 40 s, heap −1 %, PASS |
| medium preset, ladder idle, no OSM (3.2) | 1.0–1.3 fps, p99 2.3–3.6 s | 300 s, heap −3.6 %, p99 4.5→6.6 s, PASS |
| medium preset, ladder idle, fixture buildings + 400 vehicles (3.3) | 0.3–0.5 fps, p99 6–10 s | 300 s, heap +2.1 %, p99 9.2→9.5 s, PASS |

The heap stays between 73 and 132 MB in every run and never trends upward over five minutes of walking; frame time in
software is dominated by fragment work, which is the part a GPU removes. None of this measures a GPU.

## 4. What is verified and what is not

**Verified in headless Chromium (SwiftShader) with passing tests**

* Frame statistics (percentiles, rolling window, 1 % low) — unit tests `tests/unit/perf/frameStats.test.ts`.
* Readiness state machine, including "never ready while a required layer failed" — `tests/unit/perf/readiness.test.ts`
  and the e2e spec `tests/e2e/perf.spec.ts` (the pill only turns ready after tiles loaded once and the FPS gate passed;
  with `?terraMinFps=1000` it stays on "Warming up (x fps)" indefinitely).
* Degradation ladder order, reversibility and the "never nearby buildings/player" rule — `tests/unit/perf/ladder.test.ts`;
  the e2e spec watches the ladder climb to rung ≥ 7 in the live engine (resolution untouched until rung 6, then
  0.9…0.5 × preset, ocean/vegetation/traffic/draw distance changed as specified) and return to rung 0 when the Settings
  toggle is switched off.
* Hardware detection and ANGLE parsing — `tests/unit/perf/hardware.test.ts`; the live block is asserted in e2e.
* Benchmark aggregation — `tests/unit/perf/benchmark.test.ts`; the in-app benchmark and its JSON log line in e2e.
* The measurement script itself (`--quick`) produced the table above.

**Not verified**

* **60 fps (performance/low/medium/high) and 30 fps (ultra) on a GPU.** No GPU has run this build. The sandbox
  numbers (0.6–3.8 fps at 1920×1080 in software) cannot be extrapolated.
* The 5-minute soak passed in software (heap −3.6 %, p99 < 2×), but at ~1 fps the walker covers very little ground
  per minute; the soak on a GPU will stream far more content and is the run that matters.
* Behaviour of the ladder on a real GPU (it should sit at rung 0 on hardware that meets the target).

## 5. Measuring on a real GPU

On a machine with a graphics card and network access to the terrain/OSM hosts:

```
npm ci
npm run build && npm run perf
```

Then paste the printed **Renderer**, **Hardware** lines and both Markdown tables into section 3 of this file, keep the
generated `docs/performance-<stamp>.json`, and state the preset used (the script records `preset` — pass
`--quality=high` etc. to force one). If the soak prints `FAIL`, the heap growth or p99 doubling is a bug to file with
the JSON attached. For a one-off check without the script: open the app, wait for the pill to say ready, open
Diagnostics and press **Benchmark (20 s)**; the JSON line appears in the log and in "Copy report".
