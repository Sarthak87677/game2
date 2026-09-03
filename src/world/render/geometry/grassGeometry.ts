/**
 * Grass, reed and wildflower clumps: 3-5 crossed thin blade cards per clump with wind weight 0 at the root and 1 at
 * the tip, optional flower heads when the placement is flowering.
 */
import type { Placement, Species } from '@/world/procedural/types';
import { MeshBuilder, type MeshData } from './mesh';
import { addCard, addCrossedCards, normalize } from './shapes';
import { parseColour, scaleColour } from './colour';
import { ATLAS_CELLS } from '../leafAtlas';
import { leafBaseColour, nominalHeight, placementRng } from './common';

/** Builds one grass/reed/flower clump (cutout bucket) in absolute local metres. */
export function buildGrass(species: Species, placement: Placement): MeshData {
  const rng = placementRng(species, placement, 'grass');
  const b = new MeshBuilder(32, 48);
  const reed = species.kind === 'reed';
  const H = Math.max(0.1, nominalHeight(species, placement));
  const n = 3 + rng.int(3);
  const w = H * (reed ? 0.08 : 0.18);
  const leafBase = leafBaseColour(species, placement, [176, 158, 92]);
  const cell = ATLAS_CELLS.grass;
  const x = placement.x, y = placement.y, z = placement.z;
  let tallest = { x, y, h: H, rot: 0 };
  for (let k = 0; k < n; k++) {
    const rot = (k / n) * Math.PI + rng.range(-0.2, 0.2);
    const lean = { x: rng.gaussian() * H * 0.12, y: rng.gaussian() * H * 0.12 };
    const hk = H * rng.range(0.8, 1.15);
    const px = x + rng.range(-0.06, 0.06) * H, py = y + rng.range(-0.06, 0.06) * H;
    const shade = rng.range(0.9, 1.1);
    addCard(b, px, py, z, w, hk, rot, scaleColour(leafBase, 0.55), scaleColour(leafBase, 1.05 * shade), cell, 0, 1, { lean, flipU: rng.next() < 0.5, normal: normalize({ x: -Math.sin(rot) * 0.4, y: Math.cos(rot) * 0.4, z: 0.9 }) });
    if (hk > tallest.h || k === 0) tallest = { x: px + lean.x, y: py + lean.y, h: hk, rot };
  }
  const flowering = species.flowers && placement.flowering > 0.3;
  if (flowering) {
    const fc = parseColour(species.flowers!.colour, [240, 230, 120]);
    const m = 1 + rng.int(3);
    for (let i = 0; i < m; i++) {
      const s = H * rng.range(0.22, 0.35);
      addCrossedCards(b, tallest.x + rng.range(-0.1, 0.1) * H, tallest.y + rng.range(-0.1, 0.1) * H, z + tallest.h * rng.range(0.75, 0.95), s, s, tallest.rot + rng.range(0, Math.PI), fc, scaleColour(fc, 1.08), ATLAS_CELLS.flower, 0.85, 1, { centred: true, normal: { x: 0, y: 0, z: 1 } });
    }
  }
  return b.build();
}
