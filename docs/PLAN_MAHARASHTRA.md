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
* `window.__terra` (tests): `goTo`, `setMode`, `spawn(spawnPoint)`, `interact()`, `gameplay()`, `state()`.

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

## Additive hooks added by the vehicles track (branch `claude/track-vehicles`)

All optional; nothing existing changes behaviour when they are unused.

* `AmbientAudio.bus(name)` (`src/engine/audio.ts`) → `{ ctx, gain } | null`: a named mix bus into the master gain for
  gameplay sound (engine, horn, activities). Null until audio is enabled from a user gesture, so re-ask each frame.
* `TrafficLayer.setPlayer(fn)`, `setBodyPool(pool)`, `setExclusion(zone)`, `roadsNear(lat, lon, r)`, `pedestrians`
  (`src/world/traffic/TrafficLayer.ts`): the embodied player for emergency braking and simulation focus; a pool of
  primitive vehicle bodies (`TrafficBody` interface) lent to the nearest ambient vehicles; a circle in which traffic is
  suppressed (closed-course time trial); road-graph access; the pooled pedestrian layer.
* `Pedestrians` (`src/world/traffic/Pedestrians.ts`) is constructed by `TrafficLayer` and exposes `positions()`,
  `stats()`, `maxWalkers` and the regional palettes (`paletteFor`). **Living-world track:** build crowds on this
  contract (read `engine.traffic.pedestrians.positions()` for avoidance, extend the palettes) rather than a second
  walker pool; gatherings/groups are yours.
* Store `gameplay.vehicle` gained optional fields `headingDeg`, `destination {name, bearingDeg, distanceM}`, `camera`,
  `damage` (`src/state/store.ts`); `InteractionPrompt` renders heading and destination when present (one line).
* OSM adapter: `node["shop"="car"]["name"]` is requested and parsed into `pois` with `kind: 'car_showroom'`
  (`overpass.ts`, `osmParse.ts`) so real dealership positions can host generated showrooms.
* `src/gameplay/vehicles/requests.ts`: `requestVehicle({...})` / `onVehicleRequest(fn)` — the showroom asks the
  vehicle system to spawn (and optionally enter) a catalog vehicle. Systems still never import each other's classes.
* Spawn points `lonavala-time-trial` and `showroom-worli` were added to `src/data/maharashtra/spawns.ts`.
* Keyboard: while driving, **H** is the horn (the hide-UI shortcut is suspended in drive mode), **C** cycles
  third/first/dashboard cameras, **L** headlights, **Q/R** indicators, **Z** hazards, **E** exits when stopped.
