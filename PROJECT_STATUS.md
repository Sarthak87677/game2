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

## Track: living-world-activities (branch `claude/track-living`, 2026-09-07)

**Completed**
* `crowds` system (`src/world/crowds/**`): pool of 120 billboard pedestrians (canvas-painted abstract figures, four walk
  frames, seven outfit kinds in regional colour palettes — sarees, kurtas, salwar-kameez, shirts, generic school
  uniforms), walking on a virtual pavement offset from loaded OSM roads (never on the carriageway, never on
  motorways/trunks), wandering around hotspot anchors where no roads are loaded, gathering at stalls, stepping aside for
  the player; density by place kind (hotspot table + OSM building counts) × local solar hour × weather; full simulation
  within 300 m, statistical estimate beyond; procedural stalls with generic Marathi/English sign boards, festival string
  lights toggle (persisted), synthesised regional ambience (city/village/forest/station/coast/hills + bells, chimes,
  crows, gulls, thunder) that runs only when the user has enabled audio.
* `wildlife` system (`src/world/wildlife/**`): cattle and street dogs in villages/rural areas, bird flocks (gulls on the
  coast, egrets over farmland, crows and pigeons in cities, small birds over forest/hills) with a cheap flock model,
  butterflies in parks/gardens/campus/lake fronts by day; pooled billboards within 300 m; sightings registry feeding the
  nature logbook.
* `monsoon` system (`src/world/climate/monsoon.ts`, `MonsoonSystem.ts`): Maharashtra phases (winter, hot dry, pre-monsoon,
  monsoon, retreat) → deterministic 6-hour weather blocks (heavy rain, storms, hill fog, dust in April–May) pushed through
  `engine.setWeather`, dry-season browning through the ground material's season tint. Toggle in the Activities tab.
* `activities` system (`src/gameplay/activities/**`): photography challenges (17 subjects, `P` key, heading + frustum
  check, golden-hour bonus), landmark collection (28, auto-collected on approach, "Read about" overlay), 8 cinematic
  heritage/scenic tours, nature observation logbook, 3 rail/road-trip checklists, 2 boat checkpoint courses, campus
  basketball (procedural court + hoop, projectile model, animated ball, streaks), 4 museums with fictional exhibit
  overlays, 6 park cleanups (litter billboards). Progress persists in localStorage; HUD status line via `gameplay.status`;
  "Activities" tab inside the Play panel (`src/ui/panels/ActivitiesTab.tsx`).
* Data: `src/data/maharashtra/living.ts` (all coordinates approximate, every entry carries a `dataNote`).
* Already covered by existing engine code and verified rather than re-implemented: wind-reactive crops (crop cards carry
  wind weight 1 in the vegetation shader), fruit on mango and coconut species (species library phenology).

**Tested (how)**
* `npm run typecheck && npm run lint && npm test` — 238 unit tests pass (21 new: monsoon phases/picks, photo scoring,
  persistence round-trip, basketball model, crowd density/time-of-day, palettes, walk network, ambience mix, flocks,
  sightings, data integrity).
* `tests/e2e/living.spec.ts` (headless Chromium, SwiftShader, synthetic OSM fixture, `TERRA_E2E_DEV=1 TERRA_E2E_PORT=5180`):
  spawn at Marine Drive → pedestrians > 0 (107–120 simulated), gulls/crows/pigeons present, monsoon preset active,
  landmark collected; spawn at the campus → basketball prompt offered, walk-over teleport, court built, a throw scored;
  spawn at the Gateway → facing the arch scores the photo and persists it, facing away does not. Passes in 5.5 min.
* Probe screenshots in `docs/screenshots/`: `living-crowd-csmt-forecourt.png`, `living-village-cattle.png`,
  `living-monsoon-mahabaleshwar.png`, `living-basketball-court.png`.

**Broken / limitations**
* The sandbox cannot reach the terrain host, so every living-world entity uses the player's surface height as the ground
  fallback; on real terrain the per-entity `globe.getHeight` refresh applies. Stalls and the court are flat (no slope
  adaptation beyond per-stall height sampling).
* Green-season tint is not applied to the ground material (that shader is owned by the perf/engine tracks); the monsoon
  shows through rain, fog, wetness darkening and the crowd thinning. Jackfruit is not in the species library (not owned
  by this track), so only mango/coconut fruit.
* Road markings on near-field roads were not attempted (GroundPrimitive cost on software GL).
* Pedestrians are camera-facing sprites, not skinned meshes; they do not avoid each other, only the player and roads.
* Boat checkpoint courses count in any mode; there is no vessel of our own — they hook the journeys track's ferries/boats.
* Ambience cannot be heard in headless tests; only the mixing rule is unit-tested and the layer state is reported in stats.

**Next**
* Skinned pedestrian meshes with real walk cycles and inter-pedestrian avoidance; crowd LOD by impostor atlas.
* Slope-aware stall/court placement on real terrain; road markings when a GPU is available.
* Green-season ground tint uniform (needs a small additive uniform in `groundMaterial.ts`).

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

## Track: unreal (2026-09-07)

**Completed**
* Shared-data exporter `scripts/export-unreal-data.mjs` → `unreal/TerraInfinite/Content/Data/*.json` (10 tables +
  manifest), shape-based detection, deterministic, `--check` mode, npm scripts `unreal:export` / `unreal:check`.
* Unreal Engine 5.4 project scaffold: `.uproject`, `DefaultEngine/Game/Input/Scalability.ini`,
  `Secrets.ini.example` + `.gitignore`, C++ module with game mode, config-built Enhanced Input, player character,
  Chaos vehicle pawn, geo cell streaming, interior generator, journey state machine, perf diagnostics + benchmark
  JSON + quality governor, activities, JSON data loader, one row struct per table. `docs/UNREAL.md` documents
  requirements, licensing, build, benchmark map and the open gates.

**Tested (how)**
* `tests/unit/exportUnrealData.test.ts` (11 tests) — committed tables equal a fresh export; detection contract per
  table; campus/grammar normalisation; duplicate ids rejected. `npm run typecheck && npm run lint && npm test` pass.

**Broken / not verified**
* The entire `unreal/` C++ module: never compiled (no Unreal, no GPU in the sandbox). No map, no screenshots, no e2e.
  Treat every gameplay claim for the Unreal client as *unverified* until gates 1–10 in `docs/UNREAL.md` close.
* Vehicle has no wheel setup (needs an original skeletal mesh); room furnishing is a logging stub; journey vessels
  are cubes; Mass crowd/traffic unconfigured; no UMG HUD.

**Next**
* On a workstation with UE 5.4+ and Cesium for Unreal 2.x: build, fix API drift, create `L_Benchmark`, run
  `terra.Benchmark.Run`, paste numbers into `PERFORMANCE.md`, add `docs/screenshots/unreal-*.png`.
* Re-run the exporter when the data/journeys/interiors tracks land their tables (the test will remind you).

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
  ladder at rung 9–10, soak heap −1 %).

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

## Track `maharashtra-data` (branch `claude/track-data`, 2026-09-07)

Full summary: `docs/tracks/data.md`.

**Completed**
* Maharashtra gazetteer: 260 annotated, approximate places (`src/data/maharashtra/cities.ts`, `destinations.ts`) incl. the 16 urban regions, hill stations, Konkan coast, forts, temples, caves, stations, airports, campuses, museums, parks, dams, and the external Taj Mahal hero destination; every entry has a `dataNote`.
* Offline synchronous search (`MaharashtraIndex`) merged into `TerraEngine.search`; all places appended to `WORLD_HIGHLIGHTS` (`mh-*`), five `showcase-maharashtra-*` areas with tours.
* Eight new landmark archetypes and 23 Maharashtra stand-ins (Gateway of India, CSMT, Sea Link, Haji Ali + causeway, Elephanta marker, stadiums, forts, Bibi Ka Maqbara, Deekshabhoomi, Ellora, Ajanta, temples), all labelled procedural.
* Taj Mahal hero (`src/world/hero/`): walkable gate, charbagh, terrace, plinth, mausoleum, minarets, mosque/jawab, approximate interior with "Enter mausoleum (approximate interior)"; streams within 6 km; procedural content excluded from its footprint.

**Tested (how)**
* `npm run typecheck && npm run lint && npm test`: 27 files / 238 unit tests pass (5 new Maharashtra test files).
* `tests/e2e/maharashtra.spec.ts` in headless Chromium (SwiftShader, fixture dev server): search resolves 12/12 named places; goTo Taj Mahal streams 5 hero primitives (~13 400 vertices) and a spawn on the plinth stands at base + 8 m; spawn at the Gateway of India lands in walk mode with a stand-in visible. First run: search and Taj tests passed; the Gateway test failed only on `landmarks.visible ≥ 1` because no terrain height was available offline — fixed by placing stand-ins on the ellipsoid after a 4 s grace period (re-run recorded in `docs/tracks/data.md`).
* Probe screenshots: `docs/screenshots/maharashtra-taj-mahal-{gate,platform,interior}.png`, `maharashtra-{gateway-of-india,csmt,shaniwar-wada,deekshabhoomi}.png`.

**Broken / limitations**
* Real OSM building footprints are not yet excluded from the Taj footprint (only procedural content is); `OsmLayer` belongs to no track in this plan.
* The sandbox blocked the terrain host during verification runs (base height 0 on the ellipsoid) and all OSM hosts; city probes use the synthetic fixture.
* Landmark bodies and the Taj are abstract massing models; coordinates are approximate (±200 m–1 km).

**Next**
* Exclude OSM buildings inside hero footprints; feed `MaharashtraIndex.nearest` into the HUD readout; richer Taj lawns using the vegetation species library; verify on a GPU machine with network access.
