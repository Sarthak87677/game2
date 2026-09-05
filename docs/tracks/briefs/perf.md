TRACK: perf — branch `claude/track-perf`

Goal: implement the mandatory performance contract in the browser client and prove it with recorded measurements.

Deliverables:
1. `src/perf/hardware.ts`: detect and record CPU logical cores, device memory, GPU vendor/renderer (WEBGL_debug_renderer_info),
   graphics API string (WebGL2 + ANGLE backend parsed from the renderer string), max texture size, screen resolution
   and devicePixelRatio, and note VRAM as "not exposed by WebGL". Store in `useTerraStore` (`hardware` slice) and show
   in Diagnostics and in the copied report.
2. `src/engine/streaming.ts` (extend `StreamingMonitor`): rolling 10 s window of frame times → current FPS, average
   FPS, 1 % low FPS (99th percentile frame time), frame time ms, p99 frame ms, JS heap, globe tiles rendered
   (`scene.globe._surface._tilesToRender.length` guarded), primitives count (`scene.primitives.length` recursive),
   draw commands (`scene.frameState.commandList.length` read in postRender, guarded), actors (sum of gameplay
   `stats()` counts when present). Keep `StreamingSnapshot` backward compatible (add fields).
3. `src/engine/quality.ts`: presets Low / Medium / High / Ultra plus `performance` ("60-FPS Performance Mode": resolution
   0.7, no shadows, no AO/bloom, vegetation 0.25, near-field 250 m, traffic 0.4, clouds off) and a `targetFps` and
   `minFps` per preset (performance 60/45, low 60/30, medium 60/30, high 60/30, ultra 30/24). Expose
   `degradationLadder` — an ordered list of reversible steps applied when FPS < minFps for 2 s and undone when FPS >
   targetFps+8 for 6 s: distant shadow distance → ocean reflections → vegetation density → traffic density → near-field
   radius/draw distance → dynamic resolution scale (0.9 → 0.5 in 0.1 steps) — never nearby building or player quality.
   Implement it in `src/perf/adaptive.ts` (`AdaptiveQuality` running from the streaming monitor) with a store readout
   (`quality.adaptive: { step, resolutionScale, reason }`) and a Settings toggle "Protect frame rate (dynamic
   resolution)" defaulting on.
4. Ready gating in `TerraEngine.loadDataInBackground`: `boot.phase = 'ready'` only when (a) terrain provider is active
   and `globe.tilesLoaded` has been true at least once, (b) Natural Earth, gazetteer and climate atlas loaded (or
   explicitly degraded with a listed reason), (c) the imagery layer is present, and (d) FPS ≥ preset minFps for a
   sustained 3 s. Otherwise phase stays 'data' with message "Streaming… / Warming up (xx fps)" and, if a required layer
   failed, phase 'error' with the reason. The top-right pill must never say "ready" while a required layer failed.
   Write the readiness logic in `src/perf/readiness.ts` with unit tests.
5. Diagnostics panel: current FPS, average FPS, 1 % low, frame time, p99, memory, VRAM (n/a note), active tiles,
   actors, draw calls, adaptive step, hardware block, and a "Benchmark" button that runs a 20 s in-app benchmark at the
   current spot and appends a JSON line to the log.
6. `scripts/measure-performance.mjs`: measure at the Maharashtra benchmark spots (Mumbai Marine Drive / CSMT traffic
   area 18.9432,72.8236; rural Maharashtra near Satara 17.60,74.05; SGIS-inspired campus 16.7335,74.4015; a train
   corridor point near Lonavala 18.75,73.41 at 300 m; an air-travel view 19.09,72.87 at 3 000 m; Konkan coast
   Ganpatipule 17.146,73.265; Taj Mahal 27.1751,78.0421) with current/avg/1 % low FPS, frame ms, p99, heap, tiles,
   draw calls, plus a 5-minute traversal soak (walk mode moving continuously through the campus and Mumbai spots;
   record heap every 10 s and p99 frame time per minute; fail the run if heap grows > 25 % from minute 1 to minute 5
   after GC settles or p99 doubles). Print a Markdown table and write `docs/performance-<stamp>.json`. Accept
   `--quick` for CI.
7. `docs/PERFORMANCE.md`: replace with the contract, the methodology, the recorded SwiftShader numbers (clearly labelled
   as software rendering, not a GPU), the hardware block, and the exact command for the user to run on a real GPU
   (`npm run build && npm run perf`) with instructions to paste the table. State plainly that 60/30 fps could not be
   verified in the sandbox and what evidence exists.
8. Unit tests for the frame statistics (percentiles), readiness state machine, and the degradation ladder; an e2e test
   that the "ready" pill only appears after tiles loaded and FPS gate passed (use `?terraQuality=low` and a relaxed
   minFps override `?terraMinFps=1` for SwiftShader).
