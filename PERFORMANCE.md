# Performance

Measurements are produced by `npm run perf` (`scripts/measure-performance.mjs`) in headless Chromium and written to `docs/performance-<timestamp>.json`. **Numbers below are only ever copied from those files; nothing is estimated.**

## Environment caveat

The development sandbox used to build this project has no GPU: Chromium renders through **SwiftShader** (software Vulkan on 4 vCPUs). Frame rates measured there are 1–5 fps and are not representative of the 60/30 fps targets, which require a real GPU. The perf script records the renderer string alongside every measurement so the two are never confused.

## Latest measurements

See `docs/performance-*.json`. Summary table (filled in by the maintainer after running the script on real hardware):

| Location | Renderer | FPS | Frame ms | Terrain tiles | Heap MB |
|---|---|---:|---:|---:|---:|
| (run `npm run perf`) | | | | | |

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
