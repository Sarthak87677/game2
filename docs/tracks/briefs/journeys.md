TRACK: journeys — branch `claude/track-journeys`

Goal: rail, air and marine passenger journeys the player can take end-to-end, in passenger mode.

Deliverables:
1. Data (`src/data/maharashtra/stations.ts`, `corridors.ts`, `airports.ts`, `ports.ts`, `waterRoutes.ts`, approximate,
   unit-tested): stations (CSMT, Churchgate, Dadar, Bandra, Andheri, Borivali, Thane, Kalyan, Karjat, Lonavala, Pune,
   Shivajinagar, Nashik Road, Igatpuri, Bhusawal, Jalgaon, Akola, Amravati (Badnera), Nagpur, Solapur, Satara, Sangli,
   Miraj, Kolhapur, Ratnagiri, Kudal, Sawantwadi, Chhatrapati Sambhajinagar, Nanded, Panvel, Vashi, Belapur, Neral,
   Matheran, Mumbai Metro line 1 stations Ghatkopar–Versova); corridors: Mumbai suburban (Western, Central, Harbour),
   Metro line 1, Mumbai–Pune intercity (via Karjat–Lonavala ghat), Mumbai–Nashik–Bhusawal–Nagpur, Pune–Miraj–Kolhapur,
   Konkan Railway (Panvel–Roha–Ratnagiri–Kudal–Sawantwadi), Neral–Matheran heritage; paths as polylines with enough
   shape points to follow valleys (the ghat section must not cut through hills: sample terrain and lift the path to
   ground). Airports: BOM, PNQ, NAG, ISK (Ozar), KLH, IXU, plus DEL/AGR marker for the Taj hop. Ports: Gateway of
   India jetty, Mandwa, Ferry Wharf (Bhaucha Dhakka), Rewas, Mumbai cruise terminal (Ballard Pier), Ratnagiri harbour,
   Malvan jetty. Water routes: Gateway↔Mandwa ferry, Ferry Wharf↔Rewas, Mumbai cruise loop along the Konkan coast,
   speedboat checkpoint course off Alibaug.
2. Rail (`src/gameplay/rail/**`, registered as `rail`): station interaction "Enter station" (public entrance) →
   platform view with destination board (overlay listing next departures, simulated schedule) → "Buy ticket" (fictional,
   no money) → wait → train arrives (train model: locomotive + coaches as primitives following the corridor, doors
   open) → "Board" → seat/stand choice → passenger mode with the camera at a window seat, landscape moving, stops with
   door cycles and announcements (text status) → "Leave train" at any stop → walk on the platform. Trains follow
   tracks with speed limits, station stops and signals (simple block logic). Local, metro, intercity and heritage
   variants (different models and speeds).
3. Air (`src/gameplay/air/**`, registered as `air`): airport interaction → public terminal (overlay: check-in-style
   destination choice, abstract security transition, gate) → board (aircraft model: fuselage, wings, tail, engines,
   gear) → taxi to runway → take-off → climb to cruise (great-circle) → descent → landing → taxi → "Leave aircraft" at
   the terminal. Window and cabin camera choice. Time-compressed (a Mumbai–Pune hop ≈ 3 min real time, adjustable
   speed with [ ]). Optional arcade flight activity: auto-stabilised simplified controls reusing fly mode with speed
   limits and bank visuals — explicitly not flight training.
4. Marine (`src/gameplay/marine/**`, registered as `marine`): Gateway↔Mandwa ferry (board at jetty, deck camera,
   arrival), arcade speedboat checkpoint course (drive mode on water via a water height sampler, capped speed, virtual
   route buoys), cruise ship (original design; board at Ballard Pier; public decks/cabins/restaurant/pool/viewing
   areas/theatre/music lounge as deck-level rooms built as an interior-like level moving with the ship — use
   `translateBody` and a deck height sampler so the player can walk while the ship moves; sunset/rain/fog just work).
5. All journeys set `gameplay.status` ("Aboard 12123 Deccan Queen → Pune · next stop Lonavala · 12 min") and clear it
   on exit; fast travel option in the overlay ("Skip to arrival").
6. Tests: unit (corridor continuity, schedule generation, great-circle interpolation), e2e `tests/e2e/journeys.spec.ts`
   (spawn CSMT → enter station → ticket → board → status shows aboard → skip to arrival → leave at Pune: camera near
   Pune; airport BOM → board → skip → PNQ; Gateway ferry → Mandwa). Screenshots: platform with train, window view on
   the ghat, aircraft cabin/window at cruise, ferry deck, cruise deck.
