# Track `journeys` — summary

Branch `claude/track-journeys`. Goal: rail, air and marine passenger journeys the player can take end-to-end in
passenger mode, on approximate Maharashtra data, with everything simulated labelled as such.

## What works

### 1. Data (`src/data/maharashtra/`)
* `stations.ts` — 56 stations: the Mumbai termini and suburban stations, Karjat–Lonavala–Pune, Matheran, the
  north-east line to Nagpur, Marathwada, the south (Solapur, Satara, Sangli, Miraj, Kolhapur), the Konkan Railway and
  the twelve Mumbai Metro line 1 stations Versova–Ghatkopar. Codes and rounded platform counts.
* `corridors.ts` — 11 corridors as ordered polylines with intermediate shape points: Western, Central and Harbour
  suburban, Metro line 1 (elevated 12 m), Mumbai–Pune via the Bhor ghat (Karjat → Palasdari → Kelavli → Thakurwadi →
  Monkey Hill → Khandala → Lonavala, 45 km/h), Mumbai–Nashik–Bhusawal–Nagpur (Thal ghat 60 km/h), Pune–Satara–Miraj–
  Kolhapur, Konkan Railway Panvel–Roha–Chiplun–Ratnagiri–Kudal–Sawantwadi, Neral–Matheran heritage (20 km/h),
  Pune–Daund–Solapur and Manmad–Chhatrapati Sambhajinagar–Nanded. Optional `slowSections`, `elevatedM`, `dataNote`.
* `airports.ts` — BOM, PNQ, NAG, ISK (Ozar), KLH, IXU plus DEL/AGR markers (`external`) for the Taj hop, with runway
  heading/length and a terminal anchor. `ports.ts` — Gateway jetty, Mandwa, Ferry Wharf, Rewas, Ballard Pier cruise
  terminal, Ratnagiri harbour, Malvan jetty. `waterRoutes.ts` — Gateway ↔ Mandwa, Ferry Wharf ↔ Rewas, the Konkan
  cruise loop (673 km) and the Alibaug speedboat checkpoint course.
* Every coordinate is written from memory of public reference values and is approximate (±300 m, up to ±1 km on
  rural rail alignments); every table exports a data note that the overlays show. The tables are exported to
  `unreal/TerraInfinite/Content/Data/*.json` by the existing exporter (regenerated and committed).

### 2. Shared helpers (`src/gameplay/journeys/`)
* `geo.ts` — haversine, bearing, great-circle interpolation, destination point, local ENU offsets, and `Polyline`
  (cumulative arc length, densify along great circles, allocation-free `sample(s)` with blended headings, nearest
  arc length to a point).
* `schedule.ts` — deterministic simulated timetables (`nextDepartures`, `ticketChoices`) with fictional numbers and
  service names; `trackProfile.ts` — moving-maximum + smoothing profile that never dips below the sampled ground;
  `bodies.ts` — posable primitive bodies (`BodyModel`, `localToWorld`, `worldToLocal`) with pooled matrices;
  `passenger.ts` — `PassengerRig` (enter passenger mode, seat placement each frame, walk-mode exit), status setter and
  `[`/`]` time compression.

### 3. Rail (`src/gameplay/rail/`, system id `rail`)
* `track.ts` — `TrackRuntime` (densified line, station arc lengths, speed-limit sections, `BlockSystem`, chunked
  terrain sampling ordered from the player's station outwards, 12 s timeout per chunk with climate-atlas fallback) and
  `TrackRenderer` (rails drawn ±5 km around the player, wider for the elevated metro).
* `trainModel.ts` — hollow coaches (floor, roof, sill and upper panels, window pillars, end walls, seats, door frames,
  bogies), sliding door panels, locomotive; variants for local EMU, metro, intercity and heritage.
* `motion.ts` / `blocks.ts` — braking-curve motion with limits, station-boundary blocks split every 6 km; a train enters
  the next block only when no train heading the same way occupies it, otherwise it is held at the signal.
* `RailSystem.ts` — "Enter station" (teleport to a platform slab with its own height sampler, built at rail height so
  the elevated metro works) → departure board → ticket → wait (the train approaches from ~700 m, stops with the boarding
  coach at the platform, doors open, 40 s dwell, "missed train" fallback) → board → window seat or standing by the door
  → passenger camera each frame with pitch from the profile grade → stops with door cycles and text announcements →
  "Journey options" (skip to arrival, leave at next stop, change seat) → leave at any stop onto a platform. Two ambient
  trains per corridor loop end-to-end and take part in signalling; models exist only within 3 km of the player.

### 4. Air (`src/gameplay/air/`, system id `air`)
* `flightPlan.ts` — pure plan: taxi-out polyline, air polyline (take-off roll, climb-out, great-circle, approach fix,
  threshold, landing roll), taxi-in; runway direction chosen towards/from the other airport; cruise altitude
  1 500–10 500 m from distance; smooth climb/descent; integrated speed table; phases, pitch, bank from heading rate,
  gear; `defaultCompression` so BOM–PNQ ≈ 3 min real time.
* `aircraftModel.ts` — original twin-engine airliner (fuselage, nose/tail cones, swept wings, engines, stabilisers, fin,
  retractable gear as a separate body) with a cabin interior (floor, ceiling, seat rows, window panels/pillars);
  runway strip and terminal block scenery.
* `AirSystem.ts` — terminal → departures → check-in (window/cabin) → security (abstract) → gate → board → per-frame
  pose with a terrain floor for the ground roll → status ("Aboard TI 862 BOM → PNQ · climbing · 3 400 m · 12 min to
  the gate") → arrival overlay → leave at the destination terminal. `debugJump(fraction)` for probes.

### 5. Marine (`src/gameplay/marine/`, system id `marine`)
* Ferries: docked models at the jetties within 1.2 km, two camera spots (open deck, bow rail), bob/roll, slow-down at
  both ends, arrival overlay, the ferry then waits at the arrival jetty for the return trip.
* Speedboat course: drive mode with `setVehicleBody`, capped `driveParams` (16.7 m/s), a water-surface height sampler,
  eight buoys that disappear when passed, lap timer, "back to the last buoy" after two seconds aground, end/return.
* Cruise ship "MV Terra Konkan" (`cruiseDecks.ts` pure layout + `vessels.ts`): 180 m hull, Promenade deck
  (Konkan Restaurant, Music Lounge, Sahyadri Theatre), Lido deck (cabins corridor, pool basin, Aft Viewing Lounge),
  Sky deck (viewing deck, bridge), ramps as stairs, railings, furniture. `sampleDeck(x, y, currentZ)` returns the
  walking surface for the walker's own deck (ramps interpolate, walls return an unclimbable height, pool steps down),
  installed as `modes.groundOverride` while aboard; the walker's ship-local coordinates are preserved each frame with
  `translateBody`, so the player walks freely while the ship sails the loop; overboard → respawn on the promenade.
  Status names the room; overlay offers skip-ahead, skip-to-arrival and disembark when docked.

## How it was verified
* `npm run typecheck && npm run lint && npm test` — clean; 387 unit tests (39 in `tests/unit/journeys/`).
* `TERRA_E2E_DEV=1 TERRA_E2E_PORT=5173 npx playwright test tests/e2e/journeys.spec.ts` against the fixture dev
  server in headless Chromium (SwiftShader): 3/3 pass (rail CSMT → Pune, air BOM → PNQ, marine ferry + speedboat +
  cruise). See the PROJECT_STATUS section for the assertions.
* `scripts/dev/probe-scene.mjs` runs produced `docs/screenshots/journeys-*.png` (platform with the intercity train,
  window seat on the ghat, aircraft window and cabin at cruise/descent, ferry deck, cruise Lido deck and restaurant).
* `npm run build` passes.

## What is not done / honest limitations
* Terrain host blocked from Chromium in this sandbox: all runs used the flat ellipsoid, so the ghat screenshot is flat
  and the terrain-lifted profile is verified by unit tests and code path only (chunks time out and fall back).
* SwiftShader at 1–3 fps clamps frame `dt`, so time compression runs much slower than designed here.
* Optional arcade flight activity not built. No ambient ferries/aircraft. Cruise walls block via the deck sampler only
  (no `moveFilter`), so a corner can occasionally be clipped. Door panels slide as one piece per coach.

## Files touched
`src/data/maharashtra/{stations,corridors,airports,ports,waterRoutes,types,index}.ts`, `src/gameplay/journeys/**`,
`src/gameplay/rail/**`, `src/gameplay/air/**`, `src/gameplay/marine/**`, `src/gameplay/registry.ts` (three lines),
`tests/unit/journeys/**`, `tests/e2e/journeys.spec.ts`, `unreal/TerraInfinite/Content/Data/*.json` (regenerated),
`docs/PLAN_MAHARASHTRA.md` (ownership + hooks), `PROJECT_STATUS.md`, `ATTRIBUTIONS.md`, `DATA_SOURCES.md`,
`docs/screenshots/journeys-*.png`, this file.
