/**
 * Mesh containers shared by the near-field geometry builders. Everything is expressed in the tile-local ENU frame
 * (metres; x east, y north, z up) and stored in compact typed arrays so a tile's objects can be merged into a handful
 * of Cesium primitives. Pure and Cesium-free so builders run in Node tests and could move to a worker later.
 */
import type { RGB } from './colour';

export interface MeshData {
  /** xyz local metres, 3 per vertex. */
  positions: Float32Array;
  /** Unit normals, 3 per vertex. */
  normals: Float32Array;
  /** RGBA 0..255, 4 per vertex. Alpha carries a shading code (255 plain, 252..254 building facade styles). */
  colors: Uint8Array;
  /** Leaf-atlas UVs (cutout bucket) or window-cell coordinates (building walls); (-1,-1) where unused. 2 per vertex. */
  sts: Float32Array;
  /** Per-vertex wind sway weight 0 (rigid) .. 1 (crown tips, grass blades). */
  wind: Float32Array;
  /** Triangle list. */
  indices: Uint32Array | Uint16Array;
}

/** Geometry split by render bucket: alpha-tested leaf cards vs solid surfaces (which also cast shadows). */
export interface BucketedMesh { opaque: MeshData; cutout: MeshData }

/** Number of vertices in a mesh. */
export function vertexCount(m: MeshData): number {
  return m.positions.length / 3;
}

/** Empty mesh (shared, immutable in practice). */
export function emptyMesh(): MeshData {
  return { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Uint8Array(0), sts: new Float32Array(0), wind: new Float32Array(0), indices: new Uint16Array(0) };
}

function grow<T extends Float32Array | Uint8Array | Uint32Array>(arr: T, needed: number): T {
  if (arr.length >= needed) return arr;
  let n = Math.max(16, arr.length);
  while (n < needed) n *= 2;
  const Ctor = arr.constructor as new (n: number) => T;
  const next = new Ctor(n);
  next.set(arr);
  return next;
}

/** Growable vertex/index accumulator. Vertices are appended with explicit attributes; triangles reference indices. */
export class MeshBuilder {
  private positions: Float32Array;
  private normals: Float32Array;
  private colors: Uint8Array;
  private sts: Float32Array;
  private wind: Float32Array;
  private indices: Uint32Array;
  private nv = 0;
  private ni = 0;

  constructor(vertexCapacity = 256, indexCapacity = 512) {
    this.positions = new Float32Array(vertexCapacity * 3);
    this.normals = new Float32Array(vertexCapacity * 3);
    this.colors = new Uint8Array(vertexCapacity * 4);
    this.sts = new Float32Array(vertexCapacity * 2);
    this.wind = new Float32Array(vertexCapacity);
    this.indices = new Uint32Array(indexCapacity);
  }

  get vertexCount(): number { return this.nv; }
  get indexCount(): number { return this.ni; }

  /** Appends one vertex and returns its index. The normal is normalised (a zero normal becomes +z). */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, colour: RGB, alpha: number, u: number, v: number, wind: number): number {
    const i = this.nv;
    if ((i + 1) * 3 > this.positions.length) {
      this.positions = grow(this.positions, (i + 1) * 3);
      this.normals = grow(this.normals, (i + 1) * 3);
      this.colors = grow(this.colors, (i + 1) * 4);
      this.sts = grow(this.sts, (i + 1) * 2);
      this.wind = grow(this.wind, i + 1);
    }
    let len = Math.hypot(nx, ny, nz);
    if (!(len > 1e-9)) { nx = 0; ny = 0; nz = 1; len = 1; }
    const p = i * 3;
    this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
    this.normals[p] = nx / len; this.normals[p + 1] = ny / len; this.normals[p + 2] = nz / len;
    const c = i * 4;
    this.colors[c] = colour[0]; this.colors[c + 1] = colour[1]; this.colors[c + 2] = colour[2]; this.colors[c + 3] = alpha;
    this.sts[i * 2] = u; this.sts[i * 2 + 1] = v;
    this.wind[i] = wind < 0 ? 0 : wind > 1 ? 1 : wind;
    this.nv = i + 1;
    return i;
  }

  triangle(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.indices.length) this.indices = grow(this.indices, this.ni + 3);
    this.indices[this.ni++] = a; this.indices[this.ni++] = b; this.indices[this.ni++] = c;
  }

  /** Two triangles (a,b,c) and (a,c,d) for a convex quad given in winding order. */
  quad(a: number, b: number, c: number, d: number): void {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }

  /** Appends a whole mesh, optionally translated. */
  append(m: MeshData, dx = 0, dy = 0, dz = 0): void {
    const n = m.positions.length / 3;
    if (n === 0) return;
    const base = this.nv;
    const need = base + n;
    this.positions = grow(this.positions, need * 3);
    this.normals = grow(this.normals, need * 3);
    this.colors = grow(this.colors, need * 4);
    this.sts = grow(this.sts, need * 2);
    this.wind = grow(this.wind, need);
    if (dx === 0 && dy === 0 && dz === 0) this.positions.set(m.positions, base * 3);
    else for (let i = 0; i < n; i++) {
      this.positions[(base + i) * 3] = m.positions[i * 3] + dx;
      this.positions[(base + i) * 3 + 1] = m.positions[i * 3 + 1] + dy;
      this.positions[(base + i) * 3 + 2] = m.positions[i * 3 + 2] + dz;
    }
    this.normals.set(m.normals, base * 3);
    this.colors.set(m.colors, base * 4);
    this.sts.set(m.sts, base * 2);
    this.wind.set(m.wind, base);
    this.nv = need;
    const ic = m.indices.length;
    this.indices = grow(this.indices, this.ni + ic);
    for (let i = 0; i < ic; i++) this.indices[this.ni + i] = m.indices[i] + base;
    this.ni += ic;
  }

  /** Produces trimmed typed arrays; indices become Uint16 when they fit. */
  build(): MeshData {
    const n = this.nv;
    const idx = this.indices.subarray(0, this.ni);
    const indices = n <= 65535 ? Uint16Array.from(idx) : Uint32Array.from(idx);
    return {
      positions: this.positions.slice(0, n * 3),
      normals: this.normals.slice(0, n * 3),
      colors: this.colors.slice(0, n * 4),
      sts: this.sts.slice(0, n * 2),
      wind: this.wind.slice(0, n),
      indices,
    };
  }
}

/** Concatenates meshes into one (index offsets adjusted; Uint16 indices when the total fits). */
export function mergeGeometries(meshes: readonly MeshData[]): MeshData {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.positions.length / 3; ni += m.indices.length; }
  const b = new MeshBuilder(Math.max(1, nv), Math.max(1, ni));
  for (const m of meshes) b.append(m);
  return b.build();
}

/**
 * Greedily packs meshes into chunks of at most `maxVertices` vertices (default 65 535 so each chunk can use 16-bit
 * indices and stays cheap to upload). A single mesh larger than the limit becomes its own chunk.
 */
export function chunkGeometries(meshes: readonly MeshData[], maxVertices = 65535): MeshData[] {
  const chunks: MeshData[] = [];
  let current: MeshData[] = [];
  let count = 0;
  for (const m of meshes) {
    const n = m.positions.length / 3;
    if (n === 0) continue;
    if (count > 0 && count + n > maxVertices) { chunks.push(mergeGeometries(current)); current = []; count = 0; }
    current.push(m);
    count += n;
  }
  if (current.length) chunks.push(mergeGeometries(current));
  return chunks;
}
