# Track: unreal — final summary

Branch `claude/track-unreal`. Environment: cloud sandbox, **no Unreal Engine, no GPU**. Everything under `unreal/`
is a scaffold that has never been compiled; the exporter and its test are the only parts verified here.

## What exists

* `scripts/export-unreal-data.mjs` (+ `.d.mts`): exports `src/data/maharashtra/**` to
  `unreal/TerraInfinite/Content/Data/*.json` (10 tables + `Manifest.json`) through Vite's SSR loader; shape-based
  table detection, deterministic output, `--check` mode; npm scripts `unreal:export` / `unreal:check`.
* `tests/unit/exportUnrealData.test.ts`: 11 tests — committed tables equal a fresh export, one-to-one spawn mapping
  with provenance notes, detection contract for every table type, campus/grammar normalisation, duplicate ids
  rejected, determinism.
* `unreal/TerraInfinite/TerraInfinite.uproject` (UE 5.4; Cesium for Unreal, Chaos Vehicles, Enhanced Input,
  Niagara, Water, PCG, MassEntity/MassGameplay/MassAI/MassCrowd/ZoneGraph, MassTraffic optional, ModelingTools off).
* `Config/DefaultEngine.ini`, `DefaultGame.ini`, `DefaultInput.ini` (18 Enhanced Input actions + KBM/gamepad
  bindings declared in config), `DefaultScalability.ini` (Low/Medium/High/Ultra/Performance, dynamic resolution,
  TSR, degradation ladder: distant shadows → reflections → foliage → traffic → draw distance), `Secrets.ini.example`,
  `.gitignore`.
* `Source/TerraInfinite/` (46 files, ~5 400 lines): Build.cs + targets; `TerraGameMode`, `TerraPlayerController`,
  `TerraInput`, `TerraGameSettings`, `TerraSecretsSubsystem`; `TerraPlayerCharacter` (walk/run, step height +
  walkable angle for stairs, elevator riding, parkour jump assist + ledge mantle, fall protection fade-to-respawn),
  `TerraMovementVolumes` (elevator, parkour zone, rooftop railing); `TerraVehiclePawn` (Chaos wheeled pawn with
  lights/indicators/hazards/horn/wipers/scuff FX/stuck + flip reset); `UGeoStreamingSubsystem` (cell grid, nearest
  first, per-frame count + ms budget, hysteresis unload, producer interface); `UInteriorGeneratorSubsystem`
  (coordinate-seeded plans from the grammar table, hero Level Instances by id, instanced-cube shells with doors,
  stairs, lift, roof railing); `UJourneySubsystem` (rail/air/marine state machine, speed profile, great-circle
  flights with climb/descent, passenger view target with free-look); `UPerfDiagnosticsSubsystem` (FPS
  current/avg/1 % low, thread/GPU ms, RAM, VRAM via `RHIGetTextureMemoryStats`, draw calls, actors, cells; hardware
  probe; overlay; benchmark runner writing `Saved/Benchmarks/*.json`; quality governor); `UActivitySubsystem`
  (proximity interactions from data tables + per-cell activities); `UTerraDataSubsystem` (JSON → row structs);
  ten `FTerra*Row` headers; `FTerraGeo` Cesium wrapper.
* `docs/UNREAL.md`: requirements, credentials/licensing, data pipeline, build steps, benchmark map recipe, console
  commands, verification gates, known skeletons.
* `docs/PLAN_MAHARASHTRA.md`: additive "Unreal export contract" section; `PROJECT_STATUS.md` track section;
  `ATTRIBUTIONS.md` / `DATA_SOURCES.md` entries for the Unreal-side sources.

## What is verified (in this sandbox)

* `npm run typecheck && npm run lint && npm test` pass (228 tests, 24 files) on every commit of this branch.
* `node scripts/export-unreal-data.mjs` regenerates identical tables; `--check` exits 0; the test fails if the
  committed JSON drifts from the source data.

## What is NOT verified and needs a real machine

* **Compilation.** Not one file under `Source/` has been through UnrealHeaderTool or a C++ compiler. Expect API
  drift, especially in `Geo/TerraGeo.cpp` (Cesium for Unreal version), `Perf/PerfDiagnosticsSubsystem.cpp` (RHI
  stat globals) and `Vehicles/TerraVehiclePawn.cpp` (Chaos component API).
* **Running.** No map exists (binary assets cannot be authored here); `docs/UNREAL.md` gives the recipe.
* **Every gameplay claim** (spawn on terrain, stairs, lifts, parkour, fall protection, driving, journeys, interiors,
  benchmark JSON, governor). They are listed as open gates 1–10 in `docs/UNREAL.md`, not as done.
* **Screenshots.** None for Unreal; the common brief's "done" bar (e2e + screenshot) cannot be met for this track.

## Known skeletons

Room furnishing (logs only), vehicle wheel setup (needs an original skeletal mesh), journey vessel bodies (cubes),
intermediate train stops, Mass crowd/traffic configuration, UMG HUD (hooks exist, widget does not).

## Files touched

```
package.json (two npm scripts)
scripts/export-unreal-data.mjs, scripts/export-unreal-data.d.mts
tests/unit/exportUnrealData.test.ts
unreal/TerraInfinite/**
docs/UNREAL.md, docs/tracks/unreal.md, docs/PLAN_MAHARASHTRA.md (additive section)
PROJECT_STATUS.md (track section), ATTRIBUTIONS.md, DATA_SOURCES.md (additive rows)
```
No file under `src/**` was modified.
