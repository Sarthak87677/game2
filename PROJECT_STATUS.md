# Project status — Terra Infinite

Resumable task ledger. Update after every completed task. Dates are UTC.

## Current state (2026-09-03)

| Milestone | Status | Notes |
|---|---|---|
| 1. Working Earth | **done** | Globe, Terrarium terrain (worker-decoded, cached), offline inferred imagery + optional OSM/Esri/GIBS/MapTiler/ion layers, atmosphere/sun/moon/stars, search (offline gazetteer + coordinates, optional Nominatim/Photon), camera modes, loading/error states, diagnostics. |
| 2. Geographic Structure | **in progress** | Overpass adapter + OSM buildings (custom night-window shader), roads, rail, water, land use, POIs; bookmarks (246 highlights, 19 showcase areas); DATA_SOURCES/ATTRIBUTIONS; provenance UI. Remaining: POI labels, procedural fallback when OSM offline (part of milestone 3). |
| 3. Ground-Level World | **in progress** | Walk/drive with gravity + terrain/building collision done; tile-anchored local frames (floating origin) done for OSM buildings; procedural vegetation/rocks/crops/villages being built (`src/world/procedural`, `src/world/render`). |
| 4. Hyperrealistic Nature | **in progress** | Species library with seasonal fruit/flowers, wind shader, weather particles, ground material (snow/wetness/season tint), ocean surface, procedural ambient audio. Remaining: wiring near-field renderer, ice/snow accumulation on vegetation, puddles. |
| 5. Cities and Landmarks | **partial** | Night windows + night lights done; showcase presets done. Remaining: traffic, street furniture, landmark models. |
| 6. Optimisation | **pending** | Perf script exists (`npm run perf`); measurements to be recorded in PERFORMANCE.md. |
| 7. Verification & Packaging | **in progress** | Unit tests (150+), Playwright smoke suite, production build OK. Docs partially written. |

## Verified commands

```
npm run setup      # install, .env, derived data
npm run dev        # http://127.0.0.1:5173
npm run typecheck
npm test           # vitest unit tests
npm run build      # tsc + vite build → dist/
npm run test:e2e   # Playwright (needs a built dist for preview, or TERRA_E2E_DEV=1 for the dev server)
npm run perf       # headless FPS/memory measurement
TERRA_FIXTURES=1 npm run dev   # synthetic OSM responder for offline development
```

## Decisions

* **CesiumJS only** — no second render loop; near-field geometry is built in tile-local ENU frames with per-tile model matrices (floating origin) and Cesium's relative-to-eye encoding.
* **No keys required** — AWS Terrarium terrain + Natural Earth + climate model form the offline baseline; keyed providers are opt-in via `.env`.
* **Inferred climate atlas** — a 1024×512 raster built in a worker from 400+ approximate station normals; documented as inferred everywhere it is shown.
* **Sandbox constraints** — this development environment blocks OSM/Overpass/Nominatim/GIBS/Esri hosts; those adapters are unit-tested with fixtures and exercised through the synthetic responder.

## Next task

Wire `NearFieldWorld` (procedural vegetation renderer) into `TerraEngine` with `buildGenerationContext`, then visually verify at the showcase ground spots.
