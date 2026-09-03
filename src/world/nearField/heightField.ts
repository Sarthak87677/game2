import { Resource } from 'cesium';
import { sharedTerrariumDecoder } from '@/data/adapters/terrain/terrariumDecoder';
import { TERRARIUM_DEFAULT_URL } from '@/data/adapters/terrain';
import type { TileCache } from '@/data/cache/tileCache';
import { tileBounds } from '@/util/geo';
import type { HeightField } from '@/world/procedural/types';

export interface HeightFieldSourceOptions { url?: string; cache?: TileCache; sourceZoom?: number }

/**
 * Builds height fields for near-field generation tiles from Terrarium PNGs. The source tile at `sourceZoom` (≤ 15)
 * is decoded once (shared worker pool, IndexedDB cache) and the requested tile's quadrant is sliced out, so a z16 tile
 * yields a 128×128 grid (~4.8 m at the equator). Missing tiles resolve to null (generation then assumes flat ground).
 */
export class HeightFieldSource {
  private readonly url: string;
  private readonly cache?: TileCache;
  private readonly sourceZoom: number;
  private decoded = new Map<string, Promise<Float32Array | null>>();

  constructor(opts: HeightFieldSourceOptions = {}) {
    this.url = opts.url ?? TERRARIUM_DEFAULT_URL;
    this.cache = opts.cache;
    this.sourceZoom = Math.min(15, opts.sourceZoom ?? 15);
  }

  private async fetchSource(z: number, x: number, y: number): Promise<Float32Array | null> {
    const key = `${z}/${x}/${y}`;
    let p = this.decoded.get(key);
    if (!p) {
      p = (async () => {
        try {
          const cacheKey = `terrarium/${z}/${x}/${y}`;
          let buf: ArrayBuffer | null = null;
          const hit = this.cache ? await this.cache.get(cacheKey) : null;
          if (hit instanceof ArrayBuffer) buf = hit.slice(0);
          else {
            const res = new Resource({ url: this.url, templateValues: { z: String(z), x: String(x), y: String(y) } });
            const fetched = await res.fetchArrayBuffer();
            if (!fetched) return null;
            buf = fetched;
            if (this.cache) void this.cache.put(cacheKey, buf.slice(0));
          }
          const { heights } = await sharedTerrariumDecoder().decode(buf, 256, 256);
          return heights;
        } catch {
          return null;
        }
      })();
      this.decoded.set(key, p);
      if (this.decoded.size > 48) {
        const first = this.decoded.keys().next().value;
        if (first !== undefined) this.decoded.delete(first);
      }
    }
    return p;
  }

  /** Height field for a slippy tile at zoom z ≥ sourceZoom (a quadrant slice of the source tile). */
  async forTile(z: number, x: number, y: number): Promise<HeightField | null> {
    const dz = z - this.sourceZoom;
    if (dz < 0) return null;
    const sx = x >> dz, sy = y >> dz;
    const src = await this.fetchSource(this.sourceZoom, sx, sy);
    if (!src) return null;
    const n = 256 >> dz; // samples per side for the sub-tile
    const ox = (x - (sx << dz)) * n;
    const oy = (y - (sy << dz)) * n;
    // Include one extra sample on the east/south edge when available for seamless interpolation.
    const w = Math.min(n + 1, 256 - ox);
    const h = Math.min(n + 1, 256 - oy);
    const heights = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) heights[j * w + i] = src[(oy + j) * 256 + ox + i];
    const b = tileBounds(x, y, z);
    const full = tileBounds(sx, sy, this.sourceZoom);
    // Geographic extent of the sampled window (pixel centres → edges of the window).
    const east = full.west + ((ox + w) / 256) * (full.east - full.west);
    const south = full.north - ((oy + h) / 256) * (full.north - full.south);
    return { width: w, height: h, heights, west: b.west, north: b.north, east, south };
  }
}
