/**
 * Deck-level layout of the original in-game cruise ship "MV Terra Konkan" (fictional design). Pure TypeScript: the
 * same room rectangles drive the visual walls and the walking surface. Local frame: +x forward (bow), +y port (left),
 * z up from the waterline. Stairs are ramps between decks; walls are thin strips that the walker cannot climb.
 */
export interface DeckRoom { name: string; deck: number; x0: number; x1: number; y0: number; y1: number; /** door gaps: side + centre coordinate + width */ doors: { side: 'fore' | 'aft' | 'port' | 'starboard'; at: number; width: number }[]; kind: 'restaurant' | 'theatre' | 'lounge' | 'cabins' | 'viewing' | 'pool' | 'bridge' | 'shop' }
export interface Ramp { x0: number; x1: number; y0: number; y1: number; zFrom: number; zTo: number }

export const SHIP_LENGTH_M = 180;
export const SHIP_BEAM_M = 26;
export const DECK_Z = [8.0, 11.2, 14.4];
export const DECK_NAMES = ['Deck 3 · Promenade', 'Deck 4 · Lido', 'Deck 5 · Sky'];
const HALF_L = SHIP_LENGTH_M / 2 - 6;
const HALF_W = SHIP_BEAM_M / 2 - 1;
const WALL_T = 0.5;
const STEP_UP = 1.2;

export const CRUISE_ROOMS: DeckRoom[] = [
  { name: 'Konkan Restaurant', kind: 'restaurant', deck: 0, x0: 18, x1: 62, y0: -8, y1: 8, doors: [{ side: 'aft', at: 0, width: 3 }, { side: 'port', at: 40, width: 2.5 }] },
  { name: 'Music Lounge', kind: 'lounge', deck: 0, x0: -18, x1: 14, y0: -8, y1: 8, doors: [{ side: 'fore', at: 0, width: 3 }, { side: 'starboard', at: 0, width: 2.5 }] },
  { name: 'Sahyadri Theatre', kind: 'theatre', deck: 0, x0: -64, x1: -22, y0: -8, y1: 8, doors: [{ side: 'fore', at: 0, width: 3 }, { side: 'port', at: -40, width: 2.5 }] },
  { name: 'Cabin corridor (fictional cabins 401–412)', kind: 'cabins', deck: 1, x0: 34, x1: 74, y0: -8, y1: 8, doors: [{ side: 'aft', at: 0, width: 3 }] },
  { name: 'Lido Pool', kind: 'pool', deck: 1, x0: -12, x1: 24, y0: -6, y1: 6, doors: [] },
  { name: 'Aft Viewing Lounge', kind: 'viewing', deck: 1, x0: -70, x1: -30, y0: -8, y1: 8, doors: [{ side: 'fore', at: 0, width: 3 }, { side: 'starboard', at: -50, width: 2.5 }] },
  { name: 'Bridge (crew only)', kind: 'bridge', deck: 2, x0: 56, x1: 76, y0: -9, y1: 9, doors: [] },
  { name: 'Sky Viewing Deck', kind: 'viewing', deck: 2, x0: -80, x1: -20, y0: -10, y1: 10, doors: [{ side: 'fore', at: 0, width: 8 }, { side: 'fore', at: 0, width: 8 }] },
];

/** Ramps ("stairs") between decks, one forward and one aft, on the centre line. */
export const CRUISE_RAMPS: Ramp[] = [
  { x0: -4, x1: 14, y0: -1.6, y1: 1.6, zFrom: DECK_Z[0], zTo: DECK_Z[1] },   // deck 0 → 1 inside the Music Lounge, climbs forward
  { x0: -30, x1: -12, y0: -1.6, y1: 1.6, zFrom: DECK_Z[1], zTo: DECK_Z[2] }, // deck 1 → 2 aft of the pool, climbs forward
];

/** Pool basin (walkable, 1.4 m below the Lido deck). */
export const POOL = { x0: -8, x1: 18, y0: -4, y1: 4, depth: 1.4 };

function inRect(x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Wall segments of a room as rectangles (thickness WALL_T) with door gaps removed. */
export function roomWalls(room: DeckRoom): { x0: number; x1: number; y0: number; y1: number }[] {
  const out: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const t = WALL_T / 2;
  const edge = (side: DeckRoom['doors'][number]['side']) => {
    const doors = room.doors.filter((d) => d.side === side).sort((a, b) => a.at - b.at);
    const along = side === 'fore' || side === 'aft' ? [room.y0, room.y1] : [room.x0, room.x1];
    let start = along[0];
    const pieces: [number, number][] = [];
    for (const d of doors) { const a = d.at - d.width / 2, b = d.at + d.width / 2; if (a > start) pieces.push([start, a]); start = Math.max(start, b); }
    if (start < along[1]) pieces.push([start, along[1]]);
    for (const [a, b] of pieces) {
      if (side === 'fore') out.push({ x0: room.x1 - t, x1: room.x1 + t, y0: a, y1: b });
      else if (side === 'aft') out.push({ x0: room.x0 - t, x1: room.x0 + t, y0: a, y1: b });
      else if (side === 'port') out.push({ x0: a, x1: b, y0: room.y1 - t, y1: room.y1 + t });
      else out.push({ x0: a, x1: b, y0: room.y0 - t, y1: room.y0 + t });
    }
  };
  edge('fore'); edge('aft'); edge('port'); edge('starboard');
  return out;
}

const WALLS = CRUISE_ROOMS.map((r) => ({ deck: r.deck, walls: roomWalls(r), room: r }));

/**
 * Walking-surface height at ship-local (x, y) for a walker currently at local height `currentZ`: the highest deck,
 * ramp or pool floor that is at most a step above the walker; walls return a value 3 m above the walker so the mode
 * controller treats them as unclimbable. Null outside the hull (the walker falls into the sea and is respawned).
 */
export function sampleDeck(x: number, y: number, currentZ: number): number | null {
  if (Math.abs(x) > HALF_L || Math.abs(y) > HALF_W) return null;
  // Bow taper: the walkable width narrows towards the bow.
  if (x > HALF_L - 20 && Math.abs(y) > HALF_W * (1 - (x - (HALF_L - 20)) / 20)) return null;
  const limit = currentZ + STEP_UP;
  let best: number | null = null;
  const consider = (h: number) => { if (h <= limit && (best === null || h > best)) best = h; };
  for (const r of CRUISE_RAMPS) if (inRect(x, y, r)) consider(r.zFrom + (r.zTo - r.zFrom) * ((x - r.x0) / (r.x1 - r.x0)));
  for (let d = 0; d < DECK_Z.length; d++) {
    const z = DECK_Z[d];
    if (d === 1 && inRect(x, y, POOL)) { consider(z - POOL.depth); continue; }
    consider(z);
  }
  // Ramp side rails and room walls: only for the deck the walker stands on.
  const deck = deckIndexFor(currentZ);
  if (best !== null) {
    for (const r of CRUISE_RAMPS) {
      const onRamp = inRect(x, y, r);
      const nearRampY = Math.abs(y) > r.y1 && Math.abs(y) < r.y1 + WALL_T && x >= r.x0 && x <= r.x1;
      if (!onRamp && nearRampY && currentZ > r.zFrom + 0.6 && currentZ < r.zTo - 0.2) return currentZ + 3;
    }
    for (const w of WALLS) {
      if (w.deck !== deck) continue;
      if (w.room.kind === 'bridge' && inRect(x, y, w.room)) return currentZ + 3;
      for (const seg of w.walls) if (inRect(x, y, seg)) return currentZ + 3;
    }
  }
  return best;
}

export function deckIndexFor(z: number): number {
  let best = 0;
  for (let d = 0; d < DECK_Z.length; d++) if (z >= DECK_Z[d] - 0.9) best = d;
  return best;
}

/** Name of the room containing (x, y) on the walker's deck, or the deck name. */
export function placeName(x: number, y: number, currentZ: number): string {
  const deck = deckIndexFor(currentZ);
  for (const r of CRUISE_ROOMS) if (r.deck === deck && inRect(x, y, r)) return `${r.name} · ${DECK_NAMES[deck]}`;
  return `${Math.abs(y) > 8 ? 'Open deck' : 'Corridor'} · ${DECK_NAMES[deck]}`;
}

/** A safe standing spot on the promenade deck (used when boarding and when respawning after a fall). */
export const BOARDING_SPOT = { x: -4, y: 10.5, z: DECK_Z[0] };
