/**
 * Procedural interior grammar. Given a building footprint, height and category it produces a deterministic
 * `InteriorPlan`: floors with rooms along a corridor (or one hall), a switchback stair core, an optional elevator
 * shaft, doors (each linking two spaces or marked decorative), windows, furniture blocks and ceiling lights, plus a
 * railed roof terrace. Hero buildings pass a handcrafted room programme instead of random rooms.
 *
 * Pure TypeScript, no Cesium: runs in Node unit tests and could move to a worker. Everything it makes is fictional.
 */
import { fnv1a, mixSeed, Rng } from '@/util/hash';
import { enuOffsetM } from '@/util/geo';
import { INTERIOR_VOCABULARY, type CategoryVocabulary, type FurnitureTemplate, type RoomTypeSpec } from '@/data/maharashtra/interiorGrammar';
import type { Corridor, Door, Elevator, FloorPlan, Furniture, HeroFloorSpec, HeroLayoutSpec, InteriorPlan, InteriorRequest, Light, Rect, Room, RoomKind, Stair, WallSegment, WindowSpec } from './types';

export type { InteriorPlan, InteriorRequest, FloorPlan, Room, Door, Stair, Elevator, WallSegment, WindowSpec, Furniture, Light, Rect, HeroLayoutSpec, InteriorCategory } from './types';
export { INTERIOR_CATEGORIES } from './types';

export const INTERIOR_NOTE = 'Generated interior — fictional, not surveyed';
export const DOOR_WIDTH_M = 1.0;
export const DOOR_HEIGHT_M = 2.1;
export const LANDING_LEN_M = 1.6;
export const FLIGHT_LEN_M = 5.5;
export const ELEVATOR_SIZE_M = 2.2;
export const WALL_THICKNESS_M = 0.2;
export const RAILING_HEIGHT_M = 1.1;
export const MIN_ROOM_DEPTH_M = 3.2;
const MAX_FURNITURE_PER_ROOM = 48;
const MAX_FURNITURE_PER_FLOOR = 420;

interface Structure {
  usable: Rect;
  mode: 'double' | 'single' | 'hall';
  corridorWidth: number;
  cy: number;
  coreHalf: number;
  /** Stair cores (west end always; east end for long buildings). */
  cores: { rect: Rect; nearX: number; farX: number; id: string }[];
  /** Interior x-range available to rooms/halls between the cores. */
  xStart: number;
  xEnd: number;
  elevator: { shaft: Rect; door: { x: number; y: number; axis: 'x' | 'y' }; lobby: { x: number; y: number } } | null;
  entranceSide: 'north' | 'south' | 'east' | 'west';
  entranceX: number;
  entranceY: number;
}

const rectW = (r: Rect) => r.x1 - r.x0;
const rectD = (r: Rect) => r.y1 - r.y0;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Point-in-polygon (even-odd) for a ring of [x, y]. */
export function pointInRing(ring: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rotate(points: readonly [number, number][], rad: number): [number, number][] {
  const c = Math.cos(rad), s = Math.sin(rad);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function ringArea(ring: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** Largest axis-aligned rectangle found inside the ring by shrinking its bounding box toward the centre. */
export function inscribedRect(ring: readonly [number, number][]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const hw = (maxX - minX) / 2, hh = (maxY - minY) / 2;
  const fits = (r: Rect) => {
    const pts: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [(r.x0 + r.x1) / 2, r.y0], [(r.x0 + r.x1) / 2, r.y1], [r.x0, (r.y0 + r.y1) / 2], [r.x1, (r.y0 + r.y1) / 2]];
    return pts.every(([x, y]) => pointInRing(ring, x, y) || onBoundary(ring, x, y));
  };
  for (let i = 0; i <= 15; i++) {
    const f = 1 - i * 0.04;
    const r = { x0: cx - hw * f, y0: cy - hh * f, x1: cx + hw * f, y1: cy + hh * f };
    if (fits(r)) return r;
  }
  const f = 0.4;
  return { x0: cx - hw * f, y0: cy - hh * f, x1: cx + hw * f, y1: cy + hh * f };
}

function onBoundary(ring: readonly [number, number][], x: number, y: number): boolean {
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    const px = ax + t * dx, py = ay + t * dy;
    if (Math.hypot(px - x, py - y) < 0.05) return true;
  }
  return false;
}

/** Deterministic seed for a footprint: coordinate-based so the same building always yields the same interior. */
export function seedForFootprint(footprint: readonly [number, number][], units: 'lonlat' | 'metres', category: string): number {
  if (footprint.length === 0) return fnv1a(category);
  let cx = 0, cy = 0;
  for (const [x, y] of footprint) { cx += x; cy += y; }
  cx /= footprint.length; cy /= footprint.length;
  if (units === 'lonlat') return mixSeed(Math.round(cy * 1e5), Math.round(cx * 1e5), fnv1a(category));
  return mixSeed(Math.round(cx * 10), Math.round(cy * 10), fnv1a(category), fnv1a(footprint.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(';')));
}

function normaliseFootprint(req: InteriorRequest): { ring: [number, number][]; origin: { lat: number; lon: number } | null; entrance: [number, number] | null } {
  const units = req.footprintUnits ?? 'lonlat';
  let pts = req.footprint.slice();
  if (pts.length >= 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length < 3) {
    // Degenerate footprint → 12 × 8 m box so the caller still gets a plan.
    pts = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
    return { ring: pts, origin: null, entrance: null };
  }
  let origin: { lat: number; lon: number } | null = null;
  let ring: [number, number][];
  let entrance: [number, number] | null = null;
  if (units === 'lonlat') {
    let lon = 0, lat = 0;
    for (const [x, y] of pts) { lon += x; lat += y; }
    lon /= pts.length; lat /= pts.length;
    origin = { lat, lon };
    ring = pts.map(([plon, plat]) => { const o = enuOffsetM(lat, lon, plat, plon); return [o.east, o.north] as [number, number]; });
    if (req.entrance) { const o = enuOffsetM(lat, lon, req.entrance[1], req.entrance[0]); entrance = [o.east, o.north]; }
  } else {
    ring = pts.map(([x, y]) => [x, y] as [number, number]);
    entrance = req.entrance ? [req.entrance[0], req.entrance[1]] : null;
  }
  if (ringArea(ring) < 0) ring.reverse();
  return { ring, origin, entrance };
}

/** Angle (radians from +x) of the longest footprint edge. */
function dominantAngle(ring: readonly [number, number][]): number {
  let best = 0, bestLen = -1;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len > bestLen) { bestLen = len; best = Math.atan2(by - ay, bx - ax); }
  }
  return best;
}

function pickWeighted(rng: Rng, specs: readonly RoomTypeSpec[]): RoomTypeSpec {
  let total = 0;
  for (const s of specs) total += s.weight;
  let r = rng.next() * total;
  for (const s of specs) { r -= s.weight; if (r <= 0) return s; }
  return specs[specs.length - 1];
}

/** Lays out the shared structure (usable rect, corridor, stair cores, elevator, entrance) used by every floor. */
function buildStructure(ring: readonly [number, number][], vocab: CategoryVocabulary, floorsN: number, layout: HeroLayoutSpec | undefined, entrance: [number, number] | null, wantElevator: boolean): Structure {
  const usable = inscribedRect(ring);
  const W = rectW(usable), D = rectD(usable);
  const cw = clamp(layout?.corridorWidthM ?? vocab.corridorWidthM, 1.6, Math.max(1.6, D - 2 * MIN_ROOM_DEPTH_M));
  const cy = (usable.y0 + usable.y1) / 2;
  let mode: Structure['mode'] = 'double';
  if (W < 6 || D < 4.5) mode = 'hall';
  else if (D < 2 * MIN_ROOM_DEPTH_M + cw) mode = D >= MIN_ROOM_DEPTH_M + cw ? 'single' : 'hall';
  const coreHalf = clamp(Math.max(1.8, cw / 2), 1.2, D / 2);
  const needStairs = floorsN > 1 || (layout?.terrace ?? true);
  const coreLen = needStairs ? Math.min(LANDING_LEN_M + FLIGHT_LEN_M, Math.max(3.2, W * 0.4)) : 0;
  const cores: Structure['cores'] = [];
  if (needStairs) {
    const rect = { x0: usable.x0, y0: cy - coreHalf, x1: usable.x0 + coreLen, y1: cy + coreHalf };
    cores.push({ id: 'core-w', rect, nearX: rect.x1, farX: rect.x0 + Math.min(LANDING_LEN_M, coreLen * 0.25) });
    if (W > 48) {
      const r2 = { x0: usable.x1 - coreLen, y0: cy - coreHalf, x1: usable.x1, y1: cy + coreHalf };
      cores.push({ id: 'core-e', rect: r2, nearX: r2.x0, farX: r2.x1 - Math.min(LANDING_LEN_M, coreLen * 0.25) });
    }
  }
  const xStart = usable.x0 + coreLen;
  const xEnd = cores.length > 1 ? usable.x1 - coreLen : usable.x1;
  let elevator: Structure['elevator'] = null;
  if (wantElevator && floorsN > 1 && xEnd - xStart > ELEVATOR_SIZE_M + 6) {
    const bandTop = mode === 'double' ? cy + cw / 2 : mode === 'single' ? usable.y0 + cw : usable.y1 - ELEVATOR_SIZE_M;
    if (usable.y1 - bandTop >= ELEVATOR_SIZE_M - 1e-6) {
      const shaft = { x0: xStart, y0: bandTop, x1: xStart + ELEVATOR_SIZE_M, y1: bandTop + ELEVATOR_SIZE_M };
      elevator = { shaft, door: { x: (shaft.x0 + shaft.x1) / 2, y: shaft.y0, axis: 'x' }, lobby: { x: (shaft.x0 + shaft.x1) / 2, y: shaft.y0 - Math.min(1.2, cw / 2) } };
    }
  }
  // Entrance side: hero spec wins, then the hint, else south.
  let side: Structure['entranceSide'] = layout?.entrance ?? 'south';
  if (!layout?.entrance && entrance) {
    const [ex, ey] = entrance;
    const dS = Math.abs(ey - usable.y0), dN = Math.abs(ey - usable.y1), dE = Math.abs(ex - usable.x1), dW = Math.abs(ex - usable.x0);
    const m = Math.min(dS, dN, dE, dW);
    side = m === dS ? 'south' : m === dN ? 'north' : m === dE ? 'east' : 'west';
  }
  if (side === 'west') side = mode === 'hall' ? 'west' : 'south'; // the stair core occupies the west end
  if (mode === 'single' && side === 'north') side = 'south';
  const roomX0 = xStart + (elevator ? ELEVATOR_SIZE_M : 0);
  const ex = clamp(entrance ? entrance[0] : (roomX0 + xEnd) / 2, roomX0 + 3, Math.max(roomX0 + 3, xEnd - 3));
  const entranceX = side === 'east' ? usable.x1 : side === 'west' ? usable.x0 : ex;
  const entranceY = side === 'south' ? usable.y0 : side === 'north' ? usable.y1 : mode === 'hall' ? clamp(entrance ? entrance[1] : cy, usable.y0 + 1.5, usable.y1 - 1.5) : cy;
  return { usable, mode, corridorWidth: cw, cy, coreHalf, cores, xStart, xEnd, elevator, entranceSide: side, entranceX, entranceY };
}

function stairForFloor(core: Structure['cores'][number], from: number, cy: number, coreHalf: number): Stair {
  const westCore = core.nearX > core.farX;
  const xLo = Math.min(core.nearX, core.farX), xHi = Math.max(core.nearX, core.farX);
  const landing: Rect = westCore ? { x0: core.rect.x0, y0: core.rect.y0, x1: core.farX, y1: core.rect.y1 } : { x0: core.farX, y0: core.rect.y0, x1: core.rect.x1, y1: core.rect.y1 };
  return {
    id: `${core.id}-s${from}`,
    fromFloor: from,
    toFloor: from + 1,
    core: core.rect,
    laneA: { x0: xLo, y0: cy - coreHalf, x1: xHi, y1: cy },
    laneB: { x0: xLo, y0: cy, x1: xHi, y1: cy + coreHalf },
    landing,
    nearX: core.nearX,
    farX: core.farX,
  };
}

/** Walking-surface height (relative to the ground slab) of a stair at a building-frame point, or null when off it. */
export function stairSurfaceZ(stair: Stair, zFrom: number, floorH: number, x: number, y: number): number | null {
  const half = floorH / 2;
  const inRect = (r: Rect) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && y >= r.y0 - 1e-6 && y <= r.y1 + 1e-6;
  if (inRect(stair.landing)) return zFrom + half;
  const L = Math.abs(stair.nearX - stair.farX);
  if (L < 1e-6) return null;
  const t = clamp(Math.abs(x - stair.nearX) / L, 0, 1);
  if (inRect(stair.laneA)) return zFrom + half * t;
  if (inRect(stair.laneB)) return zFrom + half + half * (1 - t);
  return null;
}

interface RoomProgramme { label: string; kind: RoomKind; widthM: number; spec: RoomTypeSpec | null; decorativeDoor: boolean }

function labelFor(spec: RoomTypeSpec, counters: Map<string, number>, floor: number): string {
  const n = (counters.get(spec.kind) ?? 0);
  counters.set(spec.kind, n + 1);
  const base = spec.labels[n % spec.labels.length];
  const repeat = Math.floor(n / spec.labels.length);
  const numbered = spec.labels.length <= 2 || repeat > 0 || spec.kind === 'classroom' || spec.kind === 'bedroom' || spec.kind === 'cabin' || spec.kind === 'flat';
  if (spec.kind === 'bedroom' || spec.kind === 'cabin') return `${base.replace(/\d+$/, '').trim()} ${floor}${String(n + 1).padStart(2, '0')}`;
  return numbered && spec.labels.length > 1 && !/\d/.test(base) ? `${base} ${floor}${String.fromCharCode(65 + (n % 26))}` : repeat > 0 ? `${base} ${repeat + 1}` : base;
}

/** Fills a band of width `width` with rooms: the hero programme in order, or random picks from the vocabulary. */
function fillBand(rng: Rng, width: number, vocab: CategoryVocabulary, floor: number, counters: Map<string, number>, hero: RoomProgramme[] | null): RoomProgramme[] {
  const out: RoomProgramme[] = [];
  let remaining = width;
  if (hero) {
    for (const r of hero) {
      if (remaining < 2.4) break;
      const w = Math.min(r.widthM, remaining);
      out.push({ ...r, widthM: w });
      remaining -= w;
    }
    if (remaining >= 3) out.push({ label: 'Common area', kind: 'lounge', widthM: remaining, spec: null, decorativeDoor: false });
    else if (out.length) out[out.length - 1].widthM += remaining;
    return out;
  }
  let guard = 0;
  while (remaining >= 2.4 && guard++ < 64) {
    const candidates = vocab.rooms.filter((s) => s.minW <= remaining);
    const spec = candidates.length ? pickWeighted(rng, candidates) : vocab.rooms.reduce((a, b) => (a.minW < b.minW ? a : b));
    let w = clamp(rng.range(spec.minW, spec.maxW), 2.4, remaining);
    if (remaining - w < 2.4) w = remaining;
    out.push({ label: labelFor(spec, counters, floor), kind: spec.kind, widthM: w, spec, decorativeDoor: rng.next() < (spec.decorativeDoorChance ?? 0) });
    remaining -= w;
  }
  if (remaining > 0 && out.length) out[out.length - 1].widthM += remaining;
  return out;
}

function placeFurniture(rng: Rng, room: Room, templates: readonly FurnitureTemplate[], doorSide: 'north' | 'south' | 'east' | 'west' | null, ids: { n: number }, budget: { n: number }): Furniture[] {
  const out: Furniture[] = [];
  const r = room.rect;
  const margin = 0.6;
  const inner: Rect = { x0: r.x0 + margin, y0: r.y0 + margin, x1: r.x1 - margin, y1: r.y1 - margin };
  // Keep a clear strip inside the door wall so the entrance is never blocked.
  const clear = 1.3;
  if (doorSide === 'south') inner.y0 += clear;
  if (doorSide === 'north') inner.y1 -= clear;
  if (doorSide === 'west') inner.x0 += clear;
  if (doorSide === 'east') inner.x1 -= clear;
  if (rectW(inner) < 0.8 || rectD(inner) < 0.8) return out;
  const backY = doorSide === 'south' ? inner.y1 : inner.y0; // wall opposite the door
  const add = (x0: number, y0: number, t: FurnitureTemplate) => {
    if (out.length >= MAX_FURNITURE_PER_ROOM || budget.n >= MAX_FURNITURE_PER_FLOOR) return;
    const rect = { x0, y0, x1: x0 + t.w, y1: y0 + t.d };
    if (rect.x0 < inner.x0 - 1e-6 || rect.y0 < inner.y0 - 1e-6 || rect.x1 > inner.x1 + 1e-6 || rect.y1 > inner.y1 + 1e-6) return;
    for (const f of out) if (rect.x0 < f.rect.x1 && rect.x1 > f.rect.x0 && rect.y0 < f.rect.y1 && rect.y1 > f.rect.y0) return;
    out.push({ id: `${room.id}-f${ids.n++}`, label: t.label, rect, heightM: t.h, colour: t.colour, roomId: room.id });
    budget.n++;
  };
  for (const t of templates) {
    if (t.w > rectW(inner) || t.d > rectD(inner)) continue;
    if (t.place === 'back') {
      const x0 = (inner.x0 + inner.x1) / 2 - t.w / 2;
      add(x0, doorSide === 'south' ? backY - t.d : backY, t);
    } else if (t.place === 'centre') {
      add((inner.x0 + inner.x1) / 2 - t.w / 2, (inner.y0 + inner.y1) / 2 - t.d / 2, t);
    } else if (t.place === 'perimeter') {
      const px = t.pitchX ?? t.w + 1;
      for (let x = inner.x0; x + t.w <= inner.x1 + 1e-6; x += px) add(x, doorSide === 'south' ? backY - t.d : backY, t);
    } else {
      const px = t.pitchX ?? t.w + 0.6, py = t.pitchY ?? t.d + 0.8;
      // Leave room for a 'back' unit (teacher desk, counter) by starting one pitch away from the back wall.
      const hasBack = templates.some((u) => u.place === 'back');
      const y0 = inner.y0 + (hasBack && doorSide !== 'south' ? py : 0);
      const y1 = inner.y1 - (hasBack && doorSide === 'south' ? py : 0);
      const cols = Math.max(1, Math.floor((rectW(inner) + (px - t.w)) / px));
      const usedW = cols * px - (px - t.w);
      const startX = inner.x0 + (rectW(inner) - usedW) / 2;
      for (let y = y0; y + t.d <= y1 + 1e-6; y += py) for (let c = 0; c < cols; c++) add(startX + c * px, y, t);
    }
  }
  void rng;
  return out;
}

function roomLights(room: Room, ids: { n: number }): Light[] {
  const out: Light[] = [];
  const r = room.rect;
  const pitch = 4.2;
  const nx = Math.max(1, Math.round(rectW(r) / pitch)), ny = Math.max(1, Math.round(rectD(r) / pitch));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push({ id: `${room.id}-l${ids.n++}`, x: r.x0 + (rectW(r) * (i + 0.5)) / nx, y: r.y0 + (rectD(r) * (j + 0.5)) / ny, wM: 1.2, dM: 0.3 });
  return out;
}

function windowsAlong(id: string, axis: 'x' | 'y', fixed: number, from: number, to: number, floorH: number, ids: { n: number }, skip?: { at: number; half: number }): WindowSpec[] {
  const out: WindowSpec[] = [];
  const len = to - from;
  const w = 1.5, pitch = 3.0;
  const n = Math.floor((len - 1.0) / pitch);
  if (n <= 0) return out;
  const start = from + (len - (n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const c = start + i * pitch;
    if (skip && Math.abs(c - skip.at) < skip.half + w / 2 + 0.3) continue;
    out.push({ id: `${id}-w${ids.n++}`, x: axis === 'x' ? c : fixed, y: axis === 'x' ? fixed : c, axis, widthM: w, sillM: 0.95, headM: Math.min(2.3, floorH - 0.5) });
  }
  return out;
}

function buildFloor(index: number, z: number, s: Structure, vocab: CategoryVocabulary, floorH: number, rng: Rng, floorsN: number, heroFloor: HeroFloorSpec | undefined, hero: boolean): FloorPlan {
  const U = s.usable;
  const ids = { n: 0 };
  const budget = { n: 0 };
  const rooms: Room[] = [];
  const corridors: Corridor[] = [];
  const doors: Door[] = [];
  const windows: WindowSpec[] = [];
  const walls: WallSegment[] = [];
  const furniture: Furniture[] = [];
  const lights: Light[] = [];
  const stairs: Stair[] = [];
  const elevators: Elevator[] = [];
  const exits: FloorPlan['exits'] = [];
  const counters = new Map<string, number>();
  const wall = (x0: number, y0: number, x1: number, y1: number, exterior: boolean, railing = false): void => {
    if (Math.hypot(x1 - x0, y1 - y0) < 0.05) return;
    walls.push({ id: `f${index}-wall${ids.n++}`, x0, y0, x1, y1, exterior, railing: railing || undefined });
  };
  const isTerrace = index === floorsN;
  const floorName = isTerrace ? 'Terrace' : heroFloor?.name ?? (index === 0 ? 'Ground floor' : `Floor ${index}`);

  // Exterior shell (railings on the terrace).
  wall(U.x0, U.y0, U.x1, U.y0, true, isTerrace);
  wall(U.x1, U.y0, U.x1, U.y1, true, isTerrace);
  wall(U.x1, U.y1, U.x0, U.y1, true, isTerrace);
  wall(U.x0, U.y1, U.x0, U.y0, true, isTerrace);

  // Stair cores: side walls and the dead space beside them; stairs rise from every floor below the top.
  for (const core of s.cores) {
    const west = core.nearX > core.farX;
    const cr = core.rect;
    wall(cr.x0, cr.y0, cr.x1, cr.y0, false, isTerrace);
    wall(cr.x0, cr.y1, cr.x1, cr.y1, false, isTerrace);
    const nearX = core.nearX;
    if (!isTerrace) {
      // Partition from the core's near end to the shell, leaving the core mouth open.
      wall(nearX, U.y0, nearX, cr.y0, false);
      wall(nearX, cr.y1, nearX, U.y1, false);
    } else {
      // On the terrace the stairwell is railed; only lane B's mouth (the arriving flight) is open.
      wall(nearX, cr.y0, nearX, s.cy, false, true);
      wall(west ? cr.x0 : cr.x1, cr.y0, west ? cr.x0 : cr.x1, cr.y1, false, true);
    }
    if (index < floorsN) {
      const st = stairForFloor(core, index, s.cy, s.coreHalf);
      stairs.push(st);
      // Railing between the two flights (never across the landing).
      wall(Math.min(core.nearX, core.farX), s.cy, Math.max(core.nearX, core.farX), s.cy, false, true);
    }
  }

  if (isTerrace) {
    rooms.push({ id: `f${index}-terrace`, label: 'Terrace (railed)', kind: 'hall', rect: { x0: s.xStart, y0: U.y0, x1: s.xEnd, y1: U.y1 } });
    return { index, z, name: floorName, kind: 'terrace', rooms, corridors, doors, windows, walls, furniture, lights, stairs, elevators, exits };
  }

  // Elevator shaft: four walls with a door onto the corridor/hall; served on every floor.
  let roomX0 = s.xStart;
  if (s.elevator) {
    const sh = s.elevator.shaft;
    wall(sh.x0, sh.y0, sh.x1, sh.y0, false);
    wall(sh.x1, sh.y0, sh.x1, sh.y1, false);
    wall(sh.x1, sh.y1, sh.x0, sh.y1, false);
    wall(sh.x0, sh.y1, sh.x0, sh.y0, false);
    const el: Elevator = { id: `f${index}-lift`, shaft: sh, door: s.elevator.door, lobby: s.elevator.lobby, servesFloors: Array.from({ length: floorsN }, (_, i) => i) };
    elevators.push(el);
    if (s.mode !== 'hall') roomX0 = sh.x1;
  }

  const groundHall = index === 0 && !hero ? vocab.groundHall : undefined;
  const heroHall = heroFloor?.hall;
  const hallMode = s.mode === 'hall' || !!groundHall || !!heroHall;
  const hallSpaceId = `f${index}-hall`;
  const corridorId = `f${index}-corr`;
  const spaceId = hallMode ? hallSpaceId : corridorId;

  if (hallMode) {
    const kind: RoomKind = heroHall?.kind ?? groundHall?.kind ?? (index === 0 ? vocab.lobby.kind : vocab.rooms[0].kind);
    const label = heroHall?.label ?? groundHall?.label ?? (index === 0 ? vocab.lobby.labels[0] : labelFor(vocab.rooms[0], counters, index));
    const hall: Room = { id: hallSpaceId, label, kind, rect: { x0: s.xStart, y0: U.y0, x1: s.xEnd, y1: U.y1 } };
    rooms.push(hall);
    if (s.elevator) {
      const sh = s.elevator.shaft;
      // Shaft sits inside the hall; carve it out of the hall's rect for the non-overlap contract by splitting.
      hall.rect = { x0: sh.x1, y0: U.y0, x1: s.xEnd, y1: U.y1 };
      rooms.push({ id: `${hallSpaceId}-side`, label: 'Lift lobby', kind: 'lobby', rect: { x0: s.xStart, y0: U.y0, x1: sh.x1, y1: sh.y0 } });
      doors.push({ id: `f${index}-liftdoor`, x: s.elevator.door.x, y: s.elevator.door.y, axis: 'x', widthM: DOOR_WIDTH_M, links: [`${hallSpaceId}-side`, 'elevator'], decorative: false, exterior: false });
      // Lift lobby and hall are one open space; no wall between them.
    }
    // Windows around the hall.
    windows.push(...windowsAlong(hall.id, 'x', U.y0, hall.rect.x0, hall.rect.x1, floorH, ids, s.entranceSide === 'south' ? { at: s.entranceX, half: 1.5 } : undefined));
    windows.push(...windowsAlong(hall.id, 'x', U.y1, hall.rect.x0, hall.rect.x1, floorH, ids, s.entranceSide === 'north' ? { at: s.entranceX, half: 1.5 } : undefined));
    windows.push(...windowsAlong(hall.id, 'y', U.x1, U.y0, U.y1, floorH, ids, s.entranceSide === 'east' ? { at: s.entranceY, half: 1.5 } : undefined));
    const templates = heroHall ? (vocab.rooms.find((r) => r.kind === heroHall.kind)?.furniture ?? vocab.lobby.furniture) : (index === 0 ? vocab.lobby.furniture : vocab.rooms[0].furniture);
    const hallTemplates = kind === 'auditorium' ? [{ label: 'stage', w: Math.min(10, rectW(hall.rect) * 0.5), d: 3, h: 0.9, colour: '#5b3f3a', place: 'back' as const }, { label: 'seats', w: 2.4, d: 0.5, h: 0.5, colour: '#3d6b9a', place: 'grid' as const, pitchX: 3.0, pitchY: 1.3 }]
      : kind === 'sports-hall' ? [{ label: 'court marking', w: Math.min(18, rectW(hall.rect) - 4), d: Math.min(9, rectD(hall.rect) - 4), h: 0.02, colour: '#d9a25a', place: 'centre' as const }]
      : kind === 'library' ? [{ label: 'bookshelf', w: 0.5, d: Math.min(4, rectD(hall.rect) * 0.35), h: 2.0, colour: '#7a5a3e', place: 'grid' as const, pitchX: 2.2, pitchY: 6 }, { label: 'reading table', w: 1.8, d: 0.9, h: 0.75, colour: '#b48a5a', place: 'perimeter' as const, pitchX: 3.2 }]
      : kind === 'cafeteria' ? [{ label: 'serving counter', w: Math.min(8, rectW(hall.rect) * 0.4), d: 0.8, h: 1.0, colour: '#5e5148', place: 'back' as const }, { label: 'table', w: 1.6, d: 0.8, h: 0.75, colour: '#b48a5a', place: 'grid' as const, pitchX: 3.0, pitchY: 2.6 }]
      : templates;
    furniture.push(...placeFurniture(rng, hall, hallTemplates, s.entranceSide === 'north' ? 'north' : s.entranceSide === 'east' ? 'east' : 'south', ids, budget));
    lights.push(...roomLights(hall, ids));
    if (heroFloor?.rooms?.length) {
      // Side rooms inside a hero hall (e.g. a green room beside the auditorium) go along the east wall as a strip.
      const strip = Math.min(5, rectW(hall.rect) * 0.3);
      hall.rect = { ...hall.rect, x1: hall.rect.x1 - strip };
      let y = U.y0;
      for (const r of heroFloor.rooms) {
        const d = Math.min(r.widthM ?? 5, U.y1 - y);
        if (d < 2.4) break;
        const room: Room = { id: `f${index}-r${rooms.length}`, label: r.label, kind: r.kind, rect: { x0: hall.rect.x1, y0: y, x1: s.xEnd, y1: y + d } };
        rooms.push(room);
        wall(room.rect.x0, room.rect.y0, room.rect.x0, room.rect.y1, false);
        wall(room.rect.x0, room.rect.y1, room.rect.x1, room.rect.y1, false);
        doors.push({ id: `${room.id}-door`, x: room.rect.x0, y: (room.rect.y0 + room.rect.y1) / 2, axis: 'y', widthM: DOOR_WIDTH_M, links: [room.id, hall.id], decorative: false, exterior: false });
        furniture.push(...placeFurniture(rng, room, vocab.rooms.find((v) => v.kind === r.kind)?.furniture ?? [], 'west', ids, budget));
        lights.push(...roomLights(room, ids));
        y += d;
      }
    }
  } else {
    // Corridor along the long axis between the cores.
    const cw = s.corridorWidth;
    const corr: Rect = s.mode === 'double' ? { x0: s.xStart, y0: s.cy - cw / 2, x1: s.xEnd, y1: s.cy + cw / 2 } : { x0: s.xStart, y0: U.y0, x1: s.xEnd, y1: U.y0 + cw };
    corridors.push({ id: corridorId, rect: corr });
    for (let x = corr.x0 + 2.5; x < corr.x1 - 1; x += 5) lights.push({ id: `${corridorId}-l${ids.n++}`, x, y: (corr.y0 + corr.y1) / 2, wM: 1.2, dM: 0.3 });
    const bands: { side: 'north' | 'south'; rect: Rect }[] = [];
    if (s.mode === 'double') {
      bands.push({ side: 'north', rect: { x0: roomX0, y0: corr.y1, x1: s.xEnd, y1: U.y1 } });
      bands.push({ side: 'south', rect: { x0: s.xStart, y0: U.y0, x1: s.xEnd, y1: corr.y0 } });
    } else bands.push({ side: 'north', rect: { x0: roomX0, y0: corr.y1, x1: s.xEnd, y1: U.y1 } });
    if (s.elevator) {
      const el = s.elevator;
      doors.push({ id: `f${index}-liftdoor`, x: el.door.x, y: el.door.y, axis: 'x', widthM: DOOR_WIDTH_M, links: [corridorId, 'elevator'], decorative: false, exterior: false });
    }
    // Hero programme split by side; random programme otherwise.
    const heroRooms = heroFloor?.rooms ? heroFloor.rooms.map((r, i) => ({ ...r, side: r.side ?? (bands.length === 1 ? 'north' : i % 2 === 0 ? 'north' : 'south') })) : null;
    for (const band of bands) {
      const width = rectW(band.rect);
      if (width < 2.4) continue;
      const programme = heroRooms ? heroRooms.filter((r) => r.side === band.side).map((r) => ({ label: r.label, kind: r.kind, widthM: r.widthM ?? 8, spec: vocab.rooms.find((v) => v.kind === r.kind) ?? null, decorativeDoor: !!r.decorativeDoor })) : null;
      const list = fillBand(rng, width, vocab, index, counters, programme);
      // Ground floor: the entrance lobby replaces the room under the entrance point on the entrance side.
      let x = band.rect.x0;
      let lobbyDone = false;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        let rect: Rect = { x0: x, y0: band.rect.y0, x1: Math.min(band.rect.x1, x + p.widthM), y1: band.rect.y1 };
        let label = p.label, kind = p.kind, spec = p.spec;
        const entranceHere = index === 0 && !lobbyDone && band.side === s.entranceSide && s.entranceX >= rect.x0 - 1e-6 && s.entranceX <= rect.x1 + 1e-6;
        if (entranceHere && !hero) { label = vocab.lobby.labels[0]; kind = vocab.lobby.kind; spec = vocab.lobby; lobbyDone = true; }
        if (i === list.length - 1) rect = { ...rect, x1: band.rect.x1 };
        const room: Room = { id: `f${index}-r${rooms.length}`, label, kind, rect };
        rooms.push(room);
        // Partition to the next room.
        if (i < list.length - 1) wall(rect.x1, rect.y0, rect.x1, rect.y1, false);
        // Door onto the corridor.
        const doorY = band.side === 'north' ? rect.y0 : rect.y1;
        const doorX = clamp(rect.x0 + 0.9 + rng.next() * Math.max(0, rectW(rect) - 1.8), rect.x0 + 0.7, rect.x1 - 0.7);
        doors.push({ id: `${room.id}-door`, x: doorX, y: doorY, axis: 'x', widthM: DOOR_WIDTH_M, links: [room.id, corridorId], decorative: false, exterior: false });
        if (entranceHere) {
          const ey = band.side === 'north' ? U.y1 : U.y0;
          const ex = clamp(s.entranceX, rect.x0 + 0.9, rect.x1 - 0.9);
          const d: Door = { id: `${room.id}-exit`, x: ex, y: ey, axis: 'x', widthM: 1.6, links: [room.id, 'outside'], decorative: false, exterior: true };
          doors.push(d);
          exits.push({ x: ex, y: ey + (band.side === 'north' ? -1.2 : 1.2), outsideX: ex, outsideY: ey + (band.side === 'north' ? 2.5 : -2.5), doorId: d.id });
        }
        // Decorative cupboard door on the back wall.
        if (p.decorativeDoor && rectW(rect) > 3) {
          const by = band.side === 'north' ? rect.y1 : rect.y0;
          doors.push({ id: `${room.id}-deco`, x: rect.x0 + 0.9, y: by, axis: 'x', widthM: 0.8, links: null, decorative: true, exterior: false });
        }
        // Windows on the exterior wall(s) the room touches.
        const outerY = band.side === 'north' ? U.y1 : U.y0;
        windows.push(...windowsAlong(room.id, 'x', outerY, rect.x0, rect.x1, floorH, ids, entranceHere ? { at: s.entranceX, half: 0.8 } : undefined));
        if (Math.abs(rect.x1 - U.x1) < 1e-6) windows.push(...windowsAlong(room.id, 'y', U.x1, rect.y0, rect.y1, floorH, ids));
        const templates = spec?.furniture ?? vocab.rooms.find((v) => v.kind === kind)?.furniture ?? [];
        furniture.push(...placeFurniture(rng, room, templates, band.side === 'north' ? 'south' : 'north', ids, budget));
        lights.push(...roomLights(room, ids));
        x = rect.x1;
      }
      // Band partition against the corridor (door gaps are cut when rendered / filtered).
      if (band.side === 'north') wall(band.rect.x0, band.rect.y0, band.rect.x1, band.rect.y0, false);
      else wall(band.rect.x0, band.rect.y1, band.rect.x1, band.rect.y1, false);
    }
    // Corridor end windows.
    if (s.cores.length === 1) windows.push(...windowsAlong(corridorId, 'y', U.x1, corr.y0, corr.y1, floorH, ids, s.entranceSide === 'east' ? { at: s.cy, half: 1 } : undefined));
  }

  // Entrance directly into the hall/corridor when the entrance is on an end wall (or into a hero hall on a long wall).
  if (index === 0) {
    const hasExit = doors.some((d) => d.exterior);
    if (!hasExit) {
      const space = hallMode ? rooms[0] : corridors[0];
      const spaceRect = space.rect;
      let d: Door;
      let exit: FloorPlan['exits'][number];
      if (s.entranceSide === 'east' || s.entranceSide === 'west') {
        const ex = s.entranceSide === 'east' ? U.x1 : U.x0;
        const ey = clamp(s.entranceY, spaceRect.y0 + 0.9, spaceRect.y1 - 0.9);
        d = { id: `f0-exit`, x: ex, y: ey, axis: 'y', widthM: 1.6, links: [spaceId, 'outside'], decorative: false, exterior: true };
        exit = { x: ex + (s.entranceSide === 'east' ? -1.2 : 1.2), y: ey, outsideX: ex + (s.entranceSide === 'east' ? 2.5 : -2.5), outsideY: ey, doorId: d.id };
      } else {
        const ey = s.entranceSide === 'north' ? U.y1 : U.y0;
        const ex = clamp(s.entranceX, spaceRect.x0 + 0.9, spaceRect.x1 - 0.9);
        d = { id: `f0-exit`, x: ex, y: ey, axis: 'x', widthM: 1.6, links: [spaceId, 'outside'], decorative: false, exterior: true };
        exit = { x: ex, y: ey + (s.entranceSide === 'north' ? -1.2 : 1.2), outsideX: ex, outsideY: ey + (s.entranceSide === 'north' ? 2.5 : -2.5), doorId: d.id };
      }
      doors.push(d);
      exits.push(exit);
    }
    // Secondary exit at the far end of a long corridor.
    if (!hallMode && s.cores.length === 1 && rectW(U) > 24 && s.entranceSide !== 'east') {
      const corr = corridors[0].rect;
      const d: Door = { id: `f0-exit2`, x: U.x1, y: (corr.y0 + corr.y1) / 2, axis: 'y', widthM: 1.4, links: [corridorId, 'outside'], decorative: false, exterior: true };
      doors.push(d);
      exits.push({ x: U.x1 - 1.2, y: d.y, outsideX: U.x1 + 2.5, outsideY: d.y, doorId: d.id });
      // Remove any corridor-end window that would overlap the door.
      for (let i = windows.length - 1; i >= 0; i--) { const w = windows[i]; if (w.axis === 'y' && Math.abs(w.x - U.x1) < 1e-6 && Math.abs(w.y - d.y) < 1.6) windows.splice(i, 1); }
    }
  }

  return { index, z, name: floorName, kind: 'floor', rooms, corridors, doors, windows, walls, furniture, lights, stairs, elevators, exits };
}

/** Builds the deterministic interior plan for a building. */
export function buildInteriorPlan(req: InteriorRequest): InteriorPlan {
  const vocab = INTERIOR_VOCABULARY[req.category] ?? INTERIOR_VOCABULARY.office;
  const units = req.footprintUnits ?? 'lonlat';
  const { ring: enuRing, origin, entrance: enuEntrance } = normaliseFootprint(req);
  const seed = req.seed ?? seedForFootprint(req.footprint, units, req.category);
  const rng = new Rng(seed);
  // Building frame: x along the longest edge, and the long side of the inscribed rectangle.
  let rotation = dominantAngle(enuRing);
  let ring = rotate(enuRing, -rotation);
  let usable = inscribedRect(ring);
  if (rectW(usable) < rectD(usable)) { rotation += Math.PI / 2; ring = rotate(enuRing, -rotation); usable = inscribedRect(ring); }
  const entrance = enuEntrance ? rotate([enuEntrance], -rotation)[0] : null;
  const layout = req.layout;
  const hero = !!layout;
  const heightM = Math.max(2.8, req.heightM);
  const [hMin, hMax] = vocab.floorHeightM;
  const maxFloors = Math.max(1, req.maxFloors ?? 24);
  let floorsN = layout ? layout.floors.length : req.floors ?? clamp(Math.round(heightM / ((hMin + hMax) / 2)), 1, 40);
  floorsN = clamp(Math.round(floorsN), 1, maxFloors);
  const floorH = layout ? clamp(heightM / floorsN, hMin, hMax) : clamp(heightM / floorsN, Math.min(hMin, heightM / floorsN), hMax);
  const wantElevator = layout ? !!layout.elevator : floorsN >= vocab.elevatorFromFloors;
  const s = buildStructure(ring, vocab, floorsN, layout, entrance, wantElevator);
  const terrace = layout?.terrace ?? true;
  const floors: FloorPlan[] = [];
  for (let i = 0; i < floorsN; i++) floors.push(buildFloor(i, i * floorH, s, vocab, floorH, rng, floorsN, layout?.floors[i], hero));
  if (terrace && s.cores.length) floors.push(buildFloor(floorsN, floorsN * floorH, s, vocab, floorH, rng, floorsN, undefined, hero));
  const name = req.name ?? `${vocab.enterLabel.replace(/^Enter /, '')}`;
  return {
    id: `interior-${seed.toString(16)}`,
    category: req.category,
    seed,
    hero,
    origin,
    rotationRad: rotation,
    footprint: ring,
    usable: s.usable,
    floorHeightM: floorH,
    heightM: floorsN * floorH,
    floors,
    note: hero ? `${INTERIOR_NOTE} — original handcrafted layout` : INTERIOR_NOTE,
    displayName: name,
  };
}

/** Category label used in prompts ("Enter office (procedural interior)"). */
export function enterLabelFor(category: keyof typeof INTERIOR_VOCABULARY): string {
  return INTERIOR_VOCABULARY[category].enterLabel;
}
