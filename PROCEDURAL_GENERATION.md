# Procedural generation

Procedural detail fills the gap between the resolution of legal, open datasets (≈30 m terrain, vector coastlines, OSM footprints where mapped) and what a person expects to see at eye level. It is **plausible, not real**: the UI labels it *procedural* and the engine never claims otherwise.

## Inputs (per near-field tile, zoom 16 ≈ 610 m at the equator)

| Input | Source | Role |
|---|---|---|
| Latitude/longitude, tile x/y/z | Cesium camera | Seeds (`tileSeed`) and hemisphere |
| Elevation & slope | Terrarium height field (z15 quadrant, ~4.8 m samples) | Placement filters, tree line, rock exposure, snow |
| Biome, Köppen class, monthly temperature/precipitation, distance to coast | `WorldMap` raster from the climate model | Species selection, densities, phenology, dryness |
| Surface class | Natural Earth land/lake/glacier + coarse bathymetry | Nothing is placed in water or on ice sheets |
| OSM roads, buildings, water, land use | Overpass (when online) | Exclusion zones; forest/park/farmland/orchard/vineyard drive vegetation and fields |
| Urban density | OSM building count, else Natural Earth populated places (population → influence radius) | Procedural villages/urban blocks when OSM has no buildings |
| Date | Simulated clock | Season, leaf-on, flowering, fruiting, snow |
| Quality preset | Settings | Density multiplier and near-field radius |

## Seeds and determinism

`seed = mixSeed(WORLD_GEN_VERSION, z, x, y, fnv1a(layer))`. Each layer (vegetation, rocks, crops, settlements) has its own stream so changing one rule does not scramble the others. Any rule change that alters output must bump `WORLD_GEN_VERSION` (`src/world/seed.ts`); the biome index order in `src/world/biomes.ts` is part of that version.

## Rules (summary)

* **Species library** (`src/world/procedural/species.ts`) assigns species to biomes with weights, elevation limits, slope limits and water affinity. Fruit and flowers have month windows in the northern-hemisphere calendar; the generator mirrors them by six months south of the equator. Examples: apples fruit Aug–Oct in France and Feb–Apr in Tasmania; mangoes Apr–Jun in India; bananas year-round in the Amazon; olives Oct–Dec around the Mediterranean; nothing fruits on the Antarctic plateau because nothing grows there.
* **Placement** uses seeded jittered grids / Poisson sampling scaled by `BIOME_INFO[biome].treeDensity × quality`. Points on water, above the local tree line (`treelineM(lat)` ≈ 3 900 m at the equator → 0 m at 70°), on slopes steeper than the species limit, within 4 m of roads, or inside buildings are rejected.
* **Land use**: OSM forest/park → dense trees; farmland/orchard/vineyard → `FieldSpec`s with crop rows; grass/meadow → grass and flowers; wetland → reeds. Without OSM, rural tiles (urban density 0.03–0.5, flat) receive a seeded patchwork of fields and a village laid out along lanes; dense urban tiles receive block grids with height distributions by density.
* **Rocks** follow slope and elevation; **snow** and **wetness** come from the weather state and the ground material.
* **Phenology** (`src/world/climate/season.ts`): deciduous leaf-on ramps through spring and falls through autumn; cold months suppress flowering; the tropics use wet/dry seasons.

## Rendering

Placements are turned into merged geometry per tile (trunks/rocks/buildings opaque; leaves/grass/crops alpha-cut) with per-vertex colour, wind weight and atlas coordinates. A custom Cesium `MaterialAppearance` applies wind sway and two-sided lighting. Tiles beyond the full-detail radius use billboard impostors; tiles beyond 4× the radius are unloaded. Each tile is anchored with its own model matrix (floating origin).

## Honest limits

* Species are regional archetypes, not surveyed inventories; a specific orchard will not match reality.
* Building heights without OSM tags are inferred from building type/levels; procedural settlements are invented layouts.
* The climate raster is 39 km; microclimates (valleys, coasts) are approximated by the lapse rate and nearest-land sampling.
