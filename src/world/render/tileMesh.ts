/**
 * Assembles all geometry of one NearFieldTile into render buckets. Pure (no Cesium): builders run per placement,
 * results are appended into chunk accumulators (≤ 65 535 vertices each) with z shifted by -anchorHeightM so the
 * output is in the tile's floating-origin ENU frame. A vertex budget (default 250 000) is enforced by lowering the
 * detail factor when a tile has more than 400 placements, dropping trees to 'medium' LOD once 80 % is used, and
 * skipping the least important placements (grass last) when the budget is exhausted.
 */
import type { BuildingSpec, FieldSpec, NearFieldTile, Placement, Species, SpeciesKind } from '@/world/procedural/types';
import { tileSeed } from '@/world/seed';
import { MeshBuilder, vertexCount, type MeshData } from './geometry/mesh';
import { buildTree } from './geometry/treeGeometry';
import { buildShrub } from './geometry/shrubGeometry';
import { buildGrass } from './geometry/grassGeometry';
import { buildRock } from './geometry/rockGeometry';
import { addCropPlant, buildField, cropProfile } from './geometry/cropGeometry';
import { buildBuilding } from './geometry/buildingGeometry';
import { parseColour } from './geometry/colour';
import { placementRng } from './geometry/common';

/** Resolves a species id from the generator's library; unknown ids get a plausible generic fallback. */
export type SpeciesLookup = (id: string) => Species | undefined;

export interface TileMeshOptions {
  species: SpeciesLookup;
  /** Hard cap on vertices per tile across both buckets (default 250 000). */
  vertexBudget?: number;
  /** Chunk size in vertices (default 65 535 so chunks use 16-bit indices). */
  chunkVertices?: number;
  /** Terrain height sampler for field plants (absolute metres); defaults to the tile anchor height. */
  fieldHeightAt?: (field: FieldSpec, x: number, y: number) => number;
  /** Skip BuildingSpecs sourced from OSM (rendered by OsmLayer with real footprints). Default true. */
  skipOsmBuildings?: boolean;
  /** Cap on crop plants across all fields of the tile (default 6000). */
  maxCropPlantsPerTile?: number;
}

export interface TileMeshCounts {
  trees: number;
  shrubs: number;
  grass: number;
  rocks: number;
  buildings: number;
  fields: number;
  /** Placements dropped because the vertex budget was exhausted. */
  skipped: number;
}

export interface TileMeshResult {
  opaque: MeshData[];
  cutout: MeshData[];
  vertexCount: number;
  counts: TileMeshCounts;
  /** Buildings actually rendered (used for walking collisions). */
  buildings: BuildingSpec[];
}

const KIND_RANK: Record<SpeciesKind, number> = { tree: 0, palm: 0, cactus: 0, shrub: 1, rock: 2, crop: 3, reed: 4, grass: 4, flower: 4 };

class ChunkAccumulator {
  readonly chunks: MeshData[] = [];
  private current = new MeshBuilder(4096, 8192);
  constructor(private readonly maxVertices: number) {}
  add(mesh: MeshData, dz: number): void {
    const n = vertexCount(mesh);
    if (n === 0) return;
    if (this.current.vertexCount > 0 && this.current.vertexCount + n > this.maxVertices) {
      this.chunks.push(this.current.build());
      this.current = new MeshBuilder(4096, 8192);
    }
    this.current.append(mesh, 0, 0, dz);
  }
  finish(): MeshData[] {
    if (this.current.vertexCount > 0) this.chunks.push(this.current.build());
    return this.chunks;
  }
}

const FALLBACKS = new Map<string, Species>();

/** Generic species used when the library does not know an id (keeps rendering robust; never claims accuracy). */
export function fallbackSpecies(id: string): Species {
  const hit = FALLBACKS.get(id);
  if (hit) return hit;
  const l = id.toLowerCase();
  let s: Species;
  if (/rock|boulder|stone|scree/.test(l)) s = { id, name: id, kind: 'rock', leafType: 'none', habit: 'evergreen', biomes: {}, heightM: [0.4, 1.2], spread: 1, trunkColour: '#7a7874', leafColour: '#7a7874' };
  else if (/reed|sedge|rush|papyrus/.test(l)) s = { id, name: id, kind: 'reed', leafType: 'broadleaf', habit: 'evergreen', biomes: {}, heightM: [1.5, 2.5], spread: 0.3, trunkColour: '#8a8a4a', leafColour: '#7d9a4a' };
  else if (/grass|tussock|sedge|prairie|meadow/.test(l)) s = { id, name: id, kind: 'grass', leafType: 'broadleaf', habit: 'evergreen', biomes: {}, heightM: [0.3, 0.7], spread: 0.6, trunkColour: '#8a8a4a', leafColour: '#8fa653', autumnColour: '#b09c5a' };
  else if (/flower|wildflower|poppy|lupin/.test(l)) s = { id, name: id, kind: 'flower', leafType: 'broadleaf', habit: 'evergreen', biomes: {}, heightM: [0.3, 0.6], spread: 0.5, trunkColour: '#6a7a3a', leafColour: '#6f9a45', flowers: { colour: '#e8e2b0', months: [4, 5, 6, 7] } };
  else if (/shrub|bush|sage|heather|maquis|scrub|juniper|gorse|broom|rhodo/.test(l)) s = { id, name: id, kind: 'shrub', leafType: 'broadleaf', habit: 'evergreen', biomes: {}, heightM: [0.8, 1.8], spread: 1.2, trunkColour: '#6b5643', leafColour: '#5e8a45' };
  else if (/cactus|saguaro|prickly|agave|aloe|euphorbia/.test(l)) s = { id, name: id, kind: 'cactus', leafType: 'succulent', habit: 'evergreen', biomes: {}, heightM: [1.5, 4], spread: 0.3, trunkColour: '#5a7a45', leafColour: '#5f8a4c' };
  else if (/palm|coconut|date|cocos|phoenix/.test(l)) s = { id, name: id, kind: 'palm', leafType: 'palm', habit: 'evergreen', biomes: {}, heightM: [8, 16], spread: 0.55, trunkColour: '#8a7a62', leafColour: '#4f8a3c' };
  else if (/pine|spruce|fir|larch|cedar|hemlock|conifer|cypress|sequoia|redwood|yew/.test(l)) s = { id, name: id, kind: 'tree', leafType: 'needle', habit: 'evergreen', biomes: {}, heightM: [12, 25], spread: 0.35, trunkColour: '#5c4a3a', leafColour: '#2f5a33' };
  else if (/crop|wheat|maize|rice|barley|soy/.test(l)) s = { id, name: id, kind: 'crop', leafType: 'broadleaf', habit: 'seasonal-dry', biomes: {}, heightM: [0.6, 1.0], spread: 0.5, trunkColour: '#8a8a4a', leafColour: '#9aa84a', cultivated: true };
  else s = { id, name: id, kind: 'tree', leafType: 'broadleaf', habit: 'deciduous', biomes: {}, heightM: [8, 18], spread: 0.7, trunkColour: '#5f4d3d', leafColour: '#4a7d33', autumnColour: '#c07a2a' };
  FALLBACKS.set(id, s);
  return s;
}

/** Detail factor (0.3..1) for a tile with the given placement count: 1 up to 400 placements, then 400/n. */
export function detailFor(placements: number): number {
  if (placements <= 400) return 1;
  return Math.max(0.3, 400 / placements);
}

/** Builds every mesh for a tile. See module doc for budgeting rules. */
export function buildTileMeshes(tile: NearFieldTile, opts: TileMeshOptions): TileMeshResult {
  const budget = opts.vertexBudget ?? 250_000;
  const opaque = new ChunkAccumulator(opts.chunkVertices ?? 65_535);
  const cutout = new ChunkAccumulator(opts.chunkVertices ?? 65_535);
  const dz = -tile.anchorHeightM;
  const counts: TileMeshCounts = { trees: 0, shrubs: 0, grass: 0, rocks: 0, buildings: 0, fields: 0, skipped: 0 };
  const seed = tileSeed(tile.x, tile.y, tile.z, 'render');
  let used = 0;
  const rendered: BuildingSpec[] = [];

  for (const spec of tile.buildings) {
    if ((opts.skipOsmBuildings ?? true) && spec.source === 'osm') continue;
    const m = buildBuilding(spec, seed);
    const n = vertexCount(m);
    if (n === 0 || used + n > budget) continue;
    opaque.add(m, dz);
    used += n;
    counts.buildings++;
    rendered.push(spec);
  }

  const totalFieldArea = tile.fields.reduce((a, f) => a + Math.abs(polygonArea(f.polygon)), 0);
  const cropBudget = opts.maxCropPlantsPerTile ?? 6000;
  for (const field of tile.fields) {
    const share = totalFieldArea > 0 ? Math.abs(polygonArea(field.polygon)) / totalFieldArea : 1;
    const heightAt = opts.fieldHeightAt ? (x: number, y: number) => opts.fieldHeightAt!(field, x, y) : () => tile.anchorHeightM;
    const m = buildField(field, { seed, heightAt, maxPlants: Math.max(60, cropBudget * share) });
    const n = vertexCount(m.opaque) + vertexCount(m.cutout);
    if (n === 0 || used + n > budget) continue;
    opaque.add(m.opaque, dz);
    cutout.add(m.cutout, dz);
    used += n;
    counts.fields++;
  }

  const placements = tile.placements.map((p, i) => ({ p, i, sp: opts.species(p.species) ?? fallbackSpecies(p.species) }));
  placements.sort((a, b) => (KIND_RANK[a.sp.kind] - KIND_RANK[b.sp.kind]) || (a.i - b.i));
  const treeCount = placements.filter((e) => KIND_RANK[e.sp.kind] === 0).length;
  const detail = Math.min(detailFor(tile.placements.length), treeCount > 350 ? Math.max(0.3, 350 / treeCount) : 1);

  for (const { p, sp } of placements) {
    if (used >= budget * 0.995) { counts.skipped++; continue; }
    const kind = sp.kind;
    if (kind === 'tree' || kind === 'palm' || kind === 'cactus') {
      let m = buildTree(sp, p, used < budget * 0.8 ? 'full' : 'medium', { detail });
      let n = vertexCount(m.opaque) + vertexCount(m.cutout);
      if (used + n > budget) { m = buildTree(sp, p, 'medium', { detail }); n = vertexCount(m.opaque) + vertexCount(m.cutout); }
      if (used + n > budget) { counts.skipped++; continue; }
      opaque.add(m.opaque, dz); cutout.add(m.cutout, dz); used += n; counts.trees++;
    } else if (kind === 'shrub') {
      const m = buildShrub(sp, p, { detail });
      const n = vertexCount(m.opaque) + vertexCount(m.cutout);
      if (used + n > budget) { counts.skipped++; continue; }
      opaque.add(m.opaque, dz); cutout.add(m.cutout, dz); used += n; counts.shrubs++;
    } else if (kind === 'rock') {
      const m = buildRock(sp, p, { detail });
      const n = vertexCount(m);
      if (used + n > budget) { counts.skipped++; continue; }
      opaque.add(m, dz); used += n; counts.rocks++;
    } else if (kind === 'crop') {
      const m = cropPlacement(sp, p);
      const n = vertexCount(m);
      if (used + n > budget) { counts.skipped++; continue; }
      cutout.add(m, dz); used += n; counts.grass++;
    } else {
      const m = buildGrass(sp, p);
      const n = vertexCount(m);
      if (used + n > budget) { counts.skipped++; continue; }
      cutout.add(m, dz); used += n; counts.grass++;
    }
  }
  return { opaque: opaque.finish(), cutout: cutout.finish(), vertexCount: used, counts, buildings: rendered };
}

function cropPlacement(sp: Species, p: Placement): MeshData {
  const b = new MeshBuilder(16, 24);
  const rng = placementRng(sp, p, 'crop');
  addCropPlant(b, cropProfile(sp.id), p.x, p.y, p.z, rng, parseColour(sp.leafColour, [150, 160, 70]), p.scale > 0 ? p.scale : 1);
  return b.build();
}

function polygonArea(ring: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return -a / 2;
}
