/**
 * Original vessel bodies (ferry, speedboat, cruise ship, buoys) from primitives. Local frame: +x forward, +y port,
 * +z up, z = 0 at the waterline.
 */
import { BodyPart } from '@/gameplay/journeys/bodies';
import { CRUISE_RAMPS, CRUISE_ROOMS, DECK_Z, POOL, roomWalls, SHIP_BEAM_M, SHIP_LENGTH_M } from './cruiseDecks';

export const FERRY_DECK_Z = 2.0;
export const FERRY_SEAT = { forward: -7, left: 1.8, up: FERRY_DECK_Z + 1.6, lookDeg: -70, label: 'Open deck, port side' };
export const FERRY_SEAT_BOW = { forward: 8.5, left: -1.5, up: FERRY_DECK_Z + 1.6, lookDeg: 20, label: 'Bow rail' };

export function ferryParts(): BodyPart[] {
  const parts: BodyPart[] = [
    { kind: 'box', size: [28, 8, 3.0], at: [0, 0, 0.1], color: '#1d3f66' },
    { kind: 'box', size: [5, 6, 2.6], at: [15.5, 0, 0.3], color: '#1d3f66', yawDeg: 0 },
    { kind: 'box', size: [28.5, 8.4, 0.4], at: [0, 0, FERRY_DECK_Z - 0.2], color: '#c9b79c' },
    { kind: 'box', size: [12, 6.2, 2.4], at: [1, 0, FERRY_DECK_Z + 1.2], color: '#f1f1ec' },
    { kind: 'box', size: [12.4, 6.6, 0.25], at: [1, 0, FERRY_DECK_Z + 2.5], color: '#2d6fb0' },
    { kind: 'box', size: [3.2, 2.2, 1.6], at: [4, 0, FERRY_DECK_Z + 3.4], color: '#f1f1ec' },
    { kind: 'cylinder', radius: 0.12, length: 4, at: [-4, 0, FERRY_DECK_Z + 4.4], axis: 'z', color: '#444' },
  ];
  for (const side of [1, -1]) {
    parts.push({ kind: 'box', size: [27, 0.08, 1.1], at: [0, side * 4.1, FERRY_DECK_Z + 0.55], color: '#e6e6e6' });
    parts.push({ kind: 'box', size: [10, 0.1, 1.0], at: [1, side * 3.15, FERRY_DECK_Z + 1.5], color: '#1b2a3a' });
    for (let k = 0; k < 4; k++) parts.push({ kind: 'box', size: [1.6, 0.5, 0.45], at: [-11 + k * 2.2, side * 2.6, FERRY_DECK_Z + 0.25], color: '#d9822b' });
  }
  parts.push({ kind: 'box', size: [0.08, 8.2, 1.1], at: [-13.5, 0, FERRY_DECK_Z + 0.55], color: '#e6e6e6' });
  return parts;
}

export function speedboatParts(): BodyPart[] {
  return [
    { kind: 'box', size: [6.4, 2.2, 0.9], at: [0, 0, 0.25], color: '#f2f2f2' },
    { kind: 'box', size: [1.6, 1.6, 0.8], at: [3.6, 0, 0.3], color: '#f2f2f2', yawDeg: 0 },
    { kind: 'box', size: [6.6, 2.4, 0.12], at: [0, 0, 0.72], color: '#9b5b2b' },
    { kind: 'box', size: [0.1, 1.8, 0.7], at: [1.2, 0, 1.1], color: '#8fc3e6' },
    { kind: 'box', size: [0.7, 0.6, 0.6], at: [0.2, 0.5, 1.0], color: '#20344d' },
    { kind: 'box', size: [0.7, 0.6, 0.6], at: [0.2, -0.5, 1.0], color: '#20344d' },
    { kind: 'box', size: [0.6, 0.7, 0.8], at: [-3.4, 0, 0.6], color: '#2c2c2c' },
    { kind: 'box', size: [6.4, 0.3, 0.3], at: [0, 1.2, 0.85], color: '#d8452e' },
    { kind: 'box', size: [6.4, 0.3, 0.3], at: [0, -1.2, 0.85], color: '#d8452e' },
  ];
}

export function buoyParts(): BodyPart[] {
  return [
    { kind: 'cylinder', radius: 0.7, length: 2.6, at: [0, 0, 0.9], axis: 'z', color: '#ff7a1a' },
    { kind: 'cylinder', radius: 0.06, length: 2.4, at: [0, 0, 3.2], axis: 'z', color: '#333' },
    { kind: 'box', size: [0.9, 0.05, 0.6], at: [0.45, 0, 4.0], color: '#ffd400' },
  ];
}

export function cruiseShipParts(): BodyPart[] {
  const L = SHIP_LENGTH_M, W = SHIP_BEAM_M;
  const parts: BodyPart[] = [
    { kind: 'box', size: [L - 20, W, 14], at: [-4, 0, 1.0], color: '#1c2f4a' },
    { kind: 'box', size: [22, W * 0.7, 13], at: [L / 2 - 16, 0, 0.6], color: '#1c2f4a', yawDeg: 22 },
    { kind: 'box', size: [22, W * 0.7, 13], at: [L / 2 - 16, 0, 0.6], color: '#1c2f4a', yawDeg: -22 },
    { kind: 'box', size: [L - 18, W + 0.6, 0.35], at: [-4, 0, DECK_Z[0] - 0.17], color: '#cdbf9c' },
    { kind: 'box', size: [L - 30, W - 1.5, 0.35], at: [-6, 0, DECK_Z[1] - 0.17], color: '#d6c9a5' },
    { kind: 'box', size: [L - 40, W - 3, 0.35], at: [-8, 0, DECK_Z[2] - 0.17], color: '#dccfab' },
    // Pool basin and water.
    { kind: 'box', size: [POOL.x1 - POOL.x0, POOL.y1 - POOL.y0, 0.3], at: [(POOL.x0 + POOL.x1) / 2, 0, DECK_Z[1] - POOL.depth - 0.15], color: '#3fa7d6' },
    // Funnel and mast.
    { kind: 'cylinder', radius: 3, topRadius: 2.4, length: 8, at: [-46, 0, DECK_Z[2] + 4], axis: 'z', color: '#c8443a' },
    { kind: 'cylinder', radius: 0.15, length: 10, at: [40, 0, DECK_Z[2] + 5], axis: 'z', color: '#444' },
  ];
  // Railings at deck edges.
  const rails: [number, number, number][] = [[L - 18, W + 0.6, DECK_Z[0]], [L - 30, W - 1.5, DECK_Z[1]], [L - 40, W - 3, DECK_Z[2]]];
  rails.forEach(([len, wid, z], i) => {
    const cx = [-4, -6, -8][i];
    for (const side of [1, -1]) parts.push({ kind: 'box', size: [len, 0.06, 1.1], at: [cx, (side * wid) / 2, z + 0.55], color: '#eaeaea' });
    parts.push({ kind: 'box', size: [0.06, wid, 1.1], at: [cx - len / 2, 0, z + 0.55], color: '#eaeaea' });
  });
  // Room walls and ceilings (rooms are 3 m high, ceilings are the next deck slab or a roof).
  for (const room of CRUISE_ROOMS) {
    const z = DECK_Z[room.deck];
    const h = room.kind === 'bridge' ? 3.6 : 2.9;
    const col = room.kind === 'bridge' ? '#f4f4f0' : room.kind === 'cabins' ? '#efe7d6' : '#f1ece0';
    if (room.kind === 'pool') continue;
    for (const w of roomWalls(room)) parts.push({ kind: 'box', size: [w.x1 - w.x0, w.y1 - w.y0, h], at: [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, z + h / 2], color: col });
    if (room.deck === DECK_Z.length - 1 || room.kind === 'bridge') parts.push({ kind: 'box', size: [room.x1 - room.x0 + 0.5, room.y1 - room.y0 + 0.5, 0.3], at: [(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, z + h + 0.15], color: '#cfd6dc' });
    // Furniture by kind.
    const cx = (room.x0 + room.x1) / 2, cy = (room.y0 + room.y1) / 2;
    if (room.kind === 'restaurant') for (let i = 0; i < 4; i++) for (const side of [1, -1]) parts.push({ kind: 'cylinder', radius: 0.9, length: 0.08, at: [room.x0 + 8 + i * 10, side * 4, z + 0.75], axis: 'z', color: '#ffffff' }, { kind: 'cylinder', radius: 0.12, length: 0.75, at: [room.x0 + 8 + i * 10, side * 4, z + 0.37], axis: 'z', color: '#5a4632' });
    if (room.kind === 'theatre') { parts.push({ kind: 'box', size: [8, 12, 0.5], at: [room.x0 + 6, cy, z + 0.25], color: '#4a1f1f' }); for (let r = 0; r < 5; r++) parts.push({ kind: 'box', size: [0.6, 12, 0.9], at: [room.x0 + 14 + r * 4, cy, z + 0.45], color: '#7a2e2e' }); }
    if (room.kind === 'lounge') { parts.push({ kind: 'box', size: [1.6, 1.4, 1.0], at: [cx + 6, cy + 5, z + 0.5], color: '#111' }); for (let i = 0; i < 3; i++) parts.push({ kind: 'box', size: [2.2, 0.8, 0.8], at: [cx - 6 + i * 4, cy - 5, z + 0.4], color: '#6b3d8f' }); }
    if (room.kind === 'cabins') for (let i = 0; i < 6; i++) for (const side of [1, -1]) parts.push({ kind: 'box', size: [0.2, 7.5, 2.8], at: [room.x0 + 3 + i * 6, side * 4.2, z + 1.4], color: '#e2d8c3' });
    if (room.kind === 'viewing') for (let i = 0; i < 5; i++) for (const side of [1, -1]) parts.push({ kind: 'box', size: [1.8, 0.7, 0.5], at: [room.x0 + 6 + i * 7, side * 6, z + 0.35], color: '#3d6f9e' });
    if (room.kind === 'bridge') parts.push({ kind: 'box', size: [0.2, room.y1 - room.y0 - 1, 1.4], at: [room.x1 - 0.5, cy, z + 2.2], color: '#1b2a3a' });
  }
  // Ramps (stairs) as sloped slabs approximated by steps, with side rails.
  for (const r of CRUISE_RAMPS) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = r.x0 + ((r.x1 - r.x0) * i) / n, x1 = r.x0 + ((r.x1 - r.x0) * (i + 1)) / n;
      const z = r.zFrom + ((r.zTo - r.zFrom) * (i + 0.5)) / n;
      parts.push({ kind: 'box', size: [x1 - x0, r.y1 - r.y0, 0.25], at: [(x0 + x1) / 2, 0, z - 0.12], color: '#b8a98a' });
    }
    for (const side of [1, -1]) parts.push({ kind: 'box', size: [r.x1 - r.x0, 0.06, 1.0], at: [(r.x0 + r.x1) / 2, side * (r.y1 + 0.2), (r.zFrom + r.zTo) / 2 + 0.5], color: '#eaeaea' });
  }
  // Sunbeds around the pool.
  for (let i = 0; i < 6; i++) for (const side of [1, -1]) parts.push({ kind: 'box', size: [1.9, 0.7, 0.35], at: [POOL.x0 + 2 + i * 4, side * 7, DECK_Z[1] + 0.18], color: '#f2f2f2' });
  return parts;
}
