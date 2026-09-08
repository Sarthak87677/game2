# Terra Infinite — Maharashtra-first plan and integration contract

This document is the single coordination point for the Maharashtra vertical slice. Every track (human or agent
session) works against the contracts below so that branches merge cleanly.

## Architecture (corrected)

1. **Principal game client — Unreal Engine 5** (`unreal/TerraInfinite`): Cesium for Unreal streaming, World
   Partition/HLOD, Nanite, Lumen, VSM, TSR, Chaos Vehicles, Mass crowds/traffic, Niagara, Water, PCG, Level Instances
   and Data Layers for interiors. It is scaffolded as C++ + config + data tables and **cannot be built in the cloud
   sandbox** (no Unreal install, no GPU); it builds on a workstation with UE 5.4+ and Visual Studio 2022 / Xcode.
2. **Browser client (this repository, CesiumJS)** stays as the *companion world map and destination launcher* and, until
   the Unreal client runs on a real machine, as the *running vertical slice* where every gameplay system (walk, drive,
   interiors, rail, air, ferry/cruise, campus, Taj Mahal) is prototyped and verified end-to-end in headless Chromium.
3. **Shared data layer** (`src/data/maharashtra/*`, exported to `unreal/TerraInfinite/Content/Data/*.json` by
   `scripts/export-unreal-data.mjs`): destinations, stations, corridors, airports, ports, water routes, campus spec,
   interior grammar. One source of truth for both clients.

## Contracts (already on `main`)

* `src/gameplay/types.ts` — `GameplaySystem { id, label, update?(ctx), interactions?(ctx), stats?(), onSpawn?(), destroy?() }`,
  `Interaction { id, label, lat, lon, radiusM, priority?, modes?, run }`, `GameplayOverlay`, `SpawnPoint`.
* `src/gameplay/GameplayHost.ts` — runs systems each frame, picks the nearest interaction (prompt "E — …"),
  `showOverlay(overlay, onAction)` / `closeOverlay()`, `spawn(spawnPoint)`, `teleport(lat, lon, heading)`, `stats()`.
* `src/gameplay/registry.ts` — **the only shared registration file**: add exactly one line per system.
* `src/modes/ModeController.ts` — modes `orbit | fly | walk | drive | cinematic | passenger`;
  `setPassengerPose(position, headingRad)` (journeys own the camera in passenger mode, the player can free-look);
  `groundOverride` (interiors: floors/stairs/elevators replace terrain), `moveFilter` (walls), `addHeightSampler(fn)`
  (decks, campus geometry), `translateBody(delta)` (moving platforms), `setBody(lat, lon, headingDeg?, heightM?)`,
  `setVehicleBody(primitive)`, `driveParams`, `onFall(fallM)`.
* Store: `gameplay: { prompt, overlay, player, status, vehicle }` via `useTerraStore.getState().setGameplay(...)`.
* HUD: `InteractionPrompt`, `GameplayOverlayCard`, `PlayPanel` (spawn list from `src/data/maharashtra/spawns.ts`).
* **Additive hooks added by track `interiors-campus`** — `NearFieldWorld.buildingsNear(lat, lon, radiusM)` returns the
  procedural buildings of fully built near-field tiles as `[lon, lat]` footprints (used to offer enterable procedural
  buildings; optional, no behaviour change elsewhere). The `interiors` system exposes `activeLevel()`, `activePlan()`,
  `enter(candidate)`, `exit()`, `rideTo(floor)` and `campus` (hero campus layer with `heightAt`, `toLonLat`,
  `setBuildingHidden`) for tests and other systems; while an interior is active it owns `modes.groundOverride`,
  `modes.moveFilter` and the `gameplay.status` line, and it chains (never replaces) any existing `modes.onFall` handler.
* `window.__terra` (tests): `goTo`, `setMode`, `spawn(spawnPoint)`, `interact()`, `gameplay()`, `state()`,
  `benchmark(seconds?)` (perf track, optional).
* Performance contract (perf track, additive): store slices `hardware` (CPU/GPU/API/screen, VRAM "not exposed"),
  `adaptive` (`{ enabled, step, maxStep, stepLabel, resolutionScale, reason, fps, minFps, targetFps }` — the
  degradation-ladder readout; kept beside `quality`, which stays the preset id string other panels read) and
  `readiness` (boot gate decision: blocking items, degraded layers, FPS gate). `settings.protectFrameRate` toggles the
  ladder. `engine.effectiveQuality()` returns the preset after the ladder — systems that read a `QualitySettings`
  should use it rather than `QUALITY_PRESETS[...]`. Presets carry `targetFps`/`minFps`/`trafficDensity`/
  `oceanReflections`; `performance` is the fifth preset. URL: `?terraMinFps=<n>` overrides the boot gate's minimum
  frame rate (0 = no gate; SwiftShader auto-relaxes to 1 fps with a visible note). Gameplay `stats()` values whose keys
  mention actors/vehicles/passengers/crowds etc. are summed into the Diagnostics "Actors" count.

## Tracks and file ownership

| Track | Owns (may create/edit) | Must not edit |
|---|---|---|
| perf | `src/engine/quality.ts`, `src/engine/streaming.ts`, `src/perf/**`, `src/ui/panels/DiagnosticsPanel.tsx`, `SettingsPanel.tsx`, readiness code in `TerraEngine.loadDataInBackground`, `scripts/measure-performance.mjs`, `docs/PERFORMANCE.md` | gameplay systems |
| maharashtra-data | `src/data/maharashtra/{destinations,cities,index}.ts`, `src/data/bookmarks/*` (additive), `src/data/bookmarks/landmarkModels.ts` (additive), `src/world/landmarks/**` (new archetypes), Taj Mahal hero layer under `src/world/hero/**`, gazetteer search integration | ModeController |
| interiors-campus | `src/world/interiors/**`, `src/gameplay/interiors/**`, `src/data/maharashtra/campus.ts`, `src/data/maharashtra/interiorGrammar.ts` | vehicles, journeys |
| vehicles | `src/gameplay/vehicles/**`, `src/gameplay/showroom/**`, `src/data/maharashtra/showrooms.ts`, `src/world/traffic/**` (pedestrians additive) | interiors |
| journeys | `src/gameplay/rail/**`, `src/gameplay/air/**`, `src/gameplay/marine/**`, `src/data/maharashtra/{stations,corridors,airports,ports,waterRoutes}.ts` | vehicles |
| living-world-activities | `src/gameplay/activities/**`, `src/world/crowds/**`, `src/world/wildlife/**`, monsoon presets in `src/world/climate/*` (additive) | journeys |
| unreal | `unreal/**`, `scripts/export-unreal-data.mjs`, `docs/UNREAL.md` | `src/**` |

Every track: add one registration line to `src/gameplay/registry.ts`, one export line to
`src/data/maharashtra/index.ts` if it adds data, unit tests under `tests/unit/**`, an e2e spec under `tests/e2e/**`
that drives the feature through `window.__terra`, a probe screenshot in `docs/screenshots/`, and a section in
`docs/PROJECT_STATUS.md` (completed / tested / broken / next).

## Rules that apply to every line of code

* Nothing procedural is ever labelled real: interiors, campuses, landmark bodies, showrooms, vehicles, timetables and
  tickets carry a visible "procedural / fictional / approximate" note.
* Coordinates written from memory are approximate and say so in a `dataNote`.
* No credentials in source; no paid services; no copied branded assets, logos, maps, characters or UI.
* Non-violent: no weapons, injuries, crime, gambling, drugs or alcohol interactions. Rooftops have railings and
  fade-to-respawn; pubs are exterior scenery only.
* Never fake a feature: a system that is not verified by a passing test and a screenshot is listed as *broken* or
  *next*, not *done*.
* `npm run typecheck && npm run lint && npm test` must pass before every commit; e2e specs run with
  `TERRA_E2E_DEV=1` against the dev server (`?terraQuality=low`, `--use-angle=swiftshader`).

## Unreal export contract (additive, owned by the unreal track)

`scripts/export-unreal-data.mjs` reads the module namespace of `src/data/maharashtra/index.ts` and recognises
tables **by shape**, so tracks may name their exports freely:

| Table | Recognised when every array item has… |
|---|---|
| Spawns | `id, lat, lon, headingDeg, region, approximate` (`SpawnPoint`) |
| Destinations | `id, kind, district, lat, lon, overviewHeightM` |
| Stations | `id, code, platforms, lat, lon` |
| RailCorridors | `id, stations[], path[], service` |
| Airports | `id, iata, runwayHeadingDeg, runwayLengthM` |
| Ports | `id, kind ∈ {jetty,harbour,marina,cruise-terminal}, lat, lon` and no `district` |
| WaterRoutes | `id, vessel, path[], from, to` |
| Campuses / CampusBuildings | export **name** matches `/campus/i`; an object (or array of objects) with `id, name, origin|position|center, headingDeg, buildings[]`; each building `id, name, category|kind|type, position|lat/lon, headingDeg, widthM, depthM, floors|levels, footprint?` |
| InteriorGrammar | export **name** matches `/grammar/i`; an object keyed by category (or array with `category`) with `floorHeightM, corridorWidthM, roomMinM, roomMaxM, roomTypes[]` plus any numeric/string parameters |

Unknown fields are kept in `ExtraJson`; missing tables are exported empty and flagged `missing-in-source` in
`Content/Data/Manifest.json`. Run `node scripts/export-unreal-data.mjs` after changing data and commit the JSON;
`tests/unit/exportUnrealData.test.ts` fails otherwise. Optional `dataNote` fields on any row are carried through.

## Additive hooks added by tracks

* **maharashtra-data** — `LandmarkModel.hero?: string` (`src/data/bookmarks/landmarkModels.ts`): a stand-in whose body is rendered by
  a hero gameplay system; `LandmarkLayer` skips it. `applyHeroExclusions(tile)` (`src/world/hero/heroExclusions.ts`) is called once
  per generated near-field tile in `TerraEngine.generateNearFieldTile` and drops procedural placements/buildings/fields inside hero
  footprints (currently the Taj Mahal). `TerraEngine.search` merges `MAHARASHTRA_INDEX.search()` (`src/data/maharashtra/search.ts`)
  into the offline results by score (`mergeSearchResults`), de-duplicated by id and position. Maharashtra places are appended to
  `WORLD_HIGHLIGHTS` as `mh-*` bookmarks and five `showcase-maharashtra-*` areas to `SHOWCASE_AREAS`.
