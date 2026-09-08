/**
 * Walkable network for pedestrians, derived from loaded OpenStreetMap roads (footways, residential streets and
 * larger roads; never motorways, trunks or railways). Pedestrians follow a polyline offset to one side (a virtual
 * pavement) so they keep out of the simulated traffic on the carriageway. Pure geometry — no Cesium.
 */
import type { FeatureTile, RoadKind } from '@/data/adapters/features/types';
import { haversineM, metresPerDegreeLon, METRES_PER_DEGREE_LAT } from '@/util/geo';

const WALKABLE: Partial<Record<RoadKind, number>> = { pedestrian: 3, path: 2.5, residential: 2, service: 1, tertiary: 1.2, secondary: 1, primary: 0.8, track: 0.5, other: 0.5 };

export interface WalkSegment {
  id: string;
  kind: RoadKind;
  pts: { lat: number; lon: number }[];
  cum: number[];
  length: number;
  /** Carriageway width (m); pedestrians walk at half width + margin. */
  widthM: number;
  tile: string;
  bbox: { south: number; west: number; north: number; east: number };
  /** Pedestrian pavement offset from the centreline (m). */
  pavementM: number;
  weight: number;
}

export interface LatLon { lat: number; lon: number }

export class WalkNetwork {
  readonly segments: WalkSegment[] = [];
  private byTile = new Map<string, WalkSegment[]>();
  private endpointGrid = new Map<string, WalkSegment[]>();

  /** Adds/removes tiles so the network matches the loaded set. */
  sync(tiles: FeatureTile[]): void {
    const present = new Set(tiles.map((t) => t.key));
    let changed = false;
    for (const key of [...this.byTile.keys()]) if (!present.has(key)) { this.byTile.delete(key); changed = true; }
    for (const t of tiles) {
      if (this.byTile.has(t.key)) continue;
      const list: WalkSegment[] = [];
      for (const r of t.roads) {
        const w = WALKABLE[r.kind];
        if (!w || r.coords.length < 2 || r.tunnel || r.bridge) continue;
        const pts = r.coords.map(([lon, lat]) => ({ lat, lon }));
        const cum = [0];
        let south = 90, north = -90, west = 180, east = -180;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          south = Math.min(south, p.lat); north = Math.max(north, p.lat); west = Math.min(west, p.lon); east = Math.max(east, p.lon);
          if (i > 0) cum.push(cum[i - 1] + haversineM(pts[i - 1].lat, pts[i - 1].lon, p.lat, p.lon));
        }
        const length = cum[cum.length - 1];
        if (length < 8) continue;
        const pavementM = r.kind === 'pedestrian' || r.kind === 'path' || r.kind === 'track' ? 0 : r.widthM / 2 + 1.2;
        list.push({ id: r.id, kind: r.kind, pts, cum, length, widthM: r.widthM, tile: t.key, bbox: { south, west, north, east }, pavementM, weight: w });
      }
      this.byTile.set(t.key, list);
      changed = true;
    }
    if (changed) this.rebuild();
  }

  private rebuild(): void {
    this.segments.length = 0;
    this.endpointGrid.clear();
    for (const list of this.byTile.values()) for (const s of list) {
      this.segments.push(s);
      this.addEndpoint(s, s.pts[0]);
      this.addEndpoint(s, s.pts[s.pts.length - 1]);
    }
  }

  private cellKey(p: LatLon): string { return `${Math.round(p.lat * 4000)}:${Math.round(p.lon * 4000)}`; }

  private addEndpoint(s: WalkSegment, p: LatLon): void {
    const k = this.cellKey(p);
    const list = this.endpointGrid.get(k);
    if (list) { if (!list.includes(s)) list.push(s); } else this.endpointGrid.set(k, [s]);
  }

  /** Segments whose bounding box comes within `radiusM` of the point. */
  nearby(lat: number, lon: number, radiusM: number, out: WalkSegment[] = []): WalkSegment[] {
    out.length = 0;
    const dLat = radiusM / METRES_PER_DEGREE_LAT;
    const dLon = radiusM / metresPerDegreeLon(lat);
    for (const s of this.segments) {
      const b = s.bbox;
      if (b.south > lat + dLat || b.north < lat - dLat || b.west > lon + dLon || b.east < lon - dLon) continue;
      out.push(s);
    }
    return out;
  }

  /** Position along a segment at arc length `t`, offset `side` (±1) onto the pavement. Writes into `out`. */
  positionAt(s: WalkSegment, t: number, side: number, out: LatLon): LatLon {
    let i = 1;
    while (i < s.cum.length - 1 && s.cum[i] < t) i++;
    const a = s.pts[i - 1], b = s.pts[i];
    const seg = Math.max(0.01, s.cum[i] - s.cum[i - 1]);
    const f = Math.max(0, Math.min(1, (t - s.cum[i - 1]) / seg));
    const lat = a.lat + (b.lat - a.lat) * f;
    const lon = a.lon + (b.lon - a.lon) * f;
    if (s.pavementM === 0 || side === 0) { out.lat = lat; out.lon = lon; return out; }
    // Perpendicular offset in metres → degrees.
    const mLon = metresPerDegreeLon(lat);
    const ex = (b.lon - a.lon) * mLon, ny = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
    const len = Math.hypot(ex, ny) || 1;
    const px = -ny / len, py = ex / len;
    out.lat = lat + (py * s.pavementM * side) / METRES_PER_DEGREE_LAT;
    out.lon = lon + (px * s.pavementM * side) / mLon;
    return out;
  }

  /** Segments sharing an endpoint cell with the given end of `s` (excluding `s`). */
  neighbours(s: WalkSegment, atEnd: boolean, out: WalkSegment[] = []): WalkSegment[] {
    out.length = 0;
    const p = atEnd ? s.pts[s.pts.length - 1] : s.pts[0];
    const list = this.endpointGrid.get(this.cellKey(p));
    if (list) for (const o of list) if (o !== s) out.push(o);
    return out;
  }

  /** Whether the given end of `o` touches point `p` (within ~30 m). */
  static startsAt(o: WalkSegment, p: LatLon): boolean {
    const a = o.pts[0];
    return haversineM(a.lat, a.lon, p.lat, p.lon) < 30;
  }

  get tileCount(): number { return this.byTile.size; }
}
