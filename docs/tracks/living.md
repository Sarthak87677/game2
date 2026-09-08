# Track summary — living-world-activities (`claude/track-living`)

Goal: make Maharashtra feel inhabited and give the player peaceful activities. Everything below is additive; the only
shared files touched are `src/gameplay/registry.ts` (four registration lines), `src/data/maharashtra/index.ts` (one export
line) and `src/ui/panels/PlayPanel.tsx` (a two-button tab bar that mounts `ActivitiesTab`).

## What works

| System | Files | Behaviour |
|---|---|---|
| `crowds` | `src/world/crowds/{CrowdSystem,Stalls,paths,density,palettes,sprites,placeContext,ambience}.ts` | 120 pooled billboard pedestrians (canvas sprites, 4 walk frames, 7 outfit kinds × 7 regional palettes), pavement paths from loaded OSM roads, wander/linger/stall-group behaviours, player avoidance, density by hotspot kind × local solar hour × weather, 300 m full simulation + statistical estimate, procedural stalls with generic Marathi/English signs, festival lights toggle, synthesised regional ambience. |
| `wildlife` | `src/world/wildlife/{WildlifeSystem,flocks,sprites,sightings}.ts` | Cattle (4 by day in villages/farmland), dogs, gull/egret/crow/pigeon/small-bird flocks (cheap orbiting flock model, 8–16 members), butterflies in gardens/parks/campus; pooled; sightings registry. |
| `monsoon` | `src/world/climate/{monsoon,MonsoonSystem}.ts` | Maharashtra season phases → deterministic 6-hour weather picks (rain/storm/fog in June–Sept, browning tint Feb–May, dust), applied on spawn and block change; user toggle persisted. |
| `activities` | `src/gameplay/activities/{ActivitiesSystem,scoring,persistence,basketball}.ts`, `src/ui/panels/ActivitiesTab.tsx` | Photography (`P`), landmark collection, cinematic tours (terrain-resolved keyframes), nature logbook, journey checklists, boat checkpoint courses, campus basketball (court + hoop + animated ball), museum overlays, park cleanup; progress in localStorage; status line; Activities tab. |
| data | `src/data/maharashtra/living.ts` | 23 crowd hotspots, 17 photo subjects, 28 landmarks, 8 tours, 3 checklists, 2 boat courses, 4 museums, 6 cleanup parks, the court, generic stall sign words. All approximate, every entry has a `dataNote`. |

Already satisfied by existing engine code (verified, not re-implemented): wind-reactive crops (crop cards carry wind
weight 1 in `VegetationMaterial`), fruit on mango and coconut species (species phenology windows).

## How it was verified

* `npm run typecheck && npm run lint && npm test` → clean; 398 unit tests after merging `origin/main` (21 new under `tests/unit/living/`).
* `tests/e2e/living.spec.ts` in headless Chromium (SwiftShader, synthetic OSM fixture):
  `TERRA_FIXTURES=1 nohup npx vite --host 127.0.0.1 --port 5180 &` then
  `TERRA_E2E_DEV=1 TERRA_E2E_PORT=5180 npx playwright test tests/e2e/living.spec.ts` → **1 passed (5.5 min)**.
  It checks: Marine Drive spawn → `Crowds: pedestrians` > 0 (107–120), wildlife birds present, `Season: preset` monsoon,
  a landmark auto-collected; campus spawn → prompt id starts with `basketball`, walk-over teleport, `Activities: court`
  = built, a throw returns a result and records 1 attempt; Gateway spawn → `takePhoto()` scores when facing the arch,
  fails when facing away, and the score persists in `terra-infinite.activities.v1`; no page errors, no gameplay errors
  in diagnostics.
* Regression check of the pre-existing specs on this branch (`smoke.spec.ts`, `city.spec.ts`, same dev server): 5 of 7
  pass; `city.spec.ts` (building collision lookup returns null) and the smoke "search navigates by place name" test
  fail — **both fail identically on a clean `main` worktree in this sandbox** (verified side by side on port 5181), so
  they are environment/timing issues of the sandbox, not regressions from this track.
* Probe runs with `scripts/dev/probe-scene.mjs` (stats read through `window.__terra.engine.gameplay.stats()`):
  CSMT forecourt 120 pedestrians / 14 stalls at 2 hotspots / gulls+crows+pigeons; Atigre village 29 pedestrians, 4 cattle,
  2 dogs, 10 egrets, 10 butterflies; Marine Drive 107 pedestrians, litter ×10 in range.
* Screenshots in `docs/screenshots/`: `living-crowd-csmt-forecourt.png`, `living-village-cattle.png`,
  `living-monsoon-mahabaleshwar.png`, `living-basketball-court.png` (plus the e2e frames in `test-results/`).

## What is not done / honest limitations

* No terrain in the sandbox: entities use the player's surface height as ground fallback (per-entity `globe.getHeight`
  refresh takes over on real terrain). Stalls and the court do not follow slopes beyond per-stall sampling.
* No green-season ground tint (ground shader not owned by this track); monsoon reads through rain, fog, wetness and
  thinner crowds. Jackfruit species not added (species library not owned).
* Road markings on near-field roads: not attempted (GroundPrimitive cost on software GL).
* Pedestrians/animals are camera-facing sprites; pedestrians avoid the player and the carriageway, not each other.
* Boat courses are checkpoint hooks that count in any mode; they rely on the journeys track for actual vessels.
* Ambience is synthesised and cannot be verified audibly headless — only the mix rule is unit-tested; the active layer
  is shown in the Diagnostics stats.
* `docs/PROJECT_STATUS.md` in the brief is the repository-root `PROJECT_STATUS.md` (same for `ATTRIBUTIONS.md` and
  `DATA_SOURCES.md`); the track section was added there.

## Files touched

Added: `src/data/maharashtra/living.ts`, `src/world/crowds/**` (8 files), `src/world/wildlife/**` (4 files),
`src/world/climate/monsoon.ts`, `src/world/climate/MonsoonSystem.ts`, `src/gameplay/activities/**` (4 files),
`src/ui/panels/ActivitiesTab.tsx`, `tests/unit/living/*.test.ts` (3), `tests/e2e/living.spec.ts`,
`docs/screenshots/living-*.png`, `docs/tracks/living.md`.
Edited (additively): `src/gameplay/registry.ts`, `src/data/maharashtra/index.ts`, `src/ui/panels/PlayPanel.tsx`,
`PROJECT_STATUS.md`, `ATTRIBUTIONS.md`, `DATA_SOURCES.md`, `docs/PLAN_MAHARASHTRA.md`.
