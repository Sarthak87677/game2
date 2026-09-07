# Maps

Binary `.umap` assets cannot be authored in this repository (no Unreal Editor in the sandbox). `L_Benchmark` must be
created once in the editor following `docs/UNREAL.md` ("Benchmark map"): World Partition on, a `CesiumGeoreference`
at the default spawn, Cesium World Terrain (or the open terrain fallback), a `CesiumSunSky`, a `SkyAtmosphere` and
`ExponentialHeightFog`, and `TerraGameMode` as the level's game mode. `terra.Benchmark.Run` then does the rest.
