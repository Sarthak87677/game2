# Track `interiors-campus` — procedural interiors and the SGIS-inspired campus

Branch `claude/track-interiors`. Everything here is generated or handcrafted fiction: interiors are never surveys of
real buildings, and the campus is an original, fictionalised layout at an approximate public map position.

## What works

**Interior grammar** — `src/world/interiors/grammar.ts` (pure TypeScript, vocabulary in
`src/data/maharashtra/interiorGrammar.ts`). `buildInteriorPlan({ footprint, heightM, floors?, category, seed?, name?,
entrance?, layout? })` returns an `InteriorPlan`:

* The footprint (`[lon, lat]` ring or local metres) is rotated into a *building frame* whose x-axis follows the longest
  edge; the largest axis-aligned rectangle inside the ring is laid out.
* Layout modes: double-loaded corridor (rooms both sides), single-loaded (shallow buildings) or one hall (small
  footprints, ground floors of stations/airports/showrooms/cafés, hero halls such as the library and auditorium).
* Stair core at the west end (a second one for buildings over 48 m): two straight ramps (flight A up to a half landing,
  flight B back up to the next floor) so every floor connects to the next; a railing separates the flights.
* Elevator shaft (category threshold or hero flag) with a door onto the corridor and a lobby point.
* Doors: room → corridor, corridor → outside (entrance on the wall nearest the door hint, plus a far-end exit on long
  corridors), lift door, and decorative cupboard doors (`decorative: true`, rendered closed with a sign). Every door either
  links two spaces or is decorative — asserted by unit tests.
* Windows every 3 m on exterior walls (skipped around entrances), furniture blocks per room kind (desks, benches, beds,
  shelves, counters, plinths…), ceiling lights, and a railed terrace on the roof.
* Seed = `mixSeed(round(lat·1e5), round(lon·1e5), fnv1a(category))` of the footprint centroid, so the same building
  always yields the same interior; hero buildings pass a handcrafted `HeroLayoutSpec` (room programme per floor, halls,
  elevator/terrace flags, entrance side).

**Collision** — `src/world/interiors/collision.ts`: `nearestSurface` picks, at a point, the walking surface nearest the
walker's current height (ramps within 0.6 m win over slabs, so stairs are followed continuously and floors never snap);
`filterMove` blocks wall crossings outside door openings and slides along walls; `wallPieces` cuts door and window
openings out of wall boxes for rendering.

**Level renderer** — `src/world/interiors/InteriorLevel.ts`: one Cesium `Primitive` of box instances for the structure
(slabs, ramps, landings, handrails, lift cabin floors) and, per floor, walls with openings, door frames and panels,
furniture, flat-shaded emissive lights and a `LabelCollection` (room names, "Ground floor · stairs ↑ First floor", lift,
"decorative door", terrace warning). Everything is expressed in the building frame; the primitive model matrix is
`ENU(origin) × Rz(rotation)`. Only the current floor ±1 is built/shown (max five resident) — a simple LOD that keeps
24-storey towers cheap on the software renderer. The level binds `ModeController.groundOverride` and `moveFilter`.

**Gameplay system** — `src/gameplay/interiors/InteriorSystem.ts`, registered as `interiors`:

* Candidates within 60 m: campus buildings (door = entrance side midpoint), OpenStreetMap buildings from every loaded
  tile with a category derived from `building=*`/name (door = footprint edge midpoint nearest a road, pushed 1.2 m
  outside), and procedural near-field buildings via the additive `NearFieldWorld.buildingsNear` hook. Prompt:
  "Enter <name/category> (procedural interior)".
* Enter: plan built, level created, exterior campus shell hidden, fade, walker placed just inside the exterior door
  facing in. Status line: "Generated interior — fictional, not surveyed · <building> · <floor> · <room>" (plus the campus
  note inside campus buildings).
* "Call elevator" at the lobby → overlay listing floors → fade + teleport to that floor's lobby.
* "Exit <building>" at ground-floor exits, or simply walking through the door (auto-exit once the walker has been
  inside and leaves the laid-out rectangle): level disposed, hooks cleared, walker placed outside.
* Fall protection: `modes.onFall` > 8 m → fade + respawn at a safe point recorded at least 2 s before the landing
  (works outside interiors too, e.g. off campus roofs).
* At most one active level; `stats()` feeds the Diagnostics panel (active building, floor, resident floors, boxes,
  labels, build ms, campus placement).

**Hero campus** — `src/data/maharashtra/campus.ts` + `src/world/hero/Campus.ts` at 16.7335, 74.4015 (approximate):
a 360 × 280 m landscaped platform, gate with the fictional-campus label, internal roads with kerbs, roundabout gardens,
box trees, bus and car parking with parked vehicles, basketball and volleyball courts, a sports field with goals and a
marked low-wall parkour course (0.5–1.2 m blocks with a 0.4 m step-up apron = jump assist), and ten buildings with
window bands, floor trims, entrance canopies and parapet railings: Academic blocks A (4 floors, lift), B and C (3
floors), Administration, Library (two reading halls), Auditorium (stage + seating, green room, control room),
Cafeteria (serving counter, tables, kitchen), Labs block (physics/chemistry/biology, computer labs, maker space), Indoor
sports hall (court marking, equipment store, changing rooms) and a hostel-style block (rooms, study rooms, warden). The
platform, building roofs and parkour blocks are a `ModeController` height sampler; a building's shell hides while its
interior is active. Placement uses loaded terrain when available and otherwise the terrain-provider/atlas fallback, and
re-anchors when real terrain arrives.

## How it was verified

* `npm run typecheck && npm run lint && npm test` — 357 unit tests pass. `tests/unit/interiors/grammar.test.ts` covers
  determinism (same footprint → identical JSON, other centroid → other seed), every category plus a 1-floor shed and a
  20-floor tower, door linkage, room/corridor/core/shaft non-overlap, furniture containment, stair connectivity (ramp
  heights at both ends of each flight), hero programme order and halls, irregular local-metre footprints, wall blocking
  vs door openings, decorative doors/windows not opening walls, wall cut-outs (door gap + lintel, window sill/head), and
  walking a ramp from floor 0 to floor 1 with the nearest-surface sampler.
* `tests/e2e/campus.spec.ts` (headless Chromium, `--use-angle=swiftshader`, fixture dev server, `?terraQuality=low`):
  spawn at the campus (status shows the campus note) → walk to Academic block A → prompt "Enter Academic block A
  (procedural interior)" → E → `groundOverride` and `moveFilter` bound, labels present, hero plan with "Classroom G1",
  every door linked or decorative, terrace present → corridor screenshot → Shift+W up flight A to the half landing
  (height ≈ H/2) and flight B to the first floor (floor index 1, status "First floor") → classroom (status names the
  room) → "Call elevator" → overlay → floor 3 → simulated 10 m fall respawns (stat = 1) → lift to ground → "Exit
  Academic block A" → override cleared → library hall (no corridor) → terrace. No page errors, no render errors.
  Passes (3.6–5 min on the software renderer).
* `tests/e2e/interiors.spec.ts`: in the synthetic OSM city a categorised building is found by the scan, offered at its
  door, entered (rooms, labels, status note), exited and re-entered with the identical seed and room count. Passes.
* Screenshots (`node scripts/dev/probe-campus.mjs`): `docs/screenshots/campus-entrance.png`, `campus-corridor.png`,
  `campus-classroom.png`, `campus-library.png`, `campus-terrace.png`.

## What is not done / known limitations

* The sandbox blocks the terrain host, so everything was verified on the flat ellipsoid; on sloping terrain the campus
  platform sits at the highest loaded corner height and interiors use the ground height at the door.
* Furniture and handrails have no collision; the walker is a point with a 0.25 m probe.
* Near-field procedural building shells are double-sided and not hidden while inside, so their window cut-outs show
  the shell's inner face; OSM shells are back-face culled and read correctly.
* Interiors are capped at 24 storeys; elevator overlays list every floor (number keys reach 1–9, mouse for the rest).
* Materials are flat per-instance colours (no textures); windows are open cut-outs without glass.
* The parkour course is a marked low-wall line with step-up assist, not a scripted course with timing or scoring.

## Files touched

* New: `src/world/interiors/{types,grammar,collision,frame,InteriorLevel}.ts`, `src/gameplay/interiors/{InteriorSystem,fade}.ts`,
  `src/world/hero/Campus.ts`, `src/data/maharashtra/{campus,interiorGrammar}.ts`, `tests/unit/interiors/grammar.test.ts`,
  `tests/e2e/{campus,interiors}.spec.ts`, `scripts/dev/probe-campus.mjs`, `docs/screenshots/campus-*.png`, this file.
* Shared (one line / additive): `src/gameplay/registry.ts` (register `interiors`), `src/data/maharashtra/index.ts`
  (campus exports), `src/world/render/NearFieldWorld.ts` (`buildingsNear` hook), regenerated
  `unreal/TerraInfinite/Content/Data/{Campuses,CampusBuildings,Manifest}.json`, `docs/PLAN_MAHARASHTRA.md`,
  `PROJECT_STATUS.md`, `ATTRIBUTIONS.md`, `DATA_SOURCES.md`.
