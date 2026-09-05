TRACK: living-world-activities — branch `claude/track-living`

Goal: make Maharashtra feel inhabited and give the player peaceful activities.

Deliverables:
1. Crowds (`src/world/crowds/**`, registered as `crowds`): pooled pedestrians (max ~120 active) around the player in
   urban tiles, stations, markets and the campus; regional clothing palettes (sarees/kurtas/uniforms as colour sets,
   no real people), simple procedural walk animation, groups that gather at stalls/entrances, avoidance of vehicles and
   the player, density by time of day and place kind. Coordinate with the vehicles track (if `Pedestrians.ts` already
   exists on their branch, build on the shared contract in the plan; do not duplicate).
2. Wildlife (`src/world/wildlife/**`, registered as `wildlife`): cattle and dogs in villages/roads, birds (flocks over
   coasts and fields; crows/pigeons in cities), butterflies in gardens; distance-based simulation and pooling.
3. Living-world touches (additive, in owned files): food stalls/markets near stations and old towns, festival lights
   as an optional toggle (respectful, generic), localised sign boards (generic text), road markings on near-field
   roads if cheap, monsoon season preset for Maharashtra (June–September: heavy rain/thunder/fog and green-season
   tint; dry-season browning Feb–May) via the existing weather/climate hooks, wind-reactive crops, fruit on
   mango/coconut/jackfruit species where appropriate, region-specific ambient audio (city, village, forest, station,
   coast).
4. Activities (`src/gameplay/activities/**`, registered as `activities`): photography challenges (list of shots per
   region; pressing P near the target with it in view scores), landmark collection (visited landmarks persisted in
   localStorage), heritage tours (cinematic keyframes for Mumbai, Pune, Kolhapur, Ajanta–Ellora, Konkan), nature
   observation (spot species near you), railway journey and road-trip checklists, boat checkpoint course hooks,
   basketball at the campus court (simple throw arc + hoop detection), museum interactions (info overlays), environmental
   cleanup (collect litter objects in a park), scenic cinematic tours. Activity HUD via `gameplay.status` and an
   "Activities" tab inside the Play panel (add a small additive component `src/ui/panels/ActivitiesTab.tsx` and
   render it from PlayPanel behind a tab — coordinate through the plan; keep the PlayPanel edit minimal).
5. Tests: unit (activity scoring, collection persistence, monsoon preset by month), e2e `tests/e2e/living.spec.ts`
   (spawn at Marine Drive with fixtures → pedestrians > 0 in stats; spawn at campus → basketball interaction present;
   photography challenge scores at Gateway). Screenshots: crowd at CSMT forecourt, cattle in a village, monsoon at
   Mahabaleshwar, basketball court.
