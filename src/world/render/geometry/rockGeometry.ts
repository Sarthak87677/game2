/**
 * Rocks and boulders: an icosphere displaced radially by seeded fbm noise, flattened and sunk into the ground, with
 * grey/brown colour variation and optional moss on upward faces. Opaque bucket, no wind.
 */
import { fbm2, Rng } from '@/util/hash';
import type { Placement, Species } from '@/world/procedural/types';
import { MeshBuilder, type MeshData } from './mesh';
import { recomputeNormals, type Vec3 } from './shapes';
import { mixColour, scaleColour, type RGB } from './colour';
import { clamp, nominalHeight, placementSeed } from './common';

export interface RockOptions { detail?: number }

function icosphere(subdivisions: number): { verts: Vec3[]; faces: number[] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Vec3[] = [
    { x: -1, y: t, z: 0 }, { x: 1, y: t, z: 0 }, { x: -1, y: -t, z: 0 }, { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t }, { x: 0, y: 1, z: t }, { x: 0, y: -1, z: -t }, { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 }, { x: t, y: 0, z: 1 }, { x: -t, y: 0, z: -1 }, { x: -t, y: 0, z: 1 },
  ].map((v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; });
  let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a], vb = verts[b];
      const m = { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, z: (va.z + vb.z) / 2 };
      const l = Math.hypot(m.x, m.y, m.z);
      verts.push({ x: m.x / l, y: m.y / l, z: m.z / l });
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next: number[] = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  return { verts, faces };
}

const GREY: RGB = [122, 120, 114];
const BROWN: RGB = [128, 108, 86];
const MOSS: RGB = [96, 124, 72];

/** Builds one rock (opaque bucket) in absolute local metres; identical output for identical species/placement. */
export function buildRock(species: Species, placement: Placement, opts: RockOptions = {}): MeshData {
  const detail = clamp(opts.detail ?? 1, 0.2, 1);
  const seedInt = placementSeed(species, placement, 'rock');
  const rng = new Rng(seedInt);
  const seedF = clamp(placement.variant, 0, 1);
  const size = nominalHeight(species, placement);
  const R = Math.max(0.08, size * 0.6);
  const sx = rng.range(0.85, 1.3), sy = rng.range(0.85, 1.3), sz = rng.range(0.55, 0.8);
  const mossiness = rng.next() < 0.5 ? rng.range(0.2, 0.7) : 0;
  const { verts, faces } = icosphere(R > 1.2 && detail > 0.5 ? 2 : 1);
  const b = new MeshBuilder(verts.length, faces.length);
  for (const d of verts) {
    const f = fbm2(d.x * 1.8 + seedF * 4.1, d.y * 1.8 + d.z * 1.4 + seedF * 6.3, 3, seedInt);
    const r = R * (0.72 + 0.55 * f);
    const tone = fbm2(d.x * 3 + 7 + seedF, d.y * 3 + d.z * 2, 2, seedInt);
    let colour = scaleColour(mixColour(GREY, BROWN, tone), 0.8 + 0.4 * fbm2(d.x * 7 + seedF * 2, d.y * 7 + d.z * 5, 3, seedInt));
    if (d.z > 0.5 && mossiness > 0) colour = mixColour(colour, MOSS, (d.z - 0.5) * 2 * mossiness);
    b.vertex(placement.x + d.x * r * sx, placement.y + d.y * r * sy, placement.z + d.z * r * sz - R * sz * 0.35, d.x, d.y, d.z, colour, 255, -1, -1, 0);
  }
  for (let i = 0; i < faces.length; i += 3) b.triangle(faces[i], faces[i + 1], faces[i + 2]);
  const mesh = b.build();
  recomputeNormals(mesh.positions, mesh.indices, mesh.normals);
  return mesh;
}
