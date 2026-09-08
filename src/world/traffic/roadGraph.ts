import type { RoadKind } from '@/data/adapters/features/types';
import { haversineM, METRES_PER_DEGREE_LAT, metresPerDegreeLon } from '@/util/geo';

/**
 * Pure road-network helpers shared by ambient traffic and pedestrians: polyline roads with cumulative lengths, shared
 * end/intermediate nodes (intersections), lane offsets and positions along a road. No Cesium types, unit-tested.
 */
export interface RoadPoint { lon: number; lat: number; h: number | null }

export interface GraphRoad {
  id: string;
  kind: RoadKind;
  pts: RoadPoint[];
  /** Cumulative distance (m) at each vertex. */
  cum: number[];
  length: number;
  tile: string;
  widthM: number;
  lanes: number | null;
  oneway: boolean;
  /** Node key per vertex (null where the vertex is not shared with another road). */
  nodes: (string | null)[];
  /** Unit travel direction per segment (east, north) in metres, for lane offsets and headings. */
  segDir: { e: number; n: number }[];
}

export interface GraphNode {
  key: string;
  lat: number;
  lon: number;
  arms: { road: GraphRoad; index: number }[];
  /** Signal-controlled junction (three or more arms, at least one classified road). */
  signal: boolean;
  /** Phase offset (seconds) so junctions are not synchronised. */
  offsetS: number;
}

const SIGNAL_KINDS = new Set<RoadKind>(['primary', 'secondary', 'tertiary', 'trunk']);

export function nodeKey(lat: number, lon: number): string {
  return `${Math.round(lat * 1e5)}:${Math.round(lon * 1e5)}`;
}

/**
 * Inserts vertices where road polylines cross each other without sharing a node, so at-grade crossings become
 * junctions (bridges/tunnels are filtered out before calling). Bounded work: skipped for very large inputs.
 */
export function insertCrossings(roads: { coords: [number, number][] }[], maxRoads = 160): void {
  if (roads.length > maxRoads) return;
  const eps = 1e-9;
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    const A = roads[a].coords, B = roads[b].coords;
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) {
      const [x1, y1] = A[i], [x2, y2] = A[i + 1], [x3, y3] = B[j], [x4, y4] = B[j + 1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-18) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) continue;
      const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1);
      const pt: [number, number] = [Math.round(px * 1e7) / 1e7, Math.round(py * 1e7) / 1e7];
      A.splice(i + 1, 0, pt);
      B.splice(j + 1, 0, [pt[0], pt[1]]);
      i++; // skip the segment we just created
      break;
    }
  }
}

/** True when any segment of the road passes within radiusM of the point (flat-earth metres). */
export function roadNearPoint(road: GraphRoad, lat: number, lon: number, radiusM: number): boolean {
  const mLat = METRES_PER_DEGREE_LAT, mLon = metresPerDegreeLon(lat);
  for (let i = 1; i < road.pts.length; i++) {
    const ax = (road.pts[i - 1].lon - lon) * mLon, ay = (road.pts[i - 1].lat - lat) * mLat;
    const bx = (road.pts[i].lon - lon) * mLon, by = (road.pts[i].lat - lat) * mLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    if (Math.hypot(ax + dx * t, ay + dy * t) <= radiusM) return true;
  }
  return false;
}

/** Builds a GraphRoad from lon/lat coordinates (no node information yet — see `connectRoads`). */
export function makeGraphRoad(id: string, kind: RoadKind, coords: [number, number][], tile: string, widthM: number, lanes: number | null, oneway: boolean): GraphRoad {
  const pts: RoadPoint[] = coords.map(([lon, lat]) => ({ lon, lat, h: null }));
  const cum = [0];
  const segDir: { e: number; n: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = haversineM(a.lat, a.lon, b.lat, b.lon);
    cum.push(cum[i - 1] + d);
    const e = (b.lon - a.lon) * metresPerDegreeLon(a.lat);
    const n = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
    const len = Math.hypot(e, n) || 1;
    segDir.push({ e: e / len, n: n / len });
  }
  return { id, kind, pts, cum, length: cum[cum.length - 1], tile, widthM, lanes, oneway, nodes: pts.map(() => null), segDir };
}

/**
 * Registers a set of roads into the node map: every vertex shared by two or more roads (within ~1 m) becomes a node.
 * Roads whose end vertices touch another road's vertex are connected so traffic can flow through junctions.
 */
export function connectRoads(roads: GraphRoad[], nodes: Map<string, GraphNode>): void {
  const seen = new Map<string, { road: GraphRoad; index: number }[]>();
  for (const r of roads) r.pts.forEach((p, i) => { const k = nodeKey(p.lat, p.lon); const l = seen.get(k) ?? []; l.push({ road: r, index: i }); seen.set(k, l); });
  for (const [k, arms] of seen) {
    const existing = nodes.get(k);
    const distinctRoads = new Set([...(existing?.arms ?? []), ...arms].map((a) => a.road.id));
    if (distinctRoads.size < 2) continue;
    const node: GraphNode = existing ?? { key: k, lat: arms[0].road.pts[arms[0].index].lat, lon: arms[0].road.pts[arms[0].index].lon, arms: [], signal: false, offsetS: (hashKey(k) % 24) };
    for (const a of arms) if (!node.arms.some((x) => x.road === a.road && x.index === a.index)) node.arms.push(a);
    node.signal = node.arms.length >= 3 && node.arms.some((a) => SIGNAL_KINDS.has(a.road.kind));
    for (const a of node.arms) a.road.nodes[a.index] = k;
    nodes.set(k, node);
  }
}

/** Removes a tile's roads from the node map (arms of other tiles stay). */
export function disconnectRoads(tile: string, nodes: Map<string, GraphNode>): void {
  for (const [k, node] of nodes) {
    node.arms = node.arms.filter((a) => a.road.tile !== tile);
    const distinct = new Set(node.arms.map((a) => a.road.id));
    if (distinct.size < 2) {
      // A junction needs two roads; a lone remaining arm is an ordinary vertex again.
      for (const a of node.arms) a.road.nodes[a.index] = null;
      nodes.delete(k);
    } else node.signal = node.arms.length >= 3 && node.arms.some((a) => SIGNAL_KINDS.has(a.road.kind));
  }
}

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Segment index for a distance along the road (1..pts.length-1). */
export function segmentAt(road: GraphRoad, t: number): number {
  let i = 1;
  while (i < road.cum.length - 1 && road.cum[i] < t) i++;
  return i;
}

/**
 * Lon/lat/height along a road, offset `leftM` metres to the left of the direction of travel (dir = +1 along the way,
 * -1 against it). Heights come from the sampler (cached per vertex).
 */
export function roadPosition(road: GraphRoad, t: number, dir: 1 | -1, leftM: number, sampleH: (p: RoadPoint) => number, out: { lon: number; lat: number; h: number; headingDeg: number }): typeof out {
  const i = segmentAt(road, t);
  const a = road.pts[i - 1], b = road.pts[i];
  const seg = Math.max(0.01, road.cum[i] - road.cum[i - 1]);
  const f = Math.max(0, Math.min(1, (t - road.cum[i - 1]) / seg));
  const ha = sampleH(a), hb = sampleH(b);
  const d = road.segDir[i - 1];
  const te = d.e * dir, tn = d.n * dir;
  // Left of travel = (-north, east).
  const offE = -tn * leftM, offN = te * leftM;
  const lat = a.lat + (b.lat - a.lat) * f;
  out.lat = lat + offN / METRES_PER_DEGREE_LAT;
  out.lon = a.lon + (b.lon - a.lon) * f + offE / metresPerDegreeLon(lat);
  out.h = ha + (hb - ha) * f;
  out.headingDeg = ((Math.atan2(te, tn) * 180) / Math.PI + 360) % 360;
  return out;
}

/** Next shared node ahead of `t` in the travel direction, with the distance to it, or null. */
export function nextNodeAhead(road: GraphRoad, t: number, dir: 1 | -1, maxM: number): { key: string; index: number; distM: number } | null {
  if (dir === 1) {
    for (let i = segmentAt(road, t); i < road.pts.length; i++) {
      const d = road.cum[i] - t;
      if (d > maxM) return null;
      if (road.nodes[i] && d >= 0) return { key: road.nodes[i]!, index: i, distM: d };
    }
  } else {
    for (let i = segmentAt(road, t) - 1; i >= 0; i--) {
      const d = t - road.cum[i];
      if (d > maxM) return null;
      if (road.nodes[i] && d >= 0) return { key: road.nodes[i]!, index: i, distM: d };
    }
  }
  return null;
}

/**
 * Chooses the road to continue on when reaching `node` from `from`: another arm of the junction, entered in the
 * direction that leads away from the node (one-way roads only in their forward direction). Returns null to u-turn.
 */
export function pickTurn(node: GraphNode, from: GraphRoad, rnd: number): { road: GraphRoad; t: number; dir: 1 | -1 } | null {
  const options: { road: GraphRoad; t: number; dir: 1 | -1 }[] = [];
  for (const a of node.arms) {
    if (a.road === from) continue;
    const r = a.road;
    if (a.index < r.pts.length - 1) options.push({ road: r, t: r.cum[a.index], dir: 1 });
    if (a.index > 0 && !r.oneway) options.push({ road: r, t: r.cum[a.index], dir: -1 });
  }
  if (options.length === 0) return null;
  return options[Math.min(options.length - 1, Math.floor(rnd * options.length))];
}

// ---------------------------------------------------------------------------------------------------------------------
// Ambient traffic helpers


/** Traffic density multiplier by local hour and place size (population of the nearest place node, or null). */
export function trafficDensity(localHour: number, population: number | null): number {
  const h = ((localHour % 24) + 24) % 24;
  const time = h < 5 ? 0.25 : h < 7 ? 0.6 : h < 11 ? 1.35 : h < 17 ? 1.0 : h < 21 ? 1.4 : h < 23 ? 0.7 : 0.4;
  const place = population === null ? 0.75 : population > 1_000_000 ? 1.3 : population > 100_000 ? 1.1 : population > 10_000 ? 0.9 : 0.6;
  return Math.min(1.6, time * place);
}

/**
 * Two-phase signal cycle: approaches heading roughly north/south are green in phase A, east/west in phase B, with an
 * all-red clearance between them. Returns true when an approach with the given heading may proceed.
 */
export function signalGreen(nowS: number, offsetS: number, approachHeadingDeg: number, cycleS = 24, clearanceS = 2): boolean {
  const t = (((nowS + offsetS) % cycleS) + cycleS) % cycleS;
  const half = cycleS / 2;
  const northSouth = Math.abs(Math.cos((approachHeadingDeg * Math.PI) / 180)) >= Math.SQRT1_2;
  if (t < half) return northSouth && t < half - clearanceS;
  return !northSouth && t < cycleS - clearanceS;
}

/** Lateral lane offset (metres, positive = left of travel) for left-hand traffic (India). */
export function laneOffsetM(widthM: number, lanes: number | null, oneway: boolean, laneIndex = 0): number {
  const n = Math.max(1, lanes ?? (oneway ? 1 : 2));
  const laneW = Math.max(2.4, Math.min(3.6, widthM / n));
  if (oneway) return ((n - 1) / 2 - laneIndex) * laneW;
  // Two-way: use the left half of the carriageway.
  return laneW * 0.5 + laneIndex * laneW;
}
