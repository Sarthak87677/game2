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
* Regression check of the pre-existing specs on this branch (`smoke.spec.ts`, `city.spec.ts`, same dev server): 5 of 7
  pass; `city.spec.ts` (building collision lookup returns null) and the smoke "search navigates by place name" test
  fail — **both fail identically on a clean `main` worktree in this sandbox** (verified side by side on port 5181), so
  they are environment/timing issues of the sandbox, not regressions from this track.
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
