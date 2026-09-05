TRACK: interiors-campus — branch `claude/track-interiors`

Goal: deterministic procedural interiors the player can enter, and the SGIS-inspired hero campus.

Deliverables:
1. `src/world/interiors/grammar.ts` — pure TypeScript, unit-tested: given `{ footprint: [lon,lat][] (or local metres),
   heightM, floors, category, seed }` produce an `InteriorPlan` (floors → rooms with labels, corridors, stairs,
   elevator shafts, doors (each door links two spaces or is `decorative: true`), windows, furniture blocks, lights).
   Categories: residential, office, school, hotel, hospital, mall, restaurant-cafe, museum, railway-station,
   airport-public, showroom, cruise-public. Seed = hash of footprint centroid (coordinate-based) so the same building
   always yields the same interior. Hero buildings accept a handcrafted layout spec instead of random rooms.
2. `src/world/interiors/InteriorLevel.ts` — renders a plan as Cesium Primitives in a local ENU frame: floor slabs,
   walls with door openings, stairs as ramps, elevator cabin, furniture, room-name labels (LabelCollection), emissive
   ceiling lights, window cut-outs showing the outside; collision via `ModeController.groundOverride` (floor of the
   current level, ramps for stairs) and `moveFilter` (walls; door openings pass). Elevator: interaction "Call
   elevator" → overlay to choose a floor → fade + teleport to that floor. Exit door → outside, override cleared.
   Interiors are a separate streamed "level": built on enter, disposed on exit, at most one active.
3. `src/gameplay/interiors/InteriorSystem.ts` (registered as `interiors`): finds enterable buildings near the player —
   OSM buildings with a `building` tag mapped to a category (use `engine.osm` tile features when online/fixtures) and
   procedural near-field buildings — and offers "Enter <category> (procedural interior)" at their door point (nearest
   footprint edge midpoint to a road). Every interior shows a persistent note "Generated interior — fictional, not
   surveyed".
4. SGIS-inspired campus — `src/data/maharashtra/campus.ts` (handcrafted layout spec) + `src/world/hero/Campus.ts`
   (exterior: entrance gate, landscaped grounds, 3 academic buildings with 3–4 floors, auditorium, cafeteria, library,
   labs block, admin block, indoor sports hall, outdoor courts/field, hostel-style block, terrace with barriers,
   internal roads, parked buses, parking, gardens, trees) at 16.7335, 74.4015 (approximate public map position near
   Atigre, Kolhapur). Interiors via the grammar with handcrafted layouts: classrooms, corridors, staircases, library,
   science lab, computer lab, art room, auditorium, cafeteria, administration-style rooms, indoor sports hall, terrace.
   Every visible door either opens or is marked "decorative" with a small sign. Persistent note: "Original,
   fictionalised campus inspired by SGIS — not the school's actual layout". No security-sensitive detail.
5. Walkable stairs (ramps), elevator, safe parkour zone (a marked low-wall course on the sports field with jump
   assist), fall protection (`modes.onFall` > 8 m → fade + respawn at last safe point), rooftop railings.
6. Tests: grammar unit tests (determinism, every door connected or decorative, stairs connect consecutive floors,
   rooms non-overlapping), e2e `tests/e2e/campus.spec.ts` (spawn at campus → walk to the academic block → interact →
   inside (groundOverride active, a room label present) → stairs to floor 2 → exit; no render errors). Screenshots:
   campus entrance, corridor, classroom, library, terrace.
