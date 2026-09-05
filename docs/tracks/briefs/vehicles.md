TRACK: vehicles — branch `claude/track-vehicles`

Goal: a game-style vehicle system with three generic drivable vehicles, a showroom, pedestrians and a closed-course
time trial.

Deliverables:
1. `src/gameplay/vehicles/catalog.ts`: generic hatchback, sedan, SUV, sports car, bus, taxi, truck, auto-rickshaw
   (original designs, no brands): dimensions, colours, `DriveParams`, wheel positions, lamp positions, engine audio
   profile, horn pitch. `VehicleBody.ts`: primitive body (chassis, cabin, wheels that spin and steer, headlights,
   indicators, brake lights, roof light for taxi/rickshaw) built once per vehicle and moved with a modelMatrix.
2. `src/gameplay/vehicles/VehicleSystem.ts` (registered as `vehicles`): spawns 3+ parked vehicles at each spawn point
   and near showrooms; interaction "Enter <vehicle>" → drive mode with `setVehicleBody` and `driveParams`; "Exit
   vehicle" (E while stopped) → walk mode next to the door; first/third-person and dashboard cameras (C cycles),
   automatic transmission gear display (P/R/D), speedometer + heading + destination bearing in the store `vehicle`
   readout, headlights (L, auto at night), indicators (Q/R), hazard (Z), horn (H, WebAudio), wipers in rain, tyre spray
   particles when wet, rain-reduced grip, non-graphic damage (scuff decal darkening after hard impacts), automatic
   reset when stuck for 4 s (fade + place on nearest road point or 5 m back), engine/road audio via `engine.audio`
   (additive hook if needed).
3. AI traffic upgrade in `src/world/traffic/**` (additive): vehicles keep lanes, stop at intersections with simple
   signal cycles, avoid pedestrians and the player (emergency braking), density by place/time-of-day; pooled and
   simulated only within 400 m; statistical beyond.
4. Pedestrians (`src/world/traffic/Pedestrians.ts` or `src/world/crowds/` if the living-world track does not exist
   yet — coordinate through docs/PLAN_MAHARASHTRA.md): pooled walkers along roads/sidewalks near the player, regional
   clothing colour palettes, simple walk-cycle animation (bobbing/legs), avoidance of the player and vehicles.
5. Showroom (`src/gameplay/showroom/**`, registered as `showroom`): real showroom positions from OSM `shop=car` tiles
   when online and a curated approximate list `src/data/maharashtra/showrooms.ts` (Mumbai Worli/Andheri, Pune Baner,
   Nagpur Wardha Rd, Kolhapur Tararani chowk — approximate, labelled) with an original generated showroom interior:
   display floor with 4+ catalog vehicles on plinths, reception, information stands (overlay with specs), workshop bay,
   parking and test-drive exit. "Inspect" overlay: exterior orbit, interior, dashboard and cinematic cameras; "Test
   drive" spawns the vehicle at the exit. Note: "Original showroom interior — not the dealer's real interior".
6. Closed-course time trial (`src/gameplay/activities/timeTrial.ts` if the activities track doesn't own it — see
   plan): a marked loop near Lonavala/Aamby valley on real roads with checkpoints and best-time storage
   (localStorage); no street racing against traffic.
7. Tests: unit (catalog integrity, gear logic, stuck detection), e2e `tests/e2e/vehicles.spec.ts` (spawn at Gateway
   → enter the nearest vehicle → drive 5 s → speed > 0 → exit → walk mode; showroom overlay opens). Screenshots:
   driving third-person at Marine Drive (fixtures), dashboard view, showroom floor.
