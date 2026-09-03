import { BoundingSphere, Cartesian3, ComponentDatatype, Geometry, GeometryAttribute, Matrix4, PrimitiveType, Transforms } from 'cesium';
import type { LonLat } from '@/data/adapters/features/types';
import { enuOffsetM } from '@/util/geo';

export interface BuildingInput {
  id: string;
  outer: LonLat[];
  holes: LonLat[][];
  /** Ground height (ellipsoid metres) at the footprint. */
  baseM: number;
  heightM: number;
  colour: [number, number, number];
  /** 0..1 window density (0 = blank industrial wall). */
  windows: number;
  seed: number;
}

export interface BuildingMesh { geometry: Geometry; modelMatrix: Matrix4; vertexCount: number }

/** Ear-clipping triangulation of a simple polygon (counter-clockwise), returns index triples. Holes are ignored. */
export function triangulateSimple(ring: [number, number][]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const cross = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  const out: number[] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10_000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = ring[i0], b = ring[i1], c = ring[i2];
      if (cross(a, b, c) <= 1e-9) continue; // reflex or degenerate
      let ear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(ring[j], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      out.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // non-simple polygon: give up on the remainder
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/**
 * Builds one merged building mesh for a tile in a local east-north-up frame anchored at the tile centre. Walls carry
 * texture coordinates in METRES (u along the wall, v up) so the shader can draw window grids without per-instance
 * data; roofs are triangulated with Cesium's PolygonPipeline. Positions are doubles relative to the anchor so the
 * primitive's relative-to-eye encoding keeps millimetre precision (floating-origin per tile).
 */
export function buildBuildingMesh(anchorLat: number, anchorLon: number, anchorHeightM: number, buildings: BuildingInput[]): BuildingMesh | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const sts: number[] = [];
  const colors: number[] = [];
  const params: number[] = []; // seed, roofFlag, windows
  const indices: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: [number, number, number], seed: number, roof: number, windows: number): number => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    sts.push(u, v);
    colors.push(c[0], c[1], c[2], 255);
    params.push(seed, roof, windows);
    return positions.length / 3 - 1;
  };
  for (const b of buildings) {
    const ring = b.outer.slice();
    if (ring.length >= 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    if (ring.length < 3) continue;
    const local = ring.map(([lon, lat]) => { const o = enuOffsetM(anchorLat, anchorLon, lat, lon); return [o.east, o.north] as [number, number]; });
    // Ensure counter-clockwise for outward normals.
    let area = 0;
    for (let i = 0; i < local.length; i++) { const a = local[i], c = local[(i + 1) % local.length]; area += a[0] * c[1] - c[0] * a[1]; }
    if (area < 0) local.reverse();
    const z0 = b.baseM - anchorHeightM;
    const z1 = z0 + b.heightM;
    let u = 0;
    for (let i = 0; i < local.length; i++) {
      const a = local[i], c = local[(i + 1) % local.length];
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const nx = dy / len, ny = -dx / len; // outward for CCW ring
      const i0 = push(a[0], a[1], z0, nx, ny, 0, u, 0, b.colour, b.seed, 0, b.windows);
      const i1 = push(c[0], c[1], z0, nx, ny, 0, u + len, 0, b.colour, b.seed, 0, b.windows);
      const i2 = push(c[0], c[1], z1, nx, ny, 0, u + len, b.heightM, b.colour, b.seed, 0, b.windows);
      const i3 = push(a[0], a[1], z1, nx, ny, 0, u, b.heightM, b.colour, b.seed, 0, b.windows);
      indices.push(i0, i1, i2, i0, i2, i3);
      u += len;
    }
    // Roof — slightly darker colour; courtyards (holes) are covered, which is acceptable at street level.
    const roofColour: [number, number, number] = [b.colour[0] * 0.72, b.colour[1] * 0.72, b.colour[2] * 0.72];
    const tri = triangulateSimple(local);
    if (tri.length >= 3) {
      const base = positions.length / 3;
      for (const p of local) push(p[0], p[1], z1, 0, 0, 1, p[0], p[1], roofColour, b.seed, 1, 0);
      for (let t = 0; t < tri.length; t += 3) indices.push(base + tri[t], base + tri[t + 1], base + tri[t + 2]);
    }
  }
  if (indices.length === 0) return null;
  const anchor = Cartesian3.fromDegrees(anchorLon, anchorLat, anchorHeightM);
  const modelMatrix = Transforms.eastNorthUpToFixedFrame(anchor);
  const pos = new Float64Array(positions);
  const geometry = new Geometry({
    attributes: {
      position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: pos }),
      normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(normals) }),
      st: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(sts) }),
      color: new GeometryAttribute({ componentDatatype: ComponentDatatype.UNSIGNED_BYTE, componentsPerAttribute: 4, normalize: true, values: new Uint8Array(colors) }),
      params: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(params) }),
    } as unknown as ConstructorParameters<typeof Geometry>[0]['attributes'],
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(Array.from(pos), Cartesian3.ZERO, 3),
  });
  return { geometry, modelMatrix, vertexCount: positions.length / 3 };
}
