/**
 * Walking-surface and wall queries over an `InteriorPlan`, in the building frame. Pure so they are unit-tested.
 *
 * Surfaces: every floor slab covers the usable rectangle; stair flights and landings add sloped/raised surfaces in the
 * stair cores. The walker's ground is the candidate surface nearest to its current height, which lets it follow a
 * ramp continuously and keeps it on the right storey without any explicit floor state.
 */
import { DOOR_HEIGHT_M, RAILING_HEIGHT_M, WALL_THICKNESS_M, pointInRing, stairSurfaceZ } from './grammar';
import type { Door, FloorPlan, InteriorPlan, WallSegment, WindowSpec } from './types';

const inRect = (r: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;

/** True when the point lies inside the laid-out rectangle of the building (with a small tolerance). */
export function insideUsable(plan: InteriorPlan, x: number, y: number, pad = 0.35): boolean {
  return inRect(plan.usable, x, y, pad);
}

/** Every walking-surface height (relative to the ground slab) available at a point. */
export function surfaceCandidates(plan: InteriorPlan, x: number, y: number, out: number[] = []): number[] {
  out.length = 0;
  if (!insideUsable(plan, x, y)) return out;
  for (const f of plan.floors) {
    out.push(f.z);
    for (const st of f.stairs) {
      const z = stairSurfaceZ(st, f.z, plan.floorHeightM, x, y);
      if (z !== null) out.push(z);
    }
  }
  return out;
}

/**
 * Height of the surface nearest to `refZ` at the point, or null outside the building. A stair surface within a step
 * of the walker wins over the slabs so ramps are followed continuously; otherwise the nearest slab (preferring the
 * lower one on ties, so a walker never snaps up to a ceiling-level slab).
 */
export function nearestSurface(plan: InteriorPlan, x: number, y: number, refZ: number): number | null {
  if (!insideUsable(plan, x, y)) return null;
  let bestStair: number | null = null, bestStairD = Infinity;
  let best: number | null = null, bestD = Infinity;
  for (const f of plan.floors) {
    const d = Math.abs(f.z - refZ);
    if (best === null || d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && f.z < best)) { best = f.z; bestD = d; }
    for (const st of f.stairs) {
      const z = stairSurfaceZ(st, f.z, plan.floorHeightM, x, y);
      if (z === null) continue;
      const sd = Math.abs(z - refZ);
      if (sd < bestStairD) { bestStair = z; bestStairD = sd; }
    }
  }
  if (bestStair !== null && bestStairD <= STAIR_SNAP_M) return bestStair;
  if (bestStair !== null && bestStairD < bestD) return bestStair;
  return best;
}

/** How far (m) a stair surface may be from the walker's height and still be preferred over a slab. */
export const STAIR_SNAP_M = 0.6;

/** Index of the floor whose slab is nearest to a height (stair mid-points round to the lower floor until half way). */
export function floorIndexForZ(plan: InteriorPlan, z: number): number {
  let best = 0, bestD = Infinity;
  for (const f of plan.floors) { const d = Math.abs(f.z - z); if (d < bestD) { bestD = d; best = f.index; } }
  return best;
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): { t: number; x: number; y: number } | null {
  const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
  const u = ((cx - ax) * rY - (cy - ay) * rX) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, x: ax + t * rX, y: ay + t * rY };
}

/** Openings (walkable gaps) in a wall: non-decorative doors lying on the wall's line. */
function doorsOnWall(wall: WallSegment, doors: readonly Door[]): Door[] {
  const horizontal = Math.abs(wall.y1 - wall.y0) < 1e-6;
  const out: Door[] = [];
  for (const d of doors) {
    if (d.decorative) continue;
    if (horizontal) { if (d.axis === 'x' && Math.abs(d.y - wall.y0) < 0.05 && d.x >= Math.min(wall.x0, wall.x1) - 0.05 && d.x <= Math.max(wall.x0, wall.x1) + 0.05) out.push(d); }
    else if (d.axis === 'y' && Math.abs(d.x - wall.x0) < 0.05 && d.y >= Math.min(wall.y0, wall.y1) - 0.05 && d.y <= Math.max(wall.y0, wall.y1) + 0.05) out.push(d);
  }
  return out;
}

/** True when a step from→to crosses a wall of the floor outside any door opening. */
export function crossesWall(floor: FloorPlan, fromX: number, fromY: number, toX: number, toY: number): boolean {
  for (const w of floor.walls) {
    const hit = segmentsIntersect(fromX, fromY, toX, toY, w.x0, w.y0, w.x1, w.y1);
    if (!hit) continue;
    const horizontal = Math.abs(w.y1 - w.y0) < 1e-6;
    let open = false;
    for (const d of doorsOnWall(w, floor.doors)) {
      const along = horizontal ? hit.x - d.x : hit.y - d.y;
      if (Math.abs(along) <= d.widthM / 2) { open = true; break; }
    }
    if (!open) return true;
  }
  return false;
}

/**
 * Movement filter: returns the allowed destination (sliding along a blocking wall when possible) or null to block.
 * The walker is treated as a point; walls are 0.2 m thick in the render so a 0.25 m body radius keeps it out of them.
 */
export function filterMove(plan: InteriorPlan, floorIndex: number, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | null {
  const floor = plan.floors[Math.max(0, Math.min(plan.floors.length - 1, floorIndex))];
  if (!floor) return to;
  const radius = 0.25;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return to;
  // Probe slightly beyond the destination so the body never ends up inside a wall.
  const px = to.x + (dx / len) * radius, py = to.y + (dy / len) * radius;
  if (!crossesWall(floor, from.x, from.y, px, py)) return to;
  const slideX = { x: to.x, y: from.y };
  if (Math.abs(dx) > 1e-6 && !crossesWall(floor, from.x, from.y, slideX.x + Math.sign(dx) * radius, slideX.y)) return slideX;
  const slideY = { x: from.x, y: to.y };
  if (Math.abs(dy) > 1e-6 && !crossesWall(floor, from.x, from.y, slideY.x, slideY.y + Math.sign(dy) * radius)) return slideY;
  return null;
}

/** Axis-aligned solid used by the renderer. */
export interface Box { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; kind: 'wall' | 'railing' | 'lintel' | 'sill' }

interface Cut { s0: number; s1: number; z0: number; z1: number; kind: 'door' | 'window' }

/**
 * Splits a floor's walls into render boxes with door and window openings cut out. Heights are relative to the
 * floor's walking surface; full walls reach `wallHeight` (the storey height), railings `RAILING_HEIGHT_M`.
 */
export function wallPieces(floor: FloorPlan, wallHeight: number): Box[] {
  const out: Box[] = [];
  const t = WALL_THICKNESS_M;
  for (const w of floor.walls) {
    const horizontal = Math.abs(w.y1 - w.y0) < 1e-6;
    const a = horizontal ? Math.min(w.x0, w.x1) : Math.min(w.y0, w.y1);
    const b = horizontal ? Math.max(w.x0, w.x1) : Math.max(w.y0, w.y1);
    const fixed = horizontal ? w.y0 : w.x0;
    const h = w.railing ? RAILING_HEIGHT_M : wallHeight;
    const thick = w.railing ? 0.12 : t;
    const cuts: Cut[] = [];
    if (!w.railing) {
      for (const d of floor.doors) {
        const on = horizontal ? d.axis === 'x' && Math.abs(d.y - fixed) < 0.05 : d.axis === 'y' && Math.abs(d.x - fixed) < 0.05;
        if (!on) continue;
        const c = horizontal ? d.x : d.y;
        if (c < a - 0.05 || c > b + 0.05) continue;
        if (d.decorative) continue; // decorative doors are drawn as panels on an uncut wall
        cuts.push({ s0: c - d.widthM / 2, s1: c + d.widthM / 2, z0: 0, z1: Math.min(DOOR_HEIGHT_M, h - 0.15), kind: 'door' });
      }
      for (const win of floor.windows as WindowSpec[]) {
        const on = horizontal ? win.axis === 'x' && Math.abs(win.y - fixed) < 0.05 : win.axis === 'y' && Math.abs(win.x - fixed) < 0.05;
        if (!on) continue;
        const c = horizontal ? win.x : win.y;
        if (c < a - 0.05 || c > b + 0.05) continue;
        cuts.push({ s0: c - win.widthM / 2, s1: c + win.widthM / 2, z0: win.sillM, z1: Math.min(win.headM, h - 0.15), kind: 'window' });
      }
    }
    cuts.sort((p, q) => p.s0 - q.s0);
    const push = (s0: number, s1: number, z0: number, z1: number, kind: Box['kind']) => {
      s0 = Math.max(a, s0); s1 = Math.min(b, s1);
      if (s1 - s0 < 0.02 || z1 - z0 < 0.02) return;
      if (horizontal) out.push({ x0: s0, y0: fixed - thick / 2, x1: s1, y1: fixed + thick / 2, z0, z1, kind });
      else out.push({ x0: fixed - thick / 2, y0: s0, x1: fixed + thick / 2, y1: s1, z0, z1, kind });
    };
    let cursor = a;
    for (const c of cuts) {
      if (c.s0 > cursor) push(cursor, c.s0, 0, h, w.railing ? 'railing' : 'wall');
      const s0 = Math.max(cursor, c.s0), s1 = c.s1;
      if (s1 > s0) {
        if (c.z0 > 0.02) push(s0, s1, 0, c.z0, 'sill');
        if (c.z1 < h - 0.02) push(s0, s1, c.z1, h, 'lintel');
      }
      cursor = Math.max(cursor, c.s1);
    }
    if (cursor < b) push(cursor, b, 0, h, w.railing ? 'railing' : 'wall');
  }
  return out;
}

/** True when some wall box covers the point (x, y, z) — used by tests to prove doors are open and lintels solid. */
export function wallSolidAt(boxes: readonly Box[], x: number, y: number, z: number): boolean {
  for (const b of boxes) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) return true;
  return false;
}

/** True when the point is inside the footprint polygon or within `pad` metres of its boundary. */
export function pointInFootprint(plan: InteriorPlan, x: number, y: number, pad = 0): boolean {
  const ring = plan.footprint;
  if (ring.length >= 3 && pointInRing(ring, x, y)) return true;
  if (pad <= 0) return false;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= pad) return true;
  }
  return false;
}
