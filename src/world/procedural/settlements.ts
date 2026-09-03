/**
 * Procedural settlements for tiles without OSM building data: small villages along seeded lanes and gridded urban
 * blocks. Layouts are entirely synthetic (never a depiction of a real settlement) and deterministic for a given Rng.
 * Footprints are polygons in tile-local metres and never overlap each other.
 */
import type { Rng } from '@/util/hash';
import type { BuildingSpec } from './types';
import { convexPolygonsOverlap, polygonCentroid, rotatedRect, type Point2 } from './placement';

/** Terrain height sampler in local metres (returns base elevation for a footprint centroid). */
export type BaseZSampler = (x: number, y: number) => number;

export interface VillageLayout { buildings: BuildingSpec[]; lanes: Point2[][] }
export interface UrbanLayout { buildings: BuildingSpec[]; streets: Point2[][] }

const VILLAGE_COLOURS = ['#c9b79c', '#b89a78', '#d8c7ad', '#a8836b', '#cbb59a', '#b5a58a', '#d0b48e', '#9c7b62', '#e0d2bd', '#b39b7f'];
const URBAN_COLOURS = ['#b9b6b0', '#c8c2b6', '#9fa1a4', '#d2cbbf', '#aaa59c', '#b5b9be', '#c4bfb2', '#8f9296'];
const GLASS_COLOURS = ['#7f9db5', '#6f8fa8', '#8aa5b8', '#5f7f9a'];
const INDUSTRIAL_COLOURS = ['#9a9aa2', '#a7a9ad', '#8c8f94', '#b0aca4'];

/** Clamp helper. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Rectangle footprint or an L-shaped variant carved from it (both stay inside the rectangle so overlap tests can use the rectangle). */
function houseFootprint(rng: Rng, cx: number, cy: number, hw: number, hh: number, angle: number): { rect: Point2[]; footprint: Point2[] } {
  const rect = rotatedRect(cx, cy, hw, hh, angle);
  if (rng.next() < 0.3 && hw > 4 && hh > 4) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const p = (dx: number, dy: number): Point2 => [cx + dx * c - dy * s, cy + dx * s + dy * c];
    const nx = hw * rng.range(0.35, 0.55);
    const ny = hh * rng.range(0.35, 0.55);
    return { rect, footprint: [p(-hw, -hh), p(hw, -hh), p(hw, hh - ny), p(hw - nx, hh - ny), p(hw - nx, hh), p(-hw, hh)] };
  }
  return { rect, footprint: rect };
}

/**
 * Village with houses along 1–3 seeded lanes around `centre`. Houses use 6–12 m footprints, 3.5–7 m eaves heights,
 * gable roofs and warm earthy colours; none overlap. Returns the lanes too so callers can keep vegetation off them.
 */
export function generateVillageLayout(rng: Rng, centre: Point2, sizeM: number, style: BuildingSpec['style'], baseZ: BaseZSampler): VillageLayout {
  const buildings: BuildingSpec[] = [];
  const rects: Point2[][] = [];
  const lanes: Point2[][] = [];
  const radius = Math.max(40, sizeM / 2);
  const laneHalf = 3;
  const laneCount = 1 + rng.int(3);
  const angle0 = rng.range(0, Math.PI);

  const makeLane = (px: number, py: number, angle: number, len: number): Point2[] => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Clip the lane to the village circle so houses stay within radius + ~25 m.
    const half = Math.min(len / 2, Math.max(15, radius - Math.hypot(px - centre[0], py - centre[1]) - 2));
    const bend = rng.range(-0.08, 0.08);
    const mid: Point2 = [px - s * bend * half, py + c * bend * half];
    return [[px - c * half, py - s * half], mid, [px + c * half, py + s * half]];
  };

  const placeAlongLane = (lane: Point2[]) => {
    for (let seg = 1; seg < lane.length; seg++) {
      const a = lane[seg - 1];
      const b = lane[seg];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / (segLen || 1);
      const uy = (b[1] - a[1]) / (segLen || 1);
      const angle = Math.atan2(uy, ux);
      for (const side of [1, -1]) {
        let t = rng.range(4, 10);
        while (t < segLen - 4) {
          const w = rng.range(6, 12);
          const d = rng.range(6, 12);
          const setback = laneHalf + rng.range(2, 6) + d / 2;
          const cx = a[0] + ux * t - uy * side * setback;
          const cy = a[1] + uy * t + ux * side * setback;
          const { rect, footprint } = houseFootprint(rng, cx, cy, w / 2, d / 2, angle);
          const clear = rects.every((r) => !convexPolygonsOverlap(r, rect, 1.5)) && lanes.every((l) => l === lane || minDistToLane(l, cx, cy) > laneHalf + Math.max(w, d) / 2 + 1);
          if (clear) {
            rects.push(rect);
            buildings.push({ id: `village-${buildings.length}`, footprint, heightM: rng.range(3.5, 7), baseZ: baseZ(cx, cy), style, source: 'procedural', roof: 'gable', colour: rng.pick(VILLAGE_COLOURS) });
          }
          t += w + rng.range(4, 12);
        }
      }
    }
  };

  lanes.push(makeLane(centre[0], centre[1], angle0, radius * 2));
  if (laneCount >= 2) {
    const off = rng.range(-0.3, 0.3) * radius;
    lanes.push(makeLane(centre[0] + Math.cos(angle0) * off, centre[1] + Math.sin(angle0) * off, angle0 + Math.PI / 2 + rng.range(-0.3, 0.3), radius * 1.6));
  }
  if (laneCount >= 3) {
    const side = rng.next() < 0.5 ? 1 : -1;
    const off = Math.min(60, radius * 0.6) * side;
    lanes.push(makeLane(centre[0] - Math.sin(angle0) * off, centre[1] + Math.cos(angle0) * off, angle0 + rng.range(-0.15, 0.15), radius * 1.2));
  }
  for (const lane of lanes) placeAlongLane(lane);
  // Guarantee a minimum village size: add cross lanes until at least six houses exist (bounded attempts).
  for (let attempt = 0; buildings.length < 6 && attempt < 4; attempt++) {
    const lane = makeLane(centre[0] + rng.range(-0.3, 0.3) * radius, centre[1] + rng.range(-0.3, 0.3) * radius, rng.range(0, Math.PI), radius * 1.4);
    lanes.push(lane);
    placeAlongLane(lane);
  }
  // A small communal building (chapel/temple/hall) near the centre in about half of the larger villages.
  if (buildings.length >= 8 && rng.next() < 0.5) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(0.15, 0.5) * radius;
      const cx = centre[0] + Math.cos(ang) * dist;
      const cy = centre[1] + Math.sin(ang) * dist;
      const rect = rotatedRect(cx, cy, 5, 8, angle0 + (rng.next() < 0.5 ? 0 : Math.PI / 2));
      if (rects.every((r) => !convexPolygonsOverlap(r, rect, 2)) && lanes.every((l) => minDistToLane(l, cx, cy) > laneHalf + 9)) {
        rects.push(rect);
        buildings.push({ id: `village-${buildings.length}`, footprint: rect, heightM: 9, baseZ: baseZ(cx, cy), style: 'religious', source: 'procedural', roof: 'gable', colour: '#d9d2c4' });
        break;
      }
    }
  }
  return { buildings, lanes };
}

function minDistToLane(lane: Point2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < lane.length; i++) {
    const ax = lane[i - 1][0];
    const ay = lane[i - 1][1];
    const dx = lane[i][0] - ax;
    const dy = lane[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = clamp(l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** Village houses only (see generateVillageLayout for lanes). */
export function generateVillage(rng: Rng, centre: Point2, sizeM: number, style: BuildingSpec['style'], baseZ: BaseZSampler): BuildingSpec[] {
  return generateVillageLayout(rng, centre, sizeM, style, baseZ).buildings;
}

/**
 * Gridded urban blocks over a `tileSizeM` square centred on the origin with 12–20 m street gaps. Building heights are
 * lognormal around a base that rises from ~8 m (suburban, density 0.5) to ~40 m (dense urban, density 1); above
 * density 0.8 a few 60–150 m towers appear. Flat roofs, grey/beige/glass colours; footprints never overlap.
 */
export function generateUrbanLayout(rng: Rng, tileSizeM: number, density: number, baseZ: BaseZSampler): UrbanLayout {
  const buildings: BuildingSpec[] = [];
  const streets: Point2[][] = [];
  const half = tileSizeM / 2;
  const d = clamp(density, 0, 1);
  const urbanity = clamp((d - 0.5) / 0.5, 0, 1);
  const style: BuildingSpec['style'] = d > 0.7 ? 'urban' : 'suburban';
  const baseHeight = 8 + 32 * urbanity;
  const maxBuildings = 420;
  const blockW = rng.range(70, 110);
  const blockH = rng.range(60, 100);

  const spans = (size: number, extent: number): [number, number][] => {
    const out: [number, number][] = [];
    let start = -half + rng.range(6, 10);
    while (start < half - 25) {
      const end = Math.min(half - 6, start + size * rng.range(0.85, 1.15));
      if (end - start > 25) out.push([start, end]);
      const gap = rng.range(12, 20);
      if (out.length > 0) streets.push(extent === 0 ? [[end + gap / 2, -half], [end + gap / 2, half]] : [[-half, end + gap / 2], [half, end + gap / 2]]);
      start = end + gap;
    }
    return out;
  };
  const cols = spans(blockW, 0);
  const rows = spans(blockH, 1);

  let towersLeft = d > 0.8 ? 2 + rng.int(4) : 0;
  const push = (footprint: Point2[], heightM: number, s: BuildingSpec['style'], colour: string) => {
    if (buildings.length >= maxBuildings) return;
    const c = polygonCentroid(footprint);
    buildings.push({ id: `urban-${buildings.length}`, footprint, heightM, baseZ: baseZ(c[0], c[1]), style: s, source: 'procedural', roof: 'flat', colour });
  };

  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      const bw = x1 - x0;
      const bh = y1 - y0;
      const roll = rng.next();
      if (roll < 0.06) continue; // open block: park / lot
      if (roll < 0.14) {
        // Industrial block: one or two large low sheds separated along the long axis.
        const n = 1 + rng.int(2);
        const along = bw >= bh;
        for (let i = 0; i < n; i++) {
          const inset = rng.range(3, 6);
          const gap = 6;
          const ax0 = along ? x0 + inset + (i * (bw - 2 * inset + gap)) / n : x0 + inset;
          const ax1 = along ? ax0 + (bw - 2 * inset - gap * (n - 1)) / n : x1 - inset;
          const ay0 = along ? y0 + inset : y0 + inset + (i * (bh - 2 * inset + gap)) / n;
          const ay1 = along ? y1 - inset : ay0 + (bh - 2 * inset - gap * (n - 1)) / n;
          if (ax1 - ax0 < 8 || ay1 - ay0 < 8) continue;
          push([[ax0, ay0], [ax1, ay0], [ax1, ay1], [ax0, ay1]], rng.range(6, 12), 'industrial', rng.pick(INDUSTRIAL_COLOURS));
        }
        continue;
      }
      const lotW = rng.range(16, 30);
      const lotD = rng.range(14, 26);
      const nx = Math.max(1, Math.floor(bw / lotW));
      const ny = Math.max(1, Math.floor(bh / lotD));
      const cw = bw / nx;
      const ch = bh / ny;
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const perimeter = ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1;
          const occupancy = perimeter ? 0.55 + 0.45 * d : 0.3;
          if (rng.next() > occupancy) continue;
          const g = rng.range(1, 3);
          const lx0 = x0 + ix * cw + g;
          const lx1 = x0 + (ix + 1) * cw - g;
          const ly0 = y0 + iy * ch + g;
          const ly1 = y0 + (iy + 1) * ch - g;
          if (lx1 - lx0 < 5 || ly1 - ly0 < 5) continue;
          if (towersLeft > 0 && rng.next() < 0.08) {
            towersLeft--;
            const tx0 = lx0 + 2;
            const tx1 = lx1 - 2;
            const ty0 = ly0 + 2;
            const ty1 = ly1 - 2;
            push([[tx0, ty0], [tx1, ty0], [tx1, ty1], [tx0, ty1]], rng.range(60, 150), 'tower', rng.pick(GLASS_COLOURS));
            continue;
          }
          const h = clamp(baseHeight * Math.exp(0.35 * rng.gaussian()), 4, 60);
          const glass = urbanity > 0.6 && rng.next() < 0.25;
          push([[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]], h, style, glass ? rng.pick(GLASS_COLOURS) : rng.pick(URBAN_COLOURS));
        }
      }
    }
  }
  return { buildings, streets };
}

/** Urban buildings only (see generateUrbanLayout for the street grid). */
export function generateUrbanBlocks(rng: Rng, tileSizeM: number, density: number, baseZ: BaseZSampler): BuildingSpec[] {
  return generateUrbanLayout(rng, tileSizeM, density, baseZ).buildings;
}
