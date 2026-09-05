TRACK: maharashtra-data — branch `claude/track-data`

Goal: make every important Maharashtra place searchable and reachable, add Maharashtra landmark stand-ins, and build
the Taj Mahal hero destination as walkable geometry.

Deliverables:
1. `src/data/maharashtra/cities.ts` + `destinations.ts` (≥ 120 entries): the 16 urban regions (Mumbai, Navi Mumbai,
   Thane, Pune, Pimpri-Chinchwad, Nagpur, Nashik, Kolhapur, Sangli, Satara, Solapur, Chhatrapati Sambhajinagar,
   Amravati, Nanded, Jalgaon, Akola), hill stations (Mahabaleshwar, Lonavala, Khandala, Matheran, Panchgani,
   Chikhaldara), Konkan (Alibaug, Murud-Janjira, Dapoli, Ganpatipule, Ratnagiri, Malvan/Tarkarli, Sindhudurg fort,
   Vengurla), destinations (Gateway of India, CSMT, Marine Drive, Bandra–Worli Sea Link, Haji Ali, Elephanta,
   Shaniwar Wada, Aga Khan Palace, Sinhagad, Raigad, Pratapgad, Lohagad, Ajanta, Ellora, Bibi Ka Maqbara,
   Daulatabad, Deekshabhoomi, Mahalaxmi Temple Kolhapur, Panhala, Shirdi, Trimbakeshwar, Bhimashankar, Tadoba,
   Lonar crater, Koyna dam, Bhandardara, Kaas plateau, Wankhede/DY Patil stadiums, major railway stations, airports,
   universities/colleges, museums, parks). Each with kind, district, description, dataNote, overviewHeightM, tags,
   approximate coordinates. Unit tests: ids unique, coordinates inside Maharashtra bbox (except `external`), every
   entry has a dataNote.
2. Search: extend `TerraEngine.search` (additive: a `MaharashtraIndex` in `src/data/maharashtra/search.ts` merged into
   results with kind 'bookmark'/'landmark' and score) so "Kolhapur", "CSMT", "Ganpatipule", "SGIS" resolve offline; add
   the destinations to `WORLD_HIGHLIGHTS` (a "Maharashtra" continent filter is not needed — use tags) and a
   `showcase-maharashtra-*` set of 5 showcase areas with tours (Mumbai waterfront, Pune old city, Kolhapur, Konkan
   coast, Western Ghats).
3. Landmark stand-ins (`src/data/bookmarks/landmarkModels.ts` additive + new archetypes in
   `src/world/landmarks/landmarkShapes.ts`): Gateway of India (archMonument, 26 m), CSMT (new `stationHall`: dome + long
   Gothic hall), Bandra–Worli Sea Link (new `cableStayedBridge`, 5.6 km, heading ≈ 20°), Shaniwar Wada (new `fortWall`
   with gate), Raigad Fort (fortWall on the summit), Bibi Ka Maqbara (domedBuilding + 4 minarets), Deekshabhoomi
   (stupaTemple), Ellora Kailasa (new `rockCutTemple`), Ajanta (new `caveArc`), Mahalaxmi Temple (new `shikhara`),
   Wankhede (new `stadiumRing`), Haji Ali dargah (domedBuilding on a causeway), Elephanta caves marker, Sinhagad/
   Pratapgad/Panhala (fortWall). All labelled "procedural interpretation at the real position".
4. Taj Mahal hero (`src/world/hero/TajMahal.ts`, registered as a gameplay system `taj-mahal` that also adds a height
   sampler so the platform/pathways are walkable): platform, main mausoleum (dome, four chhatris, iwans), four
   minarets, the Great Gate, the mosque and jawab, charbagh lawns with the long reflecting pool and pathways, trees,
   the Yamuna-side terrace, an approximate central chamber interior reachable through the south door (interaction
   "Enter mausoleum (approximate interior)") with a visible note. Materials: white marble tone with subtle red
   sandstone for the gate/mosque. Streams in only when within 6 km. Screenshot from the gate and from the platform.
5. Ground-level probe screenshots at Gateway of India, CSMT, Shaniwar Wada, Deekshabhoomi and the Taj Mahal into
   `docs/screenshots/maharashtra-*.png` plus an e2e spec `tests/e2e/maharashtra.spec.ts` (search resolves ≥ 8 named
   places; goTo Taj Mahal shows the hero primitives; spawn at Gateway of India lands on the ground).
