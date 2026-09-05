# Performance

Measurements are produced by `npm run perf` (`scripts/measure-performance.mjs`) in headless Chromium and written to `docs/performance-<timestamp>.json`. **Numbers below are only ever copied from those files; nothing is estimated.**

## Environment caveat

The development sandbox used to build this project has no GPU: Chromium renders through **SwiftShader** (software Vulkan on 4 vCPUs). Frame rates measured there are 1–5 fps and are not representative of the 60/30 fps targets, which require a real GPU. The perf script records the renderer string alongside every measurement so the two are never confused.

## Latest measurements

Recorded by `npm run perf` on 2026-09-05 (`docs/performance-2026-09-05T05-15-25-320Z.json`), headless Chromium 1920×1080, **software renderer** "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero))), 4 vCPUs, default (medium) preset. These are software-rasteriser numbers and say nothing about GPU frame rates; they are recorded because they are the only honest measurement available from the build environment.

| Location | Renderer | FPS | Frame ms | Terrain tiles loaded | Heap MB |
|---|---|---:|---:|---:|---:|
| Orbit (24 000 km) | SwiftShader | 2.4 | 1364 | 5 | 68 |
| Himalaya, Everest (12 km AGL) | SwiftShader | 0.4 | 2548 | 62 | 169 |
| Manhattan (1.8 km AGL) | SwiftShader | 0.5 | 2181 | 123 | 237 |
| Zermatt ground (300 m AGL) | SwiftShader | 0.5 | 4846 | 200 | 220 |
| Antarctica (60 km AGL) | SwiftShader | 0.2 | 4490 | 271 | 221 |

Observations from this run:

* JavaScript heap stays between 68 MB (orbit) and 237 MB (city) across the journey — no unbounded growth.
* The run surfaced a real bug: hundreds of terrain-tile "errors" were throttled requests that the Terrarium provider turned into failures (Cesium then fell back to parent tiles). The provider now goes through Cesium's request scheduler so throttled tiles are retried; see the follow-up measurement below when available.
* Frame time is dominated by fragment work in SwiftShader (globe material + atmosphere); on a GPU these passes are negligible.

**No GPU measurement exists yet.** Run `npm run build && npm run perf` on a machine with a GPU and paste the printed table here with the renderer string.

## Budgets and controls

| Control | Where | Effect |
|---|---|---|
| Quality presets | `src/engine/quality.ts` | resolution scale, MSAA, shadows, AO, bloom, HDR, terrain SSE, tile cache size, vegetation density, near-field radius, cloud/particle budgets |
| Terrain tile cache | `scene.globe.tileCacheSize` per preset; IndexedDB PNG cache budget in Settings | bounds GPU/CPU memory and re-download |
| OSM tiles | `OsmLayer.maxTiles` (48), radius by altitude, abort of stale requests, unload beyond 2.2× radius | bounds geometry and Overpass load |
| Near-field tiles | `NearFieldWorld`: ≤2 generations in flight, ≤64 cached tiles, unload beyond 4R, vertex cap per tile | bounds draw calls and memory |
| Traffic | ≤500 vehicles, ≤2500 lamps, hidden above 3.5 km | point primitives only |
| Requests | `RequestScheduler.maximumRequestsPerServer = 12`, throttled | network fairness |

## Profiling checklist

1. Diagnostics panel: FPS, frame time, queued tiles, active requests, JS heap.
2. `npm run perf` before/after a change; keep the JSON files.
3. Chrome DevTools → Performance for CPU; `scene.debugShowFramesPerSecond` for GPU-bound checks.
4. Long journeys: the e2e test "memory stays bounded" flies between four cities and asserts heap growth < 3×.
