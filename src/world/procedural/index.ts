/** Public surface of the procedural near-field generator (pure TS; safe to import from workers and tests). */
export type * from './types';
export { NEAR_FIELD_ZOOM } from './types';
export { SPECIES, VEGETATED_BIOMES, speciesById, speciesForBiome, cropsForBiome, weightedSpeciesForBiome, pickWeighted, type WeightedSpecies } from './species';
export { generateTile, NEAR_FIELD_CAPS } from './generator';
export { generateVillage, generateVillageLayout, generateUrbanBlocks, generateUrbanLayout, type BaseZSampler, type VillageLayout, type UrbanLayout } from './settlements';
export { metresPerTile, tileFrame, localFromLonLat, jitteredGrid, poissonDisk, sampleHeight, slope, createHeightSampler, pointInPolygon, distanceToPolyline, distanceToPolygonEdge, polygonBounds, polygonArea, polygonCentroid, boundsIntersect, convexPolygonsOverlap, clipPolygonToRect, rotatedRect, type Point2, type Bounds2, type TileFrame, type HeightSampler } from './placement';
