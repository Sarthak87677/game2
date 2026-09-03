/**
 * Shrubs: a low-poly shadow-casting core ellipsoid wrapped in alpha-cut leaf-cluster cards, with flowers and
 * berries from the placement's phenology. Deciduous shrubs out of leaf become twig cards; succulents become rosettes.
 */
import { fbm2 } from '@/util/hash';
import type { Placement, Species } from '@/world/procedural/types';
import { MeshBuilder, type BucketedMesh } from './mesh';
import { add, addBipyramid, addCard, addCrossedCards, addEllipsoid, normalize, type Vec3 } from './shapes';
import { parseColour, scaleColour } from './colour';
import { ATLAS_CELLS } from '../leafAtlas';
import { clamp, leafBaseColour, nominalHeight, placementRng, placementSeed } from './common';

export interface ShrubOptions { detail?: number }

const UP: Vec3 = { x: 0, y: 0, z: 1 };

/** Builds one shrub in absolute local metres (z = placement terrain height). */
export function buildShrub(species: Species, placement: Placement, opts: ShrubOptions = {}): BucketedMesh {
  const detail = clamp(opts.detail ?? 1, 0.2, 1);
  const rng = placementRng(species, placement, 'shrub');
  const seedInt = placementSeed(species, placement, 'shrub-noise');
  const seedF = clamp(placement.variant, 0, 1);
  const opaque = new MeshBuilder(64, 128);
  const cutout = new MeshBuilder(64, 128);
  const H = Math.max(0.25, nominalHeight(species, placement));
  const R = Math.max(0.2, H * Math.max(0.4, species.spread) * 0.5);
  const x = placement.x, y = placement.y, z = placement.z;
  const leafBase = leafBaseColour(species, placement);
  const trunkColour = parseColour(species.trunkColour, [96, 78, 60]);
  const leafOn = clamp(placement.leafOn, 0, 1);
  const centre: Vec3 = { x, y, z: z + H * 0.45 };

  if (species.leafType === 'succulent') {
    const rot = rng.range(0, Math.PI);
    const dark = scaleColour(leafBase, 0.7);
    addCrossedCards(cutout, x, y, z, R * 2, H * 1.15, rot, dark, leafBase, ATLAS_CELLS.succulent, 0, 0.15, { normal: UP });
    addCard(cutout, x, y, z, R * 2, H * 1.15, rot + Math.PI / 4, dark, leafBase, ATLAS_CELLS.succulent, 0, 0.15, { normal: UP, flipU: true });
    if (species.flowers && placement.flowering > 0.3) {
      const fc = parseColour(species.flowers.colour, [240, 200, 80]);
      addCard(cutout, x, y, z + H, R * 0.5, H * 0.9, rot, scaleColour(fc, 0.8), fc, ATLAS_CELLS.crop, 0.2, 0.6, { normal: UP });
    }
    return { opaque: opaque.build(), cutout: cutout.build() };
  }

  const bare = leafOn < 0.15;
  if (!bare) {
    addEllipsoid(opaque, centre.x, centre.y, centre.z, R * 0.7, R * 0.7, H * 0.42, 6, 3, (nx, ny, nz) => scaleColour(leafBase, 0.5 + 0.2 * nz + 0.15 * fbm2(nx * 2 + seedF * 5, ny * 2 + nz, 2, seedInt)), 0.25);
    const n = Math.max(3, Math.round((4 + rng.int(4)) * detail));
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const d = normalize({ x: Math.cos(az), y: Math.sin(az), z: rng.range(-0.2, 0.6) });
      const p = { x: centre.x + d.x * R * 0.55, y: centre.y + d.y * R * 0.55, z: centre.z + d.z * H * 0.35 };
      const w = R * rng.range(0.9, 1.3);
      const h = H * rng.range(0.65, 0.95);
      const kk = rng.range(0.9, 1.1);
      addCrossedCards(cutout, p.x, p.y, p.z, w, h, az + rng.range(-0.4, 0.4), scaleColour(leafBase, 0.7 * kk), scaleColour(leafBase, 1.05 * kk), ATLAS_CELLS.shrub, 0.2, 0.6, { centred: true, normal: normalize(add(d, UP, 0.5)), flipU: rng.next() < 0.5 });
    }
    if (species.fruit && placement.fruiting > 0.3) {
      const fc = parseColour(species.fruit.colour, [160, 30, 50]);
      const fr = Math.max(0.012, species.fruit.sizeM / 2);
      const m = Math.round(8 * placement.fruiting * detail);
      for (let i = 0; i < m; i++) {
        const d = normalize({ x: rng.gaussian(), y: rng.gaussian(), z: Math.abs(rng.gaussian()) });
        addBipyramid(opaque, centre.x + d.x * R * 0.75, centre.y + d.y * R * 0.75, centre.z + d.z * H * 0.45, fr, scaleColour(fc, rng.range(0.85, 1.1)), 0.4);
      }
    }
  } else {
    const twig = scaleColour(trunkColour, 0.9);
    addCrossedCards(cutout, x, y, z, R * 1.6, H, rng.range(0, Math.PI), twig, twig, ATLAS_CELLS.twigs, 0.1, 0.5, { normal: UP });
  }
  if (species.flowers && placement.flowering > 0.3) {
    const fc = parseColour(species.flowers.colour, [245, 235, 240]);
    const m = Math.max(1, Math.round((3 + rng.int(4)) * placement.flowering * detail));
    for (let i = 0; i < m; i++) {
      const d = normalize({ x: rng.gaussian(), y: rng.gaussian(), z: Math.abs(rng.gaussian()) + 0.3 });
      const s = R * rng.range(0.25, 0.4);
      addCrossedCards(cutout, centre.x + d.x * R * 0.7, centre.y + d.y * R * 0.7, centre.z + d.z * H * 0.45, s, s, rng.range(0, Math.PI), fc, scaleColour(fc, 1.08), ATLAS_CELLS.flower, 0.4, 0.7, { centred: true, normal: normalize(add(d, UP, 0.8)) });
    }
  }
  return { opaque: opaque.build(), cutout: cutout.build() };
}
