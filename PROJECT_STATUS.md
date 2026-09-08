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

## Track: vehicles (branch `claude/track-vehicles`, 2026-09-08)

**Completed**
* `src/gameplay/vehicles/catalog.ts`: eight original generic vehicles (hatchback, sedan, SUV, coupé, bus, taxi,
  truck, auto-rickshaw) with dimensions, paints, drive parameters, wheel/lamp positions, engine audio profile, horn.
* `VehicleBody.ts`: primitive bodies built once (chassis/cabin boxes, translucent glass, wheels that spin and steer,
  head/tail/brake/indicator/roof lamps, headlight beams, dashboard + steering wheel + wipers) moved by model matrices.
* `VehicleSystem.ts` (`vehicles`): 3 parked vehicles at every spawn point, showroom forecourts and the time-trial
  start (pooled: bodies built within 900 m, dropped beyond 1.6 km); "Enter <vehicle>" → drive mode via
  `setVehicleBody`/`driveParams`; "Exit vehicle" when stopped → walk mode by the door; C cycles third/first/
  dashboard cameras; automatic gear display P/R/N/D; speed, heading and destination bearing on the HUD; headlights
  (L, auto at dusk), indicators (Q/R), hazards (Z), horn (H, WebAudio), wipers in rain, tyre spray when wet,
  wet-road grip reduction, paint darkening after hard impacts, stuck-for-4-s reset (post-process fade, nearest road
  point or 5 m back), engine/road/horn audio through the `AmbientAudio.bus` hook.
* Ambient traffic (`src/world/traffic/`): road graph with shared-node and crossing junctions, two-phase signals with
  clearance, left-hand lane keeping, flow through junctions, car following, emergency braking for the player and
  pedestrians, density by local hour and place population, 400 m full / 1.5 km coarse / frozen beyond, 3D bodies
  lent by the vehicle system to the nearest traffic, exclusion circle for the time trial.
* Pedestrians (`Pedestrians.ts`): pooled walkers on pavements near the player, Maharashtra/India/generic clothing
  palettes, bobbing walk cycle with swinging legs, player and vehicle avoidance, time-of-day activity.
* Showroom (`src/gameplay/showroom/`, `showroom`): five curated approximate Maharashtra positions plus OSM
  `shop=car` nodes when online; generated interior (floor, glass front, six plinths with catalog vehicles,
  information stands with spec overlays, reception, lounge, workshop bay with a lifted vehicle, forecourt parking,
  test-drive exit); Inspect overlay with exterior-orbit / interior / dashboard / cinematic cameras; Test drive
  spawns the vehicle at the exit and seats the player with a return bearing on the HUD.
* Closed-course time trial near Lonavala (`courses.ts`, `CourseMarkers.ts`): gates with banners, start/abort
  interactions while driving, splits, best time in localStorage, traffic suppressed on the course during a lap.

**Tested (how)**
* `npm run typecheck && npm run lint && npm test` (unit: catalog integrity, gear logic, stuck detection, grip, impacts,
  bearings, nearest road, time-trial state machine, best-time storage, traffic density/signals/lanes, road graph
  junctions/turns/crossings, showroom layout, pedestrian palettes).
* `tests/e2e/vehicles.spec.ts` in headless Chromium (SwiftShader, synthetic OSM fixtures): spawn at the Gateway →
  enter the nearest parked vehicle → drive 5 s → speed > 0 and gear D → dashboard camera, indicator and headlights
  → stop → exit → walk mode; traffic stats show junctions, signals, pedestrians and lent bodies; Worli showroom
  builds, inspect overlay opens, orbit camera runs, test drive seats the player. Screenshots in `docs/screenshots/`
  (`vehicle-driving-third.png`, `vehicle-dashboard.png`, `showroom-floor.png`, `showroom-inspect.png`).

**Broken / limitations**
* No terrain or real OSM in the sandbox: everything above was verified on the ellipsoid with fixture roads; on real
  roads lane offsets, signals and the Lonavala course follow OSM geometry but were not driven here.
* Showroom walls have no collision (the interiors track owns `moveFilter`); the player can walk through them.
* Traffic bodies do not brake for parked vehicles; ambient vehicles ignore road elevation between vertices on
  bridges.
* Damage is paint darkening only (by design, non-graphic); wipers/spray are visible only in wet weather presets.

**Next**
* Drive the Lonavala course on real OSM roads with terrain online and tune checkpoint positions.
* Hand pedestrians to the living-world crowd system (shared contract in the plan) and add gatherings.
* Wall collision for the showroom once the interiors track's `moveFilter` contract is on `main`.
