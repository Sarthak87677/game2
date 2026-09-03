# Architecture

Terra Infinite is a browser application (TypeScript, React, Vite) built on **CesiumJS** as the single renderer. There is one render loop, one coordinate system (WGS84 geodetic ↔ ECEF), and everything else is layered on top through adapters, workers and tile-anchored local frames.

```
┌────────────────────────── React HUD (src/ui) ──────────────────────────┐
│ search · location card · compass · minimap · toolbar · panels · touch  │
└───────────────▲───────────────────────────────────────────▲────────────┘
                │ zustand store (src/state)                 │ EngineContext
┌───────────────┴───────────────────────────────────────────┴────────────┐
│ TerraEngine (src/engine/TerraEngine.ts) — orchestration                │
│  createViewer · quality presets · EnvironmentController (time/sun/     │
│  weather/particles/night lights) · ground material (GLSL) · ocean       │
│  surface · clouds · audio · StreamingMonitor · ModeController           │
├─────────────────────────────┬──────────────────────────────────────────┤
│ Data adapters (src/data)    │ World (src/world)                        │
│  terrain: Terrarium/ion/    │  climate: anchors → model → Köppen →     │
│   ellipsoid                 │   biome → season/phenology               │
│  imagery: procedural/GIBS/  │  worldMap: 1024×512 raster (worker)      │
│   Esri/OSM/MapTiler/ion     │  osm: OsmLayer (buildings/roads/water)   │
│  features: Overpass (OSM)   │  traffic: vehicles + street lamps        │
│  geocoding: offline index,  │  procedural: species, generator (worker) │
│   Nominatim, Photon         │  render: NearFieldWorld (vegetation…)    │
│  weather: Open-Meteo        │  nearField: height fields, contexts      │
│  cache: IndexedDB TileCache │  seed: WORLD_GEN_VERSION + tile seeds    │
└─────────────────────────────┴──────────────────────────────────────────┘
```

## Level-of-detail pipeline

| Level | Source | Mechanism |
|---|---|---|
| Orbital | Cesium globe + `SkyAtmosphere`, sun/moon/stars, procedural cloud imagery, population night lights | Cesium quadtree; imagery at geographic levels 0–4 |
| Continental | Terrarium heightmaps (z ≤ 15), procedural or satellite imagery | Cesium screen-space-error refinement; tile cache size and SSE from quality presets |
| Regional | Natural Earth rivers/lakes in imagery; OSM landuse tints (GroundPrimitive) | OSM tiles at z15 within a camera-altitude-dependent radius |
| City | OSM building meshes (custom shader: windows, night emission), roads/rail (CorridorGeometry clamped to terrain), water, POIs, traffic, lamps | Tile-anchored local ENU frames, one merged mesh per tile |
| Street / human | Procedural near-field tiles (z16): trees, shrubs, grass, rocks, crops, procedural settlements; ground detail material | Generated in `procgen.worker`, merged geometry per tile per material bucket, impostor billboards beyond the full-detail radius |
| Macro detail | Leaf cards, flowers and fruit from species rules and phenology; wind sway in the vertex shader; snow/wetness in the ground material | Only within the near-field radius (quality preset) |

## Floating origin

Cesium encodes vertex positions relative to the eye (high/low float pairs) for globe tiles. All Terra geometry created at ground level (OSM buildings, vegetation, crops, procedural buildings) is generated in a **tile-local east-north-up frame** whose origin is the tile centre; vertices are small doubles and each primitive carries `Transforms.eastNorthUpToFixedFrame(anchor)` as its model matrix. Walking and driving integrate positions in ECEF but derive their movement basis from the local ENU frame each frame, so there is no jitter at eye height.

## Determinism

`src/world/seed.ts` folds `WORLD_GEN_VERSION`, tile `z/x/y` and a layer name into a 32-bit seed (`mixSeed`), feeding a mulberry32 `Rng`. Generators never call `Math.random` or `Date.now`; phenology depends only on the simulated date passed in the context. Returning to a tile with the same date reproduces the same placements.

## Workers

* `terrarium.worker` — PNG → Float32 height grids (pool of `hardwareConcurrency-1` workers).
* `worldMap.worker` — Natural Earth rasterisation, distance-to-coast transform, climate evaluation and biome classification.
* `procgen.worker` — near-field tile generation from a `GenerationContext`.

## Data provenance

Every adapter carries a `DataSourceInfo` with provenance `measured | inferred | procedural | live`. The HUD shows badges; `DATA_SOURCES.md` documents each dataset. Procedural content is never labelled as a digital twin.

## Key files

* `src/engine/TerraEngine.ts` — boot sequence, adapters, readouts, commands.
* `src/engine/environment.ts` — clock, sun direction, weather → fog/atmosphere/particles, night lights.
* `src/engine/groundMaterial.ts` — globe material GLSL (biome palette, slope/height rock & snow, water, wetness).
* `src/modes/ModeController.ts` — orbit/fly/walk/drive/cinematic.
* `src/data/adapters/terrain/terrariumTerrainProvider.ts` — custom `TerrainProvider`.
* `src/data/adapters/imagery/proceduralImageryProvider.ts` — custom `ImageryProvider`.
* `src/world/osm/OsmLayer.ts`, `osmBuildingGeometry.ts`, `buildingAppearance.ts` — OSM rendering.
* `src/world/procedural/*`, `src/world/render/*` — procedural world.
* `vite.config.ts` — Cesium static assets plugin, offline fixture responder.
