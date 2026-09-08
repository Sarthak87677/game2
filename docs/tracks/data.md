# Track `maharashtra-data` — summary

Branch `claude/track-data`. Goal: make every important Maharashtra place searchable and reachable, add Maharashtra
landmark stand-ins, and build the Taj Mahal hero destination as walkable geometry.

## What works

### 1. Gazetteer (`src/data/maharashtra/cities.ts`, `destinations.ts`, `defineDestination.ts`)
* 71 cities/towns/hill stations/Konkan places (the 16 urban regions of the plan, the 6 hill stations, the Konkan list,
  district towns) and 189 destinations (monuments, forts, temples, caves, 25 stations, 10 airports, 17 campuses,
  9 museums, stadiums, 19 parks/reserves, dams, waterfalls) — 260 entries in `ALL_MAHARASHTRA_PLACES`, including the
  external `taj-mahal-hero`.
* Every entry has `kind`, `district`, `description`, `dataNote`, `overviewHeightM`, `tags` (kind, district and
  `maharashtra` are added automatically) and approximate coordinates; some carry a ground `spawn`.
* Coordinates are written from memory of public reference values (±200 m–1 km). Every note says so.

### 2. Search (`src/data/maharashtra/search.ts`)
* `MaharashtraIndex` — synchronous, offline, gazetteer-compatible scoring (exact > exact alias > prefix > word prefix >
  alias prefix > substring > fuzzy; multi-word queries match name + district/kind context). Aliases come from tags,
  bracketed alternative names and spawn names, so "CSMT", "VT", "Aurangabad", "SGIS", "Kolhapoor" resolve.
* `TerraEngine.search` merges its results into the offline results by score (`mergeSearchResults`), de-duplicated by
  id/bookmark id and by position, before the optional network geocoders run.
* All Maharashtra places are appended to `WORLD_HIGHLIGHTS` as `mh-*` bookmarks (`src/data/bookmarks/maharashtraHighlights.ts`)
  so they also show in the Highlights panel and the Natural Earth gazetteer; five `showcase-maharashtra-*` areas with
  tours (Mumbai waterfront, Pune old city, Kolhapur, Konkan coast, Western Ghats) are appended to `SHOWCASE_AREAS`.

### 3. Landmark stand-ins
* New archetypes in `src/world/landmarks/landmarkShapes.ts`: `stationHall`, `cableStayedBridge`, `fortWall` (ramparts,
  bastions, merlons, south gatehouse), `rockCutTemple`, `caveArc`, `shikhara`, `stadiumRing`, `causeway`.
* 23 models in `src/data/bookmarks/maharashtraLandmarks.ts` (appended to `LANDMARK_MODELS`): Gateway of India
  (archMonument 26 m), CSMT (stationHall), Bandra–Worli Sea Link (cableStayedBridge 5.6 km, heading 20°), Haji Ali
  dargah + causeway, Elephanta marker, Wankhede and DY Patil (stadiumRing), Rajabai tower, Global Vipassana Pagoda,
  Shaniwar Wada / Raigad / Sinhagad / Pratapgad / Panhala / Daulatabad (fortWall), Bibi Ka Maqbara (domedBuilding with
  four minarets), Deekshabhoomi (stupaTemple), Ellora Kailasa (rockCutTemple), Ajanta (caveArc), Mahalaxmi Kolhapur /
  Trimbakeshwar / Siddhivinayak (shikhara). All notes read "Procedural interpretation at the real position".
* `LandmarkModel.hero` flag: the old Taj Mahal `domedBuilding` stand-in is kept in the table but skipped by
  `LandmarkLayer` because the hero system renders it.

### 4. Taj Mahal hero (`src/world/hero/`)
* `tajMahalGeometry.ts` (pure): riverfront terrace with parapet, marble plinth with stair and balustrade, mausoleum
  (chamfered body, four iwans, drum, onion dome, finial, four chhatris), four minarets with balconies and chhatris,
  mosque and jawab with three domes each, charbagh (raised paths, long reflecting pool, central marble tank, sixteen
  lawn plots), cypress rows and ~60 trees, enclosure walls, the Great Gate (pishtaqs, corner turrets, kiosk row,
  walkable passage), forecourt, and an approximate central chamber (octagonal walls with niches, south passage, jali
  screen around two plain blocks, inner dome). `tajHeightAt(x, y)` is the walkability function.
* `TajMahal.ts`: gameplay system `taj-mahal` (registered in `src/gameplay/registry.ts`). Streams in within 6 km (5
  primitives, ~13 400 vertices, built once and cached), anchors on the highest terrain height under five anchor points
  and rebuilds when detailed terrain moves the base by > 0.5 m, registers a height sampler through
  `modes.addHeightSampler` so terraces, paths, plinth, gate passage and chamber are walkable and walls/minarets block
  (the walker's 60° wall rule), unloads beyond 6.6 km or above 60 km. Interactions: "Enter mausoleum (approximate
  interior)" at the south door (teleports into the chamber, overlay with the provenance note), "Leave mausoleum",
  "About this reconstruction" at the gate. Labels: "Taj Mahal (procedural hero reconstruction — approximate)".
* `heroExclusions.ts` + one line in `TerraEngine.generateNearFieldTile`: procedural urban blocks, fields and trees
  generated for tiles under the complex are dropped (before this, the procedural city of Agra buried the Taj).
* Materials: white marble tone, red sandstone for gate, mosque, terrace and walls; lawn/path/water/tree colours.

## How it was verified
* `npm run typecheck && npm run lint && npm test` — 28 unit test files, 238 tests passing (new:
  `tests/unit/maharashtra/{destinations,search,landmarks,tajMahal,heroExclusions}.test.ts`; `bookmarks.test.ts` updated
  to the 24 showcase areas).
* `tests/e2e/maharashtra.spec.ts` (headless Chromium, SwiftShader, `TERRA_E2E_DEV=1` against the fixture dev server):
  1. search resolves 12/12 named places offline (≥ 8 required);
  2. `goTo` Taj Mahal streams the hero (5 primitives, > 10 000 vertices), landmark table ≥ 50, spawning on the plinth
     puts the third-person camera above base + 8 m;
  3. spawn at the Gateway of India lands in walk mode at the spawn point with a stand-in visible.
  Run record (2026-09-07, sandbox, terrain host blocked, synthetic OSM fixture): run 1 — tests 1 and 2 passed, test 3
  failed only on `landmarks.visible ≥ 1` (no terrain height → stand-ins never placed); after adding the 4 s ellipsoid
  fallback in `LandmarkLayer`, run 2 — test 3 passed (3.6 min). All three tests pass on the pushed head.
* Probe screenshots (`scripts/dev/probe-scene.mjs`, daytime, `?terraQuality=low`; the city shots use `?terraFixtures=1` and a
  low camera 14–28 m up because the terrain host was blocked and the walker would otherwise stand on synthetic roofs) in
  `docs/screenshots/`:
  `maharashtra-taj-mahal-gate.png`, `maharashtra-taj-mahal-platform.png`, `maharashtra-taj-mahal-interior.png`,
  `maharashtra-gateway-of-india.png`, `maharashtra-csmt.png`, `maharashtra-shaniwar-wada.png`,
  `maharashtra-deekshabhoomi.png`.
* The sandbox blocks the terrain host in some runs (terrain tiles 0 → base height 0 on the ellipsoid) and all OSM
  hosts; city probes therefore use the synthetic OSM fixture. The height sampler, interactions and streaming were
  exercised in that environment.

## Not done / known gaps
* Real OSM building footprints (when online) are not excluded from hero footprints — `OsmLayer` is not this track's
  file; the hook only filters procedural content. Next: apply `applyHeroExclusions`-style filtering to OSM buildings.
* The Taj stand-in is a massing model: no inlay, calligraphy, pietra dura or real cenotaph decoration; the chamber is
  an approximate original interpretation. Lawns are flat colour (no vegetation species from the library).
* Landmark archetypes are abstract (e.g. CSMT's façade detail, the Sea Link's actual pier spacing). Positions are
  approximate.
* Search does not yet feed the HUD "nearest place" readout (`MaharashtraIndex.nearest` exists but is unused).
* Screenshots come from software WebGL at low quality (3–12 fps).

## Files touched
* New: `src/data/maharashtra/{cities,destinations,defineDestination,search}.ts`, `src/data/bookmarks/{maharashtraHighlights,maharashtraLandmarks,showcaseMaharashtra}.ts`,
  `src/world/hero/{TajMahal,tajMahalGeometry,heroExclusions}.ts`, `tests/unit/maharashtra/*.test.ts`, `tests/e2e/maharashtra.spec.ts`,
  `docs/screenshots/maharashtra-*.png`, `docs/tracks/data.md`.
* Edited (additive): `src/data/maharashtra/index.ts` (exports), `src/gameplay/registry.ts` (one line),
  `src/data/bookmarks/{highlights,showcase,landmarkModels}.ts` (spreads + `hero` field), `src/world/landmarks/{landmarkShapes,LandmarkLayer}.ts`,
  `src/engine/TerraEngine.ts` (search merge + hero exclusion call), `tests/unit/bookmarks.test.ts` (24 areas),
  `PROJECT_STATUS.md`, `ATTRIBUTIONS.md`, `DATA_SOURCES.md`, `docs/PLAN_MAHARASHTRA.md` (hooks section).
