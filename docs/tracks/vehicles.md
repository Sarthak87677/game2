# Track summary — vehicles (`claude/track-vehicles`)

Game-style vehicle system for the Maharashtra slice: eight original drivable vehicles, ambient-traffic upgrade,
pedestrians, generated showrooms with inspect cameras and test drives, and a closed-course hill time trial.

## What works (verified in headless Chromium, SwiftShader, synthetic OSM fixtures)

| Feature | Where | Verified by |
|---|---|---|
| Vehicle catalog: hatchback, sedan, SUV, coupé, bus, taxi, truck, auto-rickshaw — dimensions, paints, `DriveParams`, wheels, lamps, engine audio profile, horn, door point, spec sheet | `src/gameplay/vehicles/catalog.ts` | `tests/unit/vehicles/catalog.test.ts` (envelope, wheels, lamps, roof lights, notes) |
| Primitive bodies built once and moved by model matrices: chassis/cabin, translucent glass, wheels that spin and steer, head/tail/brake/indicator/roof lamps, night beams, dashboard + steering wheel + wipers, paint darkening | `VehicleBody.ts` | e2e screenshots `docs/screenshots/vehicle-driving-third.png`, `vehicle-dashboard.png` |
| Parked vehicles (3 per spawn point, showroom forecourts, time-trial start), pooled by distance; "Enter <vehicle>" → drive; "Exit vehicle" while stopped → walk by the door | `VehicleSystem.ts` | `tests/e2e/vehicles.spec.ts` test 1 |
| Cameras (C: third → first → dashboard), gear display P/R/N/D, speed + heading + destination bearing in `gameplay.vehicle`, headlights (L, auto at dusk), indicators (Q/R), hazards (Z), horn (H, WebAudio), wipers in rain, tyre spray when wet, wet-grip reduction, non-graphic damage, 4 s stuck reset with fade to the nearest road point / 5 m back, engine + road + horn audio through `AmbientAudio.bus` | `VehicleSystem.ts`, `VehicleAudio.ts`, `logic.ts` | unit tests for gear/stuck/grip/impact/lamps/nearest road; e2e test 1 drives 5 s (speed > 0, gear D), toggles dashboard camera, indicator and headlights, exits to walk mode |
| Ambient traffic: junction graph (shared nodes + inserted crossings), two-phase signals with clearance, left-lane keeping, flow through junctions, car following, emergency braking for the player and pedestrians, density by local hour and place population, full simulation within 400 m, coarse to 1.5 km, frozen beyond; 3D bodies lent by the vehicle system to the nearest traffic | `src/world/traffic/TrafficLayer.ts`, `roadGraph.ts` | `tests/unit/vehicles/roadGraph.test.ts`, `logic.test.ts`; e2e asserts intersections > 0, signals > 0, simulated > 0, pedestrians > 0, bodies3d > 0 |
| Pedestrians: pooled walkers on pavements, Maharashtra/India/generic palettes, bobbing torso and swinging legs, player/vehicle avoidance, time-of-day activity | `src/world/traffic/Pedestrians.ts` | unit palette/activity tests; e2e pedestrian count |
| Showroom: 5 curated approximate positions + OSM `shop=car` nodes; generated floor with 6 plinths, information stands, reception, lounge, workshop lift, forecourt parking, test-drive exit; Inspect overlay with exterior-orbit / interior / dashboard / cinematic cameras; Test drive spawns the vehicle at the exit with a return bearing | `src/gameplay/showroom/`, `src/data/maharashtra/showrooms.ts` | `tests/unit/vehicles/catalog.test.ts` (layout), e2e test 2, screenshots `showroom-floor.png`, `showroom-inspect.png` |
| Time trial near Lonavala: gates with banners, start/abort while driving, splits, best lap in localStorage, traffic suppressed on the course | `courses.ts`, `CourseMarkers.ts`, `logic.ts` | unit state machine + storage tests; scripted probe (checkpoints captured in order, "Lap complete" overlay, best time stored) — screenshot `time-trial-start.png` |

Commands run before every commit: `npm run typecheck && npm run lint && npm test` (all green: 251 unit tests).
E2E: `TERRA_E2E_DEV=1 TERRA_E2E_PORT=5180 npx playwright test tests/e2e/vehicles.spec.ts` against
`TERRA_FIXTURES=1 npx vite --port 5180` — both tests pass (about 11 minutes on SwiftShader).

## Additive hooks (documented in `docs/PLAN_MAHARASHTRA.md`)

`AmbientAudio.bus()`, `TrafficLayer.setPlayer/setBodyPool/setExclusion/roadsNear/pedestrians`, optional
`gameplay.vehicle` HUD fields (+ one line in `InteractionPrompt`), `shop=car` POIs in the OSM adapter, the
vehicle request bus, two spawn points (`lonavala-time-trial`, `showroom-worli`), and `H` = horn while driving.

## Not done / honest limitations

* Verified only on the ellipsoid with fixture roads: the sandbox blocks terrain and Overpass hosts. Real-road lane
  offsets, signals at real junctions and the Lonavala course geometry need an online run.
* Showroom walls have no collision (wall `moveFilter` belongs to the interiors track); OSM showroom positions were
  not exercised (no live OSM here).
* Traffic vehicles do not avoid parked vehicles; coarse-zone vehicles skip signals by design.
* The rain/wet screenshots show the effect but SwiftShader frame rates (1–3 fps) make spray sparse.
* Pedestrians walk only along roads (no crossings, no gatherings) — the living-world track owns crowds and should
  build on `Pedestrians.positions()`.

## Files touched

New: `src/gameplay/vehicles/{catalog,VehicleBody,VehicleSystem,VehicleAudio,logic,requests,courses,CourseMarkers,ground}.ts`,
`src/gameplay/showroom/{ShowroomSystem,showroomLayout}.ts`, `src/data/maharashtra/showrooms.ts`,
`src/world/traffic/{roadGraph,Pedestrians}.ts`, `tests/unit/vehicles/*.test.ts`, `tests/e2e/vehicles.spec.ts`,
`docs/screenshots/vehicle-*.png`, `showroom-*.png`, `time-trial-start.png`, this file.
Modified (additive): `src/world/traffic/TrafficLayer.ts` (rewritten simulation, same public stats fields),
`src/engine/audio.ts`, `src/state/store.ts`, `src/ui/widgets/InteractionPrompt.tsx`, `src/styles/hud.css`,
`src/gameplay/registry.ts`, `src/data/maharashtra/{index,spawns}.ts`, `src/data/adapters/features/{overpass,osmParse}.ts`,
`docs/PLAN_MAHARASHTRA.md`, `PROJECT_STATUS.md`, `ATTRIBUTIONS.md`, `DATA_SOURCES.md`.
