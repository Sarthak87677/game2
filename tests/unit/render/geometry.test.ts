import { describe, expect, it } from 'vitest';
import type { BuildingSpec, FieldSpec, NearFieldTile, Placement, Species } from '@/world/procedural/types';
import { buildCactus, buildTree } from '@/world/render/geometry/treeGeometry';
import { buildShrub } from '@/world/render/geometry/shrubGeometry';
import { buildGrass } from '@/world/render/geometry/grassGeometry';
import { buildRock } from '@/world/render/geometry/rockGeometry';
import { buildField, cropProfile } from '@/world/render/geometry/cropGeometry';
import { buildBuilding } from '@/world/render/geometry/buildingGeometry';
import { chunkGeometries, mergeGeometries, vertexCount, type BucketedMesh, type MeshData } from '@/world/render/geometry/mesh';
import { earClip, pointInRing } from '@/world/render/geometry/shapes';
import { parseColour } from '@/world/render/geometry/colour';
import { ATLAS_CELLS, buildLeafAtlas } from '@/world/render/leafAtlas';
import { buildTileMeshes, detailFor, fallbackSpecies } from '@/world/render/tileMesh';

const oak: Species = { id: 'oak', name: 'Oak', kind: 'tree', leafType: 'broadleaf', habit: 'deciduous', biomes: { temperate_deciduous_forest: 1 }, heightM: [12, 22], spread: 0.8, trunkColour: '#5a4a3a', leafColour: '#4a7d33', autumnColour: '#c0782a', flowers: { colour: '#e8e0a0', months: [4, 5] }, fruit: { name: 'acorn', colour: '#8a6a3a', sizeM: 0.025, months: [9, 10] } };
const apple: Species = { ...oak, id: 'apple', name: 'Apple', heightM: [4, 7], spread: 1, flowers: { colour: '#f7e6ee', months: [4, 5] }, fruit: { name: 'apple', colour: '#c8302a', sizeM: 0.08, months: [8, 9, 10] } };
const spruce: Species = { id: 'spruce', name: 'Spruce', kind: 'tree', leafType: 'needle', habit: 'evergreen', biomes: { boreal_forest: 1 }, heightM: [15, 30], spread: 0.3, trunkColour: '#5c4a3a', leafColour: '#2f5a33', fruit: { name: 'cone', colour: '#7a5a3a', sizeM: 0.08, months: [8, 9] } };
const larch: Species = { ...spruce, id: 'larch', name: 'Larch', habit: 'deciduous', autumnColour: '#d8a020' };
const coconut: Species = { id: 'coconut', name: 'Coconut palm', kind: 'palm', leafType: 'palm', habit: 'evergreen', biomes: { tropical_rainforest: 1 }, heightM: [10, 20], spread: 0.6, trunkColour: '#8a7a62', leafColour: '#4f8a3c', fruit: { name: 'coconut', colour: '#6a8a3a', sizeM: 0.25, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } };
const saguaro: Species = { id: 'saguaro', name: 'Saguaro', kind: 'cactus', leafType: 'succulent', habit: 'evergreen', biomes: { hot_desert: 1 }, heightM: [4, 9], spread: 0.25, trunkColour: '#5a7a45', leafColour: '#5f8a4c', flowers: { colour: '#f8f4e0', months: [5, 6] }, fruit: { name: 'fruit', colour: '#c02040', sizeM: 0.06, months: [6, 7] } };
const sagebrush: Species = { id: 'sagebrush', name: 'Sagebrush', kind: 'shrub', leafType: 'broadleaf', habit: 'evergreen', biomes: { cold_desert: 1 }, heightM: [0.6, 1.5], spread: 1.3, trunkColour: '#6b5643', leafColour: '#7f8f6a', flowers: { colour: '#e8e070', months: [8, 9] }, fruit: { name: 'berry', colour: '#402040', sizeM: 0.012, months: [9, 10] } };
const grass: Species = { id: 'meadow-grass', name: 'Meadow grass', kind: 'grass', leafType: 'broadleaf', habit: 'evergreen', biomes: { temperate_grassland: 1 }, heightM: [0.3, 0.7], spread: 0.6, trunkColour: '#8a8a4a', leafColour: '#8fa653', autumnColour: '#b09c5a' };
const wildflower: Species = { ...grass, id: 'wildflower', kind: 'flower', flowers: { colour: '#e04060', months: [5, 6, 7] } };
const boulder: Species = { id: 'boulder', name: 'Boulder', kind: 'rock', leafType: 'none', habit: 'evergreen', biomes: {}, heightM: [0.5, 1.5], spread: 1, trunkColour: '#7a7874', leafColour: '#7a7874' };

function placement(species: Species, over: Partial<Placement> = {}): Placement {
  return { species: species.id, x: 12.5, y: -8.25, z: 340.5, scale: 1, rotation: 0.4, variant: 0.37, leafOn: 1, flowering: 0, fruiting: 0, ...over };
}

function validateMesh(m: MeshData): void {
  const n = m.positions.length / 3;
  expect(Number.isInteger(n)).toBe(true);
  expect(m.normals.length).toBe(n * 3);
  expect(m.colors.length).toBe(n * 4);
  expect(m.sts.length).toBe(n * 2);
  expect(m.wind.length).toBe(n);
  expect(m.indices.length % 3).toBe(0);
  let badIndex = 0, badNormal = 0, badWind = 0, badPosition = 0;
  for (let i = 0; i < m.indices.length; i++) if (!(m.indices[i] < n)) badIndex++;
  for (let i = 0; i < n; i++) {
    const len = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
    if (!(Math.abs(len - 1) < 1e-3)) badNormal++;
    if (!(m.wind[i] >= 0 && m.wind[i] <= 1)) badWind++;
    for (let k = 0; k < 3; k++) if (!Number.isFinite(m.positions[i * 3 + k])) badPosition++;
  }
  expect({ badIndex, badNormal, badWind, badPosition }).toEqual({ badIndex: 0, badNormal: 0, badWind: 0, badPosition: 0 });
}

function validateBucketed(b: BucketedMesh): number {
  validateMesh(b.opaque);
  validateMesh(b.cutout);
  return vertexCount(b.opaque) + vertexCount(b.cutout);
}

describe('tree geometry', () => {
  it('builds valid full and medium broadleaf trees, medium being cheaper', () => {
    const full = buildTree(oak, placement(oak), 'full');
    const medium = buildTree(oak, placement(oak), 'medium');
    const nFull = validateBucketed(full);
    const nMedium = validateBucketed(medium);
    expect(nFull).toBeGreaterThan(nMedium);
    expect(vertexCount(full.cutout)).toBeGreaterThan(0);
    expect(vertexCount(full.opaque)).toBeGreaterThan(0);
  });
  it('drops leaves when leafOn is 0 (fewer vertices than in full leaf)', () => {
    const leafy = validateBucketed(buildTree(oak, placement(oak, { leafOn: 1 }), 'full'));
    const bare = validateBucketed(buildTree(oak, placement(oak, { leafOn: 0 }), 'full'));
    expect(bare).toBeLessThan(leafy);
    expect(vertexCount(buildTree(oak, placement(oak, { leafOn: 0 }), 'full').cutout)).toBe(0);
  });
  it('adds fruit (opaque six-face spheres) when fruiting', () => {
    const none = buildTree(apple, placement(apple, { fruiting: 0 }), 'full');
    const fruiting = buildTree(apple, placement(apple, { fruiting: 1 }), 'full');
    validateBucketed(fruiting);
    expect(vertexCount(fruiting.opaque)).toBeGreaterThan(vertexCount(none.opaque));
    expect(vertexCount(fruiting.cutout)).toBe(vertexCount(none.cutout));
    const below = buildTree(apple, placement(apple, { fruiting: 0.2 }), 'full');
    expect(vertexCount(below.opaque)).toBe(vertexCount(none.opaque));
  });
  it('adds flower cards when flowering, even on a bare tree', () => {
    const plain = buildTree(apple, placement(apple, { leafOn: 0.05, flowering: 0 }), 'full');
    const blossom = buildTree(apple, placement(apple, { leafOn: 0.05, flowering: 1 }), 'full');
    validateBucketed(blossom);
    expect(vertexCount(blossom.cutout)).toBeGreaterThan(vertexCount(plain.cutout));
  });
  it('is deterministic for the same placement and differs across variants', () => {
    const a = buildTree(oak, placement(oak), 'full');
    const b = buildTree(oak, placement(oak), 'full');
    expect(Array.from(a.opaque.positions)).toEqual(Array.from(b.opaque.positions));
    expect(Array.from(a.cutout.positions)).toEqual(Array.from(b.cutout.positions));
    const c = buildTree(oak, placement(oak, { variant: 0.9 }), 'full');
    expect(Array.from(c.opaque.positions)).not.toEqual(Array.from(a.opaque.positions));
  });
  it('wind weights run from 0 at the trunk base to 1 at the crown tips', () => {
    const t = buildTree(oak, placement(oak), 'full');
    expect(Math.min(...t.opaque.wind)).toBe(0);
    expect(Math.max(...t.cutout.wind)).toBeGreaterThan(0.95);
  });
  it('builds needle trees as opaque cones (no cutout) and bare larches in winter', () => {
    const s = buildTree(spruce, placement(spruce), 'full');
    validateBucketed(s);
    expect(vertexCount(s.cutout)).toBe(0);
    expect(vertexCount(s.opaque)).toBeGreaterThan(60);
    const winter = buildTree(larch, placement(larch, { leafOn: 0.05 }), 'full');
    validateBucketed(winter);
    expect(vertexCount(winter.opaque)).toBeLessThan(vertexCount(buildTree(larch, placement(larch, { leafOn: 1 }), 'full').opaque));
    const cones = buildTree(spruce, placement(spruce, { fruiting: 1 }), 'full');
    expect(vertexCount(cones.opaque)).toBeGreaterThan(vertexCount(s.opaque));
  });
  it('builds palms with frond ribbons and hanging coconuts', () => {
    const p = buildTree(coconut, placement(coconut), 'full');
    validateBucketed(p);
    expect(vertexCount(p.cutout)).toBeGreaterThan(50);
    const withFruit = buildTree(coconut, placement(coconut, { fruiting: 0.8 }), 'full');
    expect(vertexCount(withFruit.opaque)).toBeGreaterThan(vertexCount(p.opaque));
    validateBucketed(buildTree(coconut, placement(coconut), 'medium'));
  });
  it('builds cacti via buildTree and buildCactus with flowers and fruit', () => {
    const c = buildTree(saguaro, placement(saguaro, { scale: 1.2 }), 'full');
    validateBucketed(c);
    expect(vertexCount(c.opaque)).toBeGreaterThan(30);
    const bloom = buildCactus(saguaro, placement(saguaro, { scale: 1.2, flowering: 1, fruiting: 1 }));
    validateBucketed(bloom);
    expect(vertexCount(bloom.cutout)).toBeGreaterThan(0);
    expect(vertexCount(bloom.opaque)).toBeGreaterThan(vertexCount(c.opaque));
  });
  it('keeps all vertices near the placement footprint', () => {
    const p = placement(oak, { x: 100, y: -50, z: 20 });
    const t = buildTree(oak, p, 'full');
    let stray = 0;
    for (const m of [t.opaque, t.cutout]) for (let i = 0; i < m.positions.length; i += 3) {
      if (Math.abs(m.positions[i] - p.x) >= 25 || Math.abs(m.positions[i + 1] - p.y) >= 25 || m.positions[i + 2] <= p.z - 1 || m.positions[i + 2] >= p.z + 40) stray++;
    }
    expect(stray).toBe(0);
  });
});

describe('shrub, grass and rock geometry', () => {
  it('shrub: leafy vs bare, berries and flowers', () => {
    const leafy = buildShrub(sagebrush, placement(sagebrush));
    const bare = buildShrub(sagebrush, placement(sagebrush, { leafOn: 0 }));
    expect(validateBucketed(leafy)).toBeGreaterThan(validateBucketed(bare));
    const berries = buildShrub(sagebrush, placement(sagebrush, { fruiting: 1 }));
    expect(vertexCount(berries.opaque)).toBeGreaterThan(vertexCount(leafy.opaque));
    const bloom = buildShrub(sagebrush, placement(sagebrush, { flowering: 1 }));
    expect(vertexCount(bloom.cutout)).toBeGreaterThan(vertexCount(leafy.cutout));
  });
  it('grass: 3-5 blades with wind 0 at the root and 1 at the tip', () => {
    const g = buildGrass(grass, placement(grass));
    validateMesh(g);
    const n = vertexCount(g);
    expect(n).toBeGreaterThanOrEqual(12);
    expect(n).toBeLessThanOrEqual(20);
    expect(Math.min(...g.wind)).toBe(0);
    expect(Math.max(...g.wind)).toBe(1);
    const f = buildGrass(wildflower, placement(wildflower, { flowering: 1 }));
    validateMesh(f);
    expect(vertexCount(f)).toBeGreaterThan(n);
  });
  it('rock: deterministic displacement, variant-dependent, sunk into the ground', () => {
    const a = buildRock(boulder, placement(boulder));
    const b = buildRock(boulder, placement(boulder));
    validateMesh(a);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    const c = buildRock(boulder, placement(boulder, { variant: 0.71 }));
    expect(Array.from(c.positions)).not.toEqual(Array.from(a.positions));
    let minZ = Infinity;
    for (let i = 2; i < a.positions.length; i += 3) minZ = Math.min(minZ, a.positions[i]);
    expect(minZ).toBeLessThan(340.5);
    expect(vertexCount(a)).toBe(42);
    expect(vertexCount(buildRock(boulder, placement(boulder, { scale: 4 })))).toBe(162);
  });
});

describe('crop fields', () => {
  const polygon: [number, number][] = [[-30, -20], [25, -18], [40, 10], [10, 30], [-25, 22], [-35, 0]];
  const field: FieldSpec = { id: 'f1', polygon, crop: 'wheat', rowAngle: 0.6, colour: '#c8b45a' };
  it('clips plants to the polygon (all positions inside the bbox) and respects the plant cap', () => {
    const m = buildField(field, { seed: 7, heightAt: () => 100, maxPlants: 600 });
    validateBucketed(m);
    expect(vertexCount(m.cutout)).toBeGreaterThan(0);
    expect(vertexCount(m.cutout) / 8).toBeLessThanOrEqual(600 * 1.05);
    const p = m.cutout.positions;
    let outsideBbox = 0, outsidePolygon = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i] < -35 || p[i] > 40 || p[i + 1] < -20 || p[i + 1] > 30) outsideBbox++;
    // plant centres (midpoint of each card's bottom edge) lie inside the polygon
    for (let i = 0; i < p.length; i += 3 * 8) if (!pointInRing(polygon, (p[i] + p[i + 3]) / 2, (p[i + 1] + p[i + 4]) / 2)) outsidePolygon++;
    expect({ outsideBbox, outsidePolygon }).toEqual({ outsideBbox: 0, outsidePolygon: 0 });
  });
  it('rice paddies get a water-tinted ground polygon; unknown crops use the default profile', () => {
    const rice = buildField({ ...field, crop: 'rice' }, { seed: 7, heightAt: () => 5 });
    expect(vertexCount(rice.opaque)).toBe(6);
    expect(cropProfile('quinoa')).toBe(cropProfile('default'));
    expect(cropProfile('Sweet Corn').heightM).toBeGreaterThan(2);
  });
});

describe('buildings', () => {
  const spec: BuildingSpec = { id: 'b1', footprint: [[0, 0], [12, 0], [12, 8], [0, 8]], heightM: 9, baseZ: 50, style: 'rural', source: 'procedural', roof: 'gable', colour: '#d8ccb4' };
  it('extrudes gable, hip and flat roofs with valid normals and the right vertical extent', () => {
    for (const roof of ['gable', 'hip', 'flat'] as const) {
      const m = buildBuilding({ ...spec, roof });
      validateMesh(m);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 2; i < m.positions.length; i += 3) { minZ = Math.min(minZ, m.positions[i]); maxZ = Math.max(maxZ, m.positions[i]); }
      expect(minZ).toBeCloseTo(48.5, 5);
      expect(maxZ).toBeCloseTo(59, 5);
      expect(vertexCount(m)).toBeGreaterThanOrEqual(20);
    }
  });
  it('marks facades with the window code and roofs without', () => {
    const m = buildBuilding(spec);
    const alphas = new Set<number>();
    for (let i = 3; i < m.colors.length; i += 4) alphas.add(m.colors[i]);
    expect(alphas.has(254)).toBe(true);
    expect(alphas.has(255)).toBe(true);
    expect(buildBuilding({ ...spec, style: 'tower', heightM: 80, roof: 'flat' }).colors[3]).toBe(253);
  });
  it('ignores degenerate footprints', () => {
    expect(vertexCount(buildBuilding({ ...spec, footprint: [[0, 0], [1, 1]] }))).toBe(0);
  });
});

describe('mesh utilities', () => {
  it('merges with index offsets and chunks by vertex budget', () => {
    const a = buildGrass(grass, placement(grass));
    const b = buildRock(boulder, placement(boulder));
    const merged = mergeGeometries([a, b]);
    validateMesh(merged);
    expect(vertexCount(merged)).toBe(vertexCount(a) + vertexCount(b));
    expect(merged.indices[a.indices.length]).toBe(b.indices[0] + vertexCount(a));
    const chunks = chunkGeometries([a, b, a, b], vertexCount(a) + vertexCount(b));
    expect(chunks.length).toBe(2);
    chunks.forEach(validateMesh);
  });
  it('ear-clips concave polygons and parses colours', () => {
    const tris = earClip([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]);
    expect(tris.length).toBe(9);
    expect(parseColour('#abc')).toEqual([170, 187, 204]);
    expect(parseColour('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColour('nonsense', [9, 9, 9])).toEqual([9, 9, 9]);
  });
  it('atlas cells are valid UV rects and the atlas builder degrades without a 2D canvas', () => {
    for (const r of Object.values(ATLAS_CELLS)) {
      expect(r.u0).toBeGreaterThanOrEqual(0); expect(r.u1).toBeLessThanOrEqual(1); expect(r.u0).toBeLessThan(r.u1);
      expect(r.v0).toBeGreaterThanOrEqual(0); expect(r.v1).toBeLessThanOrEqual(1); expect(r.v0).toBeLessThan(r.v1);
    }
    const atlas = buildLeafAtlas();
    expect(atlas === null || atlas.width === 512).toBe(true);
  });
});

describe('tile mesh assembly', () => {
  const species = new Map<string, Species>([oak, apple, spruce, coconut, sagebrush, grass, boulder, saguaro].map((s) => [s.id, s]));
  const lookup = (id: string) => species.get(id);
  function tile(count: number, mix: Species[]): NearFieldTile {
    const placements: Placement[] = [];
    for (let i = 0; i < count; i++) {
      const s = mix[i % mix.length];
      const v = ((i * 0.6180339887) % 1);
      placements.push({ species: s.id, x: (v * 600) - 300, y: ((i * 0.7548776662) % 1) * 600 - 300, z: 120 + v * 10, scale: 0.8 + v * 0.5, rotation: v * 6, variant: v, leafOn: 1, flowering: 0.5, fruiting: 0.6 });
    }
    return { key: '16/1/2', z: 16, x: 1, y: 2, anchorLat: 48, anchorLon: 2, anchorHeightM: 120, biome: 'temperate_deciduous_forest', canopyColour: '#4a7d33', groundColour: '#6a8a40', placements, buildings: [{ id: 'h1', footprint: [[10, 10], [22, 10], [22, 18], [10, 18]], heightM: 7, baseZ: 121, style: 'rural', source: 'procedural', roof: 'hip', colour: '#d0c4ae' }, { id: 'osm1', footprint: [[40, 10], [52, 10], [52, 18], [40, 18]], heightM: 7, baseZ: 121, style: 'rural', source: 'osm', roof: 'flat', colour: '#d0c4ae' }], fields: [{ id: 'f', polygon: [[-200, -200], [-100, -200], [-100, -120], [-200, -120]], crop: 'maize', rowAngle: 0.2, colour: '#8fb050' }], seed: 1, generatedMs: 1, counts: { tree: 0, shrub: 0, grass: 0, flower: 0, crop: 0, rock: 0, cactus: 0, palm: 0, reed: 0 } };
  }
  it('keeps a 400-placement tile under 260k vertices with 16-bit chunks and shifts z to the anchor frame', () => {
    const t = tile(400, [oak, oak, spruce, apple, coconut, sagebrush, boulder, grass, saguaro]);
    const r = buildTileMeshes(t, { species: lookup });
    expect(r.vertexCount).toBeLessThan(260_000);
    expect(r.vertexCount).toBeGreaterThan(20_000);
    let sum = 0;
    for (const c of [...r.opaque, ...r.cutout]) { validateMesh(c); expect(vertexCount(c)).toBeLessThanOrEqual(65_535); expect(c.indices).toBeInstanceOf(Uint16Array); sum += vertexCount(c); }
    expect(sum).toBe(r.vertexCount);
    expect(r.counts.buildings).toBe(1);
    expect(r.buildings.map((b) => b.id)).toEqual(['h1']);
    expect(r.counts.fields).toBe(1);
    expect(r.counts.trees + r.counts.shrubs + r.counts.grass + r.counts.rocks + r.counts.skipped).toBe(400);
    let maxAbsZ = 0;
    for (const c of r.opaque) for (let i = 2; i < c.positions.length; i += 3) maxAbsZ = Math.max(maxAbsZ, Math.abs(c.positions[i]));
    expect(maxAbsZ).toBeLessThan(60);
  });
  it('degrades detail for very dense tiles and still respects the budget', () => {
    const t = tile(1500, [oak, spruce, apple]);
    const r = buildTileMeshes(t, { species: lookup });
    expect(r.vertexCount).toBeLessThanOrEqual(250_000);
    expect(detailFor(1500)).toBe(0.3); // 400/1500 clamped to the 0.3 floor
    expect(detailFor(800)).toBeCloseTo(0.5, 5);
    expect(detailFor(120)).toBe(1);
  });
  it('falls back to plausible generic species for unknown ids', () => {
    expect(fallbackSpecies('scots_pine').leafType).toBe('needle');
    expect(fallbackSpecies('date_palm').kind).toBe('palm');
    expect(fallbackSpecies('granite_boulder').kind).toBe('rock');
    expect(fallbackSpecies('mystery').kind).toBe('tree');
    const t = tile(20, [{ ...oak, id: 'unknown-species' }]);
    expect(buildTileMeshes(t, { species: () => undefined }).counts.trees).toBe(20);
  });
});
