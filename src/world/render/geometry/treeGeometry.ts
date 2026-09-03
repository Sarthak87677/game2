/**
 * Procedural trees: tapered noisy trunk, recursive branches, and a crown that depends on the leaf type —
 * broadleaf (alpha-cut leaf-cluster cards with an inner shadow-casting core), needle (stacked cones), palm (curved
 * frond ribbons) or succulent (ribbed cactus body). Phenology comes from the placement: leaf colour lerps toward the
 * autumn colour by (1 - leafOn), leaves vanish below leafOn 0.15, flowers appear above flowering 0.3 and fruit (six-face
 * spheres coloured from the species' FruitRule) hangs under clusters above fruiting 0.3. Wind weights run 0 at the
 * trunk base to 1 at the crown tips. Everything is seeded from the placement variant.
 */
import { fbm2, type Rng } from '@/util/hash';
import type { Placement, Species } from '@/world/procedural/types';
import { MeshBuilder, type BucketedMesh } from './mesh';
import { add, addBipyramid, addCard, addCone, addCrossedCards, addEllipsoid, addTube, cross, normalize, type TubeRing, type Vec3 } from './shapes';
import { parseColour, scaleColour, type RGB } from './colour';
import { ATLAS_CELLS } from '../leafAtlas';
import { clamp, leafBaseColour, leafCellFor, nominalHeight, placementRng, placementSeed } from './common';

export type TreeLod = 'full' | 'medium';

export interface TreeOptions {
  /** 0..1 detail multiplier (cluster counts, branch levels, tube sides); tiles with many placements lower it. */
  detail?: number;
}

interface Tip { p: Vec3; dir: Vec3 }

interface TreeContext {
  rng: Rng;
  species: Species;
  placement: Placement;
  lod: TreeLod;
  detail: number;
  seedInt: number;
  seedF: number;
  base: Vec3;
  H: number;
  crownR: number;
  trunkTop: number;
  r0: number;
  trunkPoint: (t: number) => Vec3;
  leafBase: RGB;
  trunkColour: RGB;
  leafOn: number;
  bark: (ring: number, side: number) => RGB;
}

const UP: Vec3 = { x: 0, y: 0, z: 1 };

function growBranches(b: MeshBuilder, rng: Rng, origin: Vec3, dir: Vec3, length: number, radius: number, level: number, maxLevel: number, colourAt: (ring: number, side: number) => RGB, tips: Tip[], windBase: number): void {
  const ringsN = level === 1 ? 3 : 2;
  const sides = level === 1 ? 5 : level === 2 ? 4 : 3;
  const rings: TubeRing[] = [];
  for (let i = 0; i < ringsN; i++) {
    const t = i / (ringsN - 1);
    const p = add(add(origin, dir, length * t), UP, length * 0.12 * t * t);
    rings.push({ centre: p, radius: Math.max(0.01, radius * (1 - 0.55 * t)), wind: Math.min(0.85, windBase + 0.15 * t) });
  }
  addTube(b, rings, sides, colourAt);
  const end = rings[ringsN - 1].centre;
  const endWind = Math.min(0.85, windBase + 0.15);
  if (level >= maxLevel) { tips.push({ p: end, dir }); return; }
  const kids = level === 1 ? 2 + rng.int(2) : 2;
  for (let k = 0; k < kids; k++) {
    const rv = normalize({ x: rng.gaussian(), y: rng.gaussian(), z: rng.gaussian() * 0.5 });
    const nd = normalize(add(add(dir, rv, 0.75), UP, 0.25));
    const t0 = k === 0 ? 1 : rng.range(0.55, 1);
    const o = add(add(origin, dir, length * t0), UP, length * 0.12 * t0 * t0);
    growBranches(b, rng, o, nd, length * rng.range(0.55, 0.75), radius * 0.6, level + 1, maxLevel, colourAt, tips, endWind);
  }
  if (level >= 2) tips.push({ p: end, dir });
}

function addFruit(opaque: MeshBuilder, ctx: TreeContext, at: () => Vec3, count: number, wind: number): void {
  const fruit = ctx.species.fruit;
  if (!fruit) return;
  const colour = parseColour(fruit.colour, [200, 60, 40]);
  const r = Math.max(0.015, fruit.sizeM / 2);
  for (let i = 0; i < count; i++) {
    const p = at();
    addBipyramid(opaque, p.x, p.y, p.z, r, scaleColour(colour, ctx.rng.range(0.85, 1.1)), wind);
  }
}

function addFlowers(cutout: MeshBuilder, ctx: TreeContext, centre: Vec3, rx: number, rz: number, count: number, size: number): void {
  const rule = ctx.species.flowers;
  if (!rule) return;
  const colour = parseColour(rule.colour, [245, 235, 240]);
  const bright = scaleColour(colour, 1.08);
  for (let i = 0; i < count; i++) {
    const d = normalize({ x: ctx.rng.gaussian(), y: ctx.rng.gaussian(), z: ctx.rng.gaussian() });
    const rad = ctx.rng.range(0.7, 1.0);
    const p = { x: centre.x + d.x * rad * rx, y: centre.y + d.y * rad * rx, z: centre.z + d.z * rad * rz };
    const wf = clamp((p.z - ctx.base.z) / ctx.H, 0, 1);
    addCrossedCards(cutout, p.x, p.y, p.z, size, size, ctx.rng.range(0, Math.PI), colour, bright, ATLAS_CELLS.flower, 0.6 + 0.3 * wf, Math.min(1, 0.75 + 0.3 * wf), { centred: true, normal: normalize(add(d, UP, 0.8)) });
  }
}

function buildBroadleaf(opaque: MeshBuilder, cutout: MeshBuilder, ctx: TreeContext): void {
  const { rng, species, placement, lod, detail, base, H, crownR, leafBase, trunkColour, leafOn } = ctx;
  const bare = leafOn < 0.15 || species.leafType === 'none';
  const crownRz = crownR * rng.range(0.85, 1.15);
  const top = ctx.trunkPoint(1);
  const c: Vec3 = { x: top.x, y: top.y, z: top.z + crownRz * 0.55 };
  const cell = ATLAS_CELLS[leafCellFor(species)];
  if (lod === 'full') {
    const maxLevel = detail > 0.7 ? 2 + rng.int(3) : detail > 0.4 ? 2 + rng.int(2) : 2;
    const n1 = 3 + rng.int(2);
    const tips: Tip[] = [];
    for (let k = 0; k < n1; k++) {
      const az = (k / n1) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const el = rng.range(0.6, 1.05);
      const dir = { x: Math.cos(az) * Math.sin(el), y: Math.sin(az) * Math.sin(el), z: Math.cos(el) };
      growBranches(opaque, rng, ctx.trunkPoint(rng.range(0.7, 1)), dir, crownR * rng.range(0.55, 0.85), ctx.r0 * 0.42, 1, maxLevel, ctx.bark, tips, 0.25);
    }
    const positions: Vec3[] = [];
    if (!bare) {
      const nClusters = Math.max(6, Math.round((14 + rng.int(9)) * detail));
      for (let i = tips.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = tips[i]; tips[i] = tips[j]; tips[j] = t; }
      for (const t of tips) if (positions.length < nClusters) positions.push(add(t.p, t.dir, crownR * 0.1));
      while (positions.length < nClusters) {
        const d = normalize({ x: rng.gaussian(), y: rng.gaussian(), z: rng.gaussian() });
        const rad = Math.cbrt(rng.next()) * 0.9;
        positions.push({ x: c.x + d.x * rad * crownR, y: c.y + d.y * rad * crownR, z: c.z + d.z * rad * crownRz });
      }
      const size = crownR * (0.55 + 0.4 * (1 - detail));
      for (const p of positions) {
        const s = size * rng.range(0.85, 1.15);
        const k = rng.range(0.88, 1.12);
        const rel = normalize({ x: (p.x - c.x) / crownR, y: (p.y - c.y) / crownR, z: (p.z - c.z) / crownRz + 0.6 });
        const wf = clamp((p.z - base.z) / H, 0, 1);
        addCrossedCards(cutout, p.x, p.y, p.z, s, s, rng.range(0, Math.PI), scaleColour(leafBase, k * 0.76), scaleColour(leafBase, k * 1.06), cell, 0.5 + 0.4 * wf, Math.min(1, 0.7 + 0.35 * wf), { centred: true, normal: rel, flipU: rng.next() < 0.5 });
      }
      if (leafOn >= 0.5 && detail >= 0.5) {
        addEllipsoid(opaque, c.x, c.y, c.z, crownR * 0.55, crownR * 0.55, crownRz * 0.5, 6, 3, (_nx, _ny, nz) => scaleColour(leafBase, 0.42 + 0.15 * nz), 0.6);
      }
      if (species.fruit && placement.fruiting > 0.3) {
        const count = Math.min(40, Math.round(nClusters * placement.fruiting * 1.5 * detail));
        addFruit(opaque, ctx, () => {
          const p = positions[rng.int(positions.length)];
          return { x: p.x + rng.range(-0.3, 0.3) * size, y: p.y + rng.range(-0.3, 0.3) * size, z: p.z - size * rng.range(0.35, 0.55) };
        }, count, 0.7);
      }
    }
    if (species.flowers && placement.flowering > 0.3) {
      const count = Math.round((10 + rng.int(8)) * placement.flowering * detail);
      addFlowers(cutout, ctx, c, crownR, crownRz, count, crownR * (bare ? 0.28 : rng.range(0.12, 0.2)));
    }
  } else {
    const rot = rng.range(0, Math.PI);
    if (!bare) {
      addCrossedCards(cutout, c.x, c.y, c.z, crownR * 2, crownRz * 2, rot, scaleColour(leafBase, 0.78), scaleColour(leafBase, 1.05), cell, 0.5, 1, { centred: true, normal: UP });
      if (rng.next() < 0.5) addCard(cutout, c.x, c.y, c.z, crownR * 2, crownRz * 2, rot + Math.PI / 4, scaleColour(leafBase, 0.78), scaleColour(leafBase, 1.05), cell, 0.5, 1, { centred: true, normal: UP, flipU: true });
    } else {
      const twig = scaleColour(trunkColour, 0.9);
      addCrossedCards(cutout, c.x, c.y, c.z, crownR * 1.6, crownRz * 1.8, rot, twig, twig, ATLAS_CELLS.twigs, 0.3, 0.8, { centred: true, normal: UP });
    }
    if (species.flowers && placement.flowering > 0.5) {
      const fc = parseColour(species.flowers.colour, [245, 235, 240]);
      addCrossedCards(cutout, c.x, c.y, c.z, crownR * 1.7, crownRz * 1.7, rot + 0.4, fc, fc, ATLAS_CELLS.shrub, 0.5, 1, { centred: true, normal: UP });
    }
  }
}

function buildConifer(opaque: MeshBuilder, ctx: TreeContext): void {
  const { rng, species, placement, lod, detail, base, H, crownR, leafBase, leafOn, seedInt, seedF } = ctx;
  if (leafOn < 0.15) {
    // Deciduous conifer (larch) out of season: bare whorled branches only.
    const tips: Tip[] = [];
    const whorls = lod === 'full' ? 6 : 3;
    for (let k = 0; k < whorls; k++) {
      const t = 0.3 + 0.65 * (k / whorls);
      const az = rng.range(0, Math.PI * 2);
      const dir = normalize({ x: Math.cos(az), y: Math.sin(az), z: 0.15 });
      growBranches(opaque, rng, ctx.trunkPoint(t), dir, crownR * (1.1 - 0.8 * t), ctx.r0 * 0.3, 1, 1, ctx.bark, tips, 0.3);
    }
    return;
  }
  const tiers = lod === 'full' ? Math.max(3, Math.round((3 + rng.int(3)) * Math.max(0.6, detail))) : 2;
  const crownBase = base.z + H * rng.range(0.15, 0.28);
  const crownTop = base.z + H;
  const span = crownTop - crownBase;
  const sides = lod === 'full' && detail > 0.6 ? 8 : 6;
  const rims: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const zb = crownBase + span * t0;
    const zt = i === tiers - 1 ? crownTop : zb + (span / tiers) * 1.5;
    const rBase = crownR * (1 - 0.72 * t0) * rng.range(0.9, 1.1);
    const rTop = i === tiers - 1 ? 0.01 : rBase * 0.15;
    const centre = ctx.trunkPoint(clamp((zb - base.z) / ctx.trunkTop, 0, 1));
    const shade = 0.85 + 0.15 * t0;
    addCone(opaque, centre.x, centre.y, zb, rBase, zt, rTop, sides, (ang, t) => t < 0 ? scaleColour(leafBase, 0.5) : scaleColour(leafBase, shade * (0.78 + 0.45 * fbm2(Math.cos(ang) * 2 + i, Math.sin(ang) * 2 + t * 3 + seedF * 9, 3, seedInt))), 0.2 + 0.55 * t0, 0.3 + 0.65 * ((i + 1) / tiers), true);
    rims.push({ x: centre.x, y: centre.y, z: zb, r: rBase * 0.8 });
  }
  if (species.fruit && placement.fruiting > 0.3 && lod === 'full') {
    const count = Math.round(6 * placement.fruiting * detail);
    addFruit(opaque, ctx, () => {
      const rim = rims[rng.int(rims.length)];
      const az = rng.range(0, Math.PI * 2);
      return { x: rim.x + Math.cos(az) * rim.r, y: rim.y + Math.sin(az) * rim.r, z: rim.z - 0.1 };
    }, count, 0.5);
  }
}

function buildPalm(opaque: MeshBuilder, cutout: MeshBuilder, ctx: TreeContext): void {
  const { rng, species, placement, lod, detail, crownR, leafBase, trunkColour, r0 } = ctx;
  const c = ctx.trunkPoint(1);
  addEllipsoid(opaque, c.x, c.y, c.z, r0 * 1.5, r0 * 1.5, r0 * 2, 5, 2, () => scaleColour(trunkColour, 0.85), 0.3);
  if (lod === 'medium') {
    const rot = rng.range(0, Math.PI);
    addCrossedCards(cutout, c.x, c.y, c.z - crownR * 0.9, crownR * 2.4, crownR * 2, rot, scaleColour(leafBase, 0.8), scaleColour(leafBase, 1.05), ATLAS_CELLS.palmCrown, 0.5, 1, { normal: UP });
    return;
  }
  const n = Math.max(6, Math.round((8 + rng.int(7)) * Math.max(0.5, detail)));
  const segs = detail > 0.6 ? 6 : 4;
  const uv = ATLAS_CELLS.palm;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const el = rng.range(0.35, 1.0);
    const L = crownR * rng.range(1.1, 1.5);
    const wmax = L * 0.24;
    const h: Vec3 = { x: Math.cos(az), y: Math.sin(az), z: 0 };
    const s: Vec3 = { x: -Math.sin(az), y: Math.cos(az), z: 0 };
    const shade = rng.range(0.9, 1.1);
    let prevL = -1, prevR = -1;
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const p = { x: c.x + h.x * L * t * Math.cos(el), y: c.y + h.y * L * t * Math.cos(el), z: c.z + L * (Math.sin(el) * t - 1.35 * t * t) };
      const w = wmax * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7) + 0.03;
      const tangent: Vec3 = { x: h.x * L * Math.cos(el), y: h.y * L * Math.cos(el), z: L * (Math.sin(el) - 2.7 * t) };
      let nrm = normalize(cross(s, tangent));
      if (nrm.z < 0) nrm = { x: -nrm.x, y: -nrm.y, z: -nrm.z };
      const colour = scaleColour(leafBase, shade * (0.8 + 0.35 * t));
      const wind = 0.45 + 0.55 * t;
      const v = uv.v0 + (uv.v1 - uv.v0) * t;
      const l = cutout.vertex(p.x - s.x * w * 0.5, p.y - s.y * w * 0.5, p.z, nrm.x, nrm.y, nrm.z, colour, 255, uv.u0, v, wind);
      const r = cutout.vertex(p.x + s.x * w * 0.5, p.y + s.y * w * 0.5, p.z, nrm.x, nrm.y, nrm.z, colour, 255, uv.u1, v, wind);
      if (j > 0) cutout.quad(prevL, prevR, r, l);
      prevL = l; prevR = r;
    }
  }
  if (species.fruit && placement.fruiting > 0.3) {
    const count = 3 + rng.int(4);
    addFruit(opaque, ctx, () => ({ x: c.x + rng.range(-0.4, 0.4) * crownR * 0.4, y: c.y + rng.range(-0.4, 0.4) * crownR * 0.4, z: c.z - crownR * 0.15 - rng.range(0, 0.3) }), count, 0.5);
  }
  if (species.flowers && placement.flowering > 0.3) addFlowers(cutout, ctx, { x: c.x, y: c.y, z: c.z - crownR * 0.1 }, crownR * 0.35, crownR * 0.2, 2 + rng.int(3), crownR * 0.2);
}

/** Ribbed columnar/barrel cactus with optional arms, flowers and fruit (used for succulent-leaved trees and cacti). */
export function buildCactus(species: Species, placement: Placement, opts: TreeOptions = {}): BucketedMesh {
  const detail = clamp(opts.detail ?? 1, 0.2, 1);
  const rng = placementRng(species, placement, 'cactus');
  const seedInt = placementSeed(species, placement, 'cactus-noise');
  const opaque = new MeshBuilder(128, 256);
  const cutout = new MeshBuilder(32, 64);
  const H = nominalHeight(species, placement);
  const base: Vec3 = { x: placement.x, y: placement.y, z: placement.z };
  const colour = parseColour(species.leafColour, [86, 128, 70]);
  const barrel = species.spread > 0.5;
  const r = Math.max(0.05, H * (barrel ? 0.16 : 0.09) * rng.range(0.8, 1.2));
  const sides = 8;
  const ribbed = (ring: number, side: number): RGB => scaleColour(colour, (side % 2 ? 0.8 : 1.05) * (0.9 + 0.2 * fbm2(ring * 1.3 + placement.variant * 5, side * 0.5, 2, seedInt)));
  const rings: TubeRing[] = [];
  const nR = 4;
  for (let i = 0; i < nR; i++) {
    const t = i / (nR - 1);
    const rad = r * (barrel ? 0.75 + 0.45 * Math.sin(Math.PI * t) : 0.9 + 0.2 * Math.sin(Math.PI * t)) * (i === nR - 1 ? 0.6 : 1);
    rings.push({ centre: { x: base.x, y: base.y, z: base.z + H * 0.92 * t }, radius: rad, wind: 0 });
  }
  addTube(opaque, rings, sides, ribbed);
  const topZ = base.z + H * 0.92;
  addCone(opaque, base.x, base.y, topZ, rings[nR - 1].radius, base.z + H, 0.01, sides, (ang) => ribbed(nR, Math.round((ang / (Math.PI * 2)) * sides)), 0, 0);
  const armTops: Vec3[] = [];
  if (H > 1.8 && !barrel) {
    const nArms = detail < 0.4 ? 0 : rng.int(3);
    for (let k = 0; k < nArms; k++) {
      const zA = base.z + H * rng.range(0.35, 0.6);
      const az = rng.range(0, Math.PI * 2);
      const L1 = H * 0.2, L2 = H * rng.range(0.25, 0.4);
      const ra = r * 0.6;
      const ox = Math.cos(az), oy = Math.sin(az);
      const arm: TubeRing[] = [
        { centre: { x: base.x + ox * r * 0.6, y: base.y + oy * r * 0.6, z: zA }, radius: ra, wind: 0 },
        { centre: { x: base.x + ox * L1, y: base.y + oy * L1, z: zA + L1 * 0.25 }, radius: ra, wind: 0 },
        { centre: { x: base.x + ox * (L1 + ra), y: base.y + oy * (L1 + ra), z: zA + L1 * 0.5 + ra }, radius: ra, wind: 0 },
        { centre: { x: base.x + ox * (L1 + ra), y: base.y + oy * (L1 + ra), z: zA + L1 * 0.5 + ra + L2 }, radius: ra * 0.7, wind: 0 },
      ];
      addTube(opaque, arm, 6, ribbed);
      const top = arm[3].centre;
      addCone(opaque, top.x, top.y, top.z, ra * 0.7, top.z + ra * 0.6, 0.01, 6, () => scaleColour(colour, 0.95), 0, 0);
      armTops.push({ x: top.x, y: top.y, z: top.z + ra * 0.6 });
    }
  }
  const tops = [{ x: base.x, y: base.y, z: base.z + H }, ...armTops];
  if (species.flowers && placement.flowering > 0.3) {
    const fc = parseColour(species.flowers.colour, [240, 200, 80]);
    for (const t of tops) {
      const m = 1 + rng.int(3);
      for (let i = 0; i < m; i++) {
        const az = rng.range(0, Math.PI * 2);
        addCrossedCards(cutout, t.x + Math.cos(az) * r * 0.5, t.y + Math.sin(az) * r * 0.5, t.z - 0.05, r * 0.7, r * 0.7, az, fc, scaleColour(fc, 1.08), ATLAS_CELLS.flower, 0, 0.1, { centred: true, normal: UP });
      }
    }
  }
  if (species.fruit && placement.fruiting > 0.3) {
    const fc = parseColour(species.fruit.colour, [180, 40, 60]);
    const fr = Math.max(0.015, species.fruit.sizeM / 2);
    for (const t of tops) {
      const m = 1 + rng.int(4);
      for (let i = 0; i < m; i++) {
        const az = rng.range(0, Math.PI * 2);
        addBipyramid(opaque, t.x + Math.cos(az) * r * 0.6, t.y + Math.sin(az) * r * 0.6, t.z - 0.05, fr, fc, 0);
      }
    }
  }
  return { opaque: opaque.build(), cutout: cutout.build() };
}

/**
 * Builds one tree. 'full' LOD: multi-ring trunk, 2-4 branch levels and a detailed crown; 'medium' LOD: a short
 * trunk plus 2-3 large crossed cards. Returns opaque (trunk, branches, cones, core, fruit) and cutout (leaf, frond,
 * flower cards) meshes in absolute local metres (z is the placement's terrain height).
 */
export function buildTree(species: Species, placement: Placement, lod: TreeLod, opts: TreeOptions = {}): BucketedMesh {
  if (species.leafType === 'succulent' || species.kind === 'cactus') return buildCactus(species, placement, opts);
  const detail = clamp(opts.detail ?? 1, 0.2, 1);
  const rng = placementRng(species, placement, 'tree');
  const seedInt = placementSeed(species, placement, 'tree-noise');
  const seedF = clamp(placement.variant, 0, 1);
  const opaque = new MeshBuilder(256, 512);
  const cutout = new MeshBuilder(256, 512);
  const H = nominalHeight(species, placement);
  const crownR = Math.max(0.3, H * Math.max(0.15, species.spread) * 0.5);
  const base: Vec3 = { x: placement.x, y: placement.y, z: placement.z };
  const leafType = species.leafType;
  const leafOn = clamp(placement.leafOn, 0, 1);
  const leafBase = leafBaseColour(species, placement);
  const trunkColour = parseColour(species.trunkColour, [96, 78, 60]);
  const palm = leafType === 'palm' || species.kind === 'palm';
  const needle = leafType === 'needle';
  const trunkTopFrac = palm ? 0.88 : needle ? 0.97 : leafType === 'none' ? 0.7 : rng.range(0.45, 0.6);
  const trunkTop = H * trunkTopFrac;
  const bendAng = rng.range(0, Math.PI * 2);
  const bendAmp = H * (palm ? 0.09 : 0.022) * rng.range(0.2, 1);
  const trunkPoint = (t: number): Vec3 => {
    const wob = (fbm2(t * 3 + seedF * 7, seedF * 13, 3, seedInt) - 0.5) * H * 0.012;
    return { x: base.x + Math.cos(bendAng) * bendAmp * t * t - Math.sin(bendAng) * wob, y: base.y + Math.sin(bendAng) * bendAmp * t * t + Math.cos(bendAng) * wob, z: base.z + trunkTop * t };
  };
  const r0 = Math.max(0.04, H * (palm ? 0.02 : needle ? 0.028 : 0.038) * rng.range(0.85, 1.2));
  const taper = palm ? 0.35 : 0.65;
  const bark = (ring: number, side: number): RGB => palm
    ? scaleColour(trunkColour, 0.75 + 0.4 * fbm2(ring * 2.3 + seedF * 3, side * 0.3, 2, seedInt))
    : scaleColour(trunkColour, 0.72 + 0.5 * fbm2(side * 0.9 + seedF * 3, ring * 1.7 + seedF * 5, 3, seedInt));
  const ringCount = lod === 'full' ? (detail > 0.5 ? 5 : 4) : 3;
  const rings: TubeRing[] = [];
  for (let i = 0; i < ringCount; i++) {
    const t = i / (ringCount - 1);
    rings.push({ centre: trunkPoint(t), radius: r0 * (1 - taper * t) * (i === 0 ? 1.25 : 1), wind: 0.22 * t * t });
  }
  const sides = lod === 'full' ? (detail > 0.6 ? 7 + rng.int(2) : 6) : 5;
  addTube(opaque, rings, sides, bark);
  const ctx: TreeContext = { rng, species, placement, lod, detail, seedInt, seedF, base, H, crownR, trunkTop, r0, trunkPoint, leafBase, trunkColour, leafOn, bark };
  if (needle) buildConifer(opaque, ctx);
  else if (palm) buildPalm(opaque, cutout, ctx);
  else buildBroadleaf(opaque, cutout, ctx);
  return { opaque: opaque.build(), cutout: cutout.build() };
}
