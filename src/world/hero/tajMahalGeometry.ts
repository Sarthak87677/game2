/**
 * Taj Mahal hero — pure geometry and walkability (no Cesium). Everything is expressed in a local east-north-up frame
 * (metres) whose origin is the centre of the mausoleum at ground level; +y is north (towards the Yamuna), −y runs
 * south through the charbagh to the Great Gate.
 *
 * NOTE — this is a PROCEDURAL HERO RECONSTRUCTION at the real position: the massing follows public reference
 * dimensions (plinth ≈ 95 m, mausoleum ≈ 57 m, dome ≈ 73 m, garden ≈ 300 m, gate ≈ 365 m south) but every detail —
 * the arches, chhatris, gardens, trees and the central chamber — is an approximate original interpretation. It is
 * labelled as such in the world and in the entry overlay. Nothing here is surveyed or copied from a licensed model.
 */
import { MeshBuilder, type MeshData } from '@/world/render';
import { addCone, addEllipsoid } from '@/world/render/geometry/shapes';
import type { RGB } from '@/world/render/geometry/colour';
import { addColumn, addPyramidFrustum, addRotatedBox, tintColour } from '@/world/landmarks/landmarkShapes';
import { Rng } from '@/util/hash';

/** Real position of the mausoleum centre (approximate, ±50 m) and the streaming radius. */
export const TAJ_MAHAL_CENTRE = { lat: 27.1751, lon: 78.0421 } as const;
export const TAJ_STREAM_RADIUS_M = 6000;

/** Layout levels (metres above the local base, which sits on the measured terrain). */
export const TAJ = {
  garden: 1.0, // lawn slab; slightly raised so small terrain bumps stay below it
  terrace: 2.5, // red sandstone riverfront terrace
  plinth: 8.0, // white marble platform under the mausoleum
  pathRise: 0.4,
  plinthHalf: 47.5,
  bodyHalf: 28.5,
  chamfer: 8,
  bodyHeight: 30, // parapet above the plinth
  domeTop: 73, // finial above the plinth
  chamberRadius: 12, // inradius of the octagonal central chamber
  corridorHalf: 4.5,
  minaretOffset: 41.5,
  minaretHeight: 40,
  terraceHalfX: 150,
  terraceSouth: -55,
  terraceNorth: 60,
  gardenSouth: -355,
  gateY: -365,
  gateHalfX: 22.5,
  gateHalfY: 17,
  gateHeight: 26,
  gatePassageHalf: 5,
  forecourtSouth: -420,
  forecourtHalfX: 60,
  mosqueX: 115,
  mosqueHalfX: 11.5,
  mosqueHalfY: 28,
  mosqueHeight: 20,
  wallHeight: 6,
  tankHalf: 9,
  poolHalf: 3,
  poolNorth: -70,
  poolSouth: -340,
  centreY: -205,
} as const;

export const TAJ_COLOURS = {
  marble: [236, 232, 222] as RGB,
  marbleShade: [214, 208, 196] as RGB,
  sandstone: [152, 86, 62] as RGB,
  sandstoneLight: [184, 128, 96] as RGB,
  path: [190, 156, 122] as RGB,
  lawn: [96, 138, 60] as RGB,
  water: [44, 86, 96] as RGB,
  recess: [58, 50, 46] as RGB,
  canopy: [54, 96, 46] as RGB,
  cypress: [36, 72, 42] as RGB,
  trunk: [92, 66, 46] as RGB,
  interior: [222, 216, 204] as RGB,
} as const;

const SOLID = 255;

/** Vertical prism over a convex polygon (counter-clockwise ring) with a fan-capped top. */
function prism(b: MeshBuilder, ring: readonly (readonly [number, number])[], z0: number, z1: number, c: RGB): void {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], e = ring[(i + 1) % n];
    const nx = e[1] - a[1], ny = -(e[0] - a[0]);
    const len = Math.hypot(nx, ny) || 1;
    const shade = 0.78 + 0.22 * Math.max(0, (nx / len) * 0.6 + (ny / len) * 0.4);
    const col = tintColour(c, shade);
    const i0 = b.vertex(a[0], a[1], z0, nx, ny, 0, col, SOLID, -1, -1, 0);
    const i1 = b.vertex(e[0], e[1], z0, nx, ny, 0, col, SOLID, -1, -1, 0);
    const i2 = b.vertex(e[0], e[1], z1, nx, ny, 0, col, SOLID, -1, -1, 0);
    const i3 = b.vertex(a[0], a[1], z1, nx, ny, 0, col, SOLID, -1, -1, 0);
    b.quad(i0, i1, i2, i3);
  }
  const top = tintColour(c, 0.92);
  const centre = b.vertex(ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n, z1, 0, 0, 1, top, SOLID, -1, -1, 0);
  for (let i = 0; i < n; i++) {
    const a = ring[i], e = ring[(i + 1) % n];
    b.triangle(centre, b.vertex(a[0], a[1], z1, 0, 0, 1, top, SOLID, -1, -1, 0), b.vertex(e[0], e[1], z1, 0, 0, 1, top, SOLID, -1, -1, 0));
  }
}

/** Axis-aligned box helper (x0..x1, y0..y1). */
function box(b: MeshBuilder, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: RGB): void {
  addRotatedBox(b, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z0, z1, 0, c);
}

function chamferedSquare(half: number, chamfer: number): [number, number][] {
  const h = half, k = half - chamfer;
  return [[h, -k], [h, k], [k, h], [-k, h], [-h, k], [-h, -k], [-k, -h], [k, -h]];
}

function octagon(inradius: number): [number, number][] {
  const r = inradius / Math.cos(Math.PI / 8);
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return pts;
}

/** Small domed kiosk on columns (chhatri). */
function chhatri(b: MeshBuilder, x: number, y: number, z: number, r: number, h: number, c: RGB): void {
  addRotatedBox(b, x, y, r * 2.2, r * 2.2, z, z + h * 0.08, 0, tintColour(c, 0.9));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addColumn(b, x + sx * r * 0.8, y + sy * r * 0.8, z + h * 0.08, z + h * 0.6, Math.max(0.25, r * 0.12), c);
  addRotatedBox(b, x, y, r * 2.3, r * 2.3, z + h * 0.6, z + h * 0.68, 0, tintColour(c, 0.9));
  addEllipsoid(b, x, y, z + h * 0.68, r, r, h * 0.3, 12, 6, () => c, 0, SOLID);
  addCone(b, x, y, z + h * 0.96, 0.25, z + h * 1.1, 0.05, 6, () => tintColour(c, 0.7), 0, 0, false, SOLID);
}

/** Iwan: a rectangular portal frame with a dark pointed-arch recess, standing proud of a face. */
function iwan(b: MeshBuilder, cx: number, cy: number, facing: 'n' | 's' | 'e' | 'w', width: number, height: number, depth: number, zBase: number, c: RGB): void {
  const rot = facing === 'n' ? 0 : facing === 's' ? Math.PI : facing === 'e' ? -Math.PI / 2 : Math.PI / 2;
  const dx = facing === 'e' ? 1 : facing === 'w' ? -1 : 0, dy = facing === 'n' ? 1 : facing === 's' ? -1 : 0;
  // Frame.
  addRotatedBox(b, cx + dx * depth / 2, cy + dy * depth / 2, width, depth, zBase, zBase + height, rot, c);
  // Recess: a dark slab just in front of the frame face, arch-shaped by a box plus a half-ellipsoid top.
  const rw = width * 0.55, rh = height * 0.66;
  const fx = cx + dx * (depth + 0.15), fy = cy + dy * (depth + 0.15);
  addRotatedBox(b, fx, fy, rw, 0.3, zBase + 0.5, zBase + rh * 0.72, rot, TAJ_COLOURS.recess);
  addEllipsoid(b, fx, fy, zBase + rh * 0.72, facing === 'n' || facing === 's' ? rw / 2 : 0.15, facing === 'n' || facing === 's' ? 0.15 : rw / 2, rh * 0.28, 10, 4, () => TAJ_COLOURS.recess, 0, SOLID);
}

function minaret(b: MeshBuilder, x: number, y: number, z: number, h: number, c: RGB): void {
  addRotatedBox(b, x, y, 9, 9, z, z + 0.8, 0, tintColour(c, 0.92));
  const sections = 3;
  for (let i = 0; i < sections; i++) {
    const z0 = z + 0.8 + (i / sections) * h * 0.86, z1 = z + 0.8 + ((i + 1) / sections) * h * 0.86;
    const r0 = 3.2 - i * 0.35, r1 = 3.0 - i * 0.35;
    addCone(b, x, y, z0, r0, z1, r1, 12, () => c, 0, 0, false, SOLID);
    // Balcony ring at the top of each section.
    addCone(b, x, y, z1 - 0.6, r1 + 1.1, z1, r1 + 1.1, 12, () => tintColour(c, 0.85), 0, 0, true, SOLID);
  }
  chhatri(b, x, y, z + 0.8 + h * 0.86, 2.6, h * 0.14 / 1.1, c);
}

function tree(b: MeshBuilder, x: number, y: number, z: number, h: number, rng: Rng): void {
  addCone(b, x, y, z, 0.35, z + h * 0.35, 0.22, 5, () => TAJ_COLOURS.trunk, 0, 0, false, SOLID);
  addEllipsoid(b, x, y, z + h * 0.62, h * 0.32, h * 0.32, h * 0.3, 8, 5, () => tintColour(TAJ_COLOURS.canopy, rng.range(0.85, 1.1)), 0.15, SOLID);
}

function cypress(b: MeshBuilder, x: number, y: number, z: number, h: number): void {
  addCone(b, x, y, z, 0.25, z + 0.8, 0.2, 5, () => TAJ_COLOURS.trunk, 0, 0, false, SOLID);
  addCone(b, x, y, z + 0.6, h * 0.14, z + h, 0.1, 7, () => TAJ_COLOURS.cypress, 0, 0.12, false, SOLID);
}

/** Terraces, garden, paths, pool, tank, enclosure walls and the forecourt. */
export function buildTajGround(): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const T = TAJ;
  // Riverfront sandstone terrace and its parapet on the Yamuna side (a railing: no unguarded edges).
  box(b, -T.terraceHalfX, T.terraceSouth, T.terraceHalfX, T.terraceNorth, 0, T.terrace, TAJ_COLOURS.sandstone);
  box(b, -T.terraceHalfX, T.terraceNorth - 1, T.terraceHalfX, T.terraceNorth, T.terrace, T.terrace + 1.1, TAJ_COLOURS.sandstoneLight);
  for (const sx of [-1, 1]) box(b, sx * T.terraceHalfX - (sx > 0 ? 1 : 0), T.terraceSouth, sx * T.terraceHalfX + (sx > 0 ? 0 : 1), T.terraceNorth, T.terrace, T.terrace + 1.1, TAJ_COLOURS.sandstoneLight);
  // Marble plinth with a stair ramp on the south side and a low balustrade around the edge.
  box(b, -T.plinthHalf, -T.plinthHalf, T.plinthHalf, T.plinthHalf, T.terrace, T.plinth, TAJ_COLOURS.marble);
  addPyramidFrustum(b, 0, -T.plinthHalf - 4, T.terrace, 6, T.plinth, 6, TAJ_COLOURS.marbleShade);
  for (const [x0, y0, x1, y1] of [[-T.plinthHalf, T.plinthHalf - 0.6, T.plinthHalf, T.plinthHalf], [-T.plinthHalf, -T.plinthHalf, -6.5, -T.plinthHalf + 0.6], [6.5, -T.plinthHalf, T.plinthHalf, -T.plinthHalf + 0.6], [-T.plinthHalf, -T.plinthHalf, -T.plinthHalf + 0.6, T.plinthHalf], [T.plinthHalf - 0.6, -T.plinthHalf, T.plinthHalf, T.plinthHalf]]) {
    box(b, x0, y0, x1, y1, T.plinth, T.plinth + 1.0, TAJ_COLOURS.marbleShade);
  }
  // Garden slab, quadrant lawns are the slab itself; paths are raised strips.
  box(b, -T.terraceHalfX, T.gardenSouth, T.terraceHalfX, T.terraceSouth, 0, T.garden, TAJ_COLOURS.lawn);
  const pathTop = T.garden + T.pathRise;
  box(b, -9, T.gardenSouth, 9, T.terraceSouth, T.garden, pathTop, TAJ_COLOURS.path);
  box(b, -T.terraceHalfX, T.centreY - 6, T.terraceHalfX, T.centreY + 6, T.garden, pathTop, TAJ_COLOURS.path);
  for (const x of [-75, 75]) box(b, x - 3, T.gardenSouth, x + 3, T.terraceSouth, T.garden, pathTop, TAJ_COLOURS.path);
  for (const y of [-130, -280]) box(b, -T.terraceHalfX, y - 3, T.terraceHalfX, y + 3, T.garden, pathTop, TAJ_COLOURS.path);
  // Ramp from the garden path up to the terrace.
  addPyramidFrustum(b, 0, T.terraceSouth - 2, pathTop, 6, T.terrace, 6, TAJ_COLOURS.path);
  // Long reflecting pool (sunk into the central walkway) and the raised marble tank at the crossing.
  box(b, -T.poolHalf - 0.5, T.poolSouth, T.poolHalf + 0.5, T.poolNorth, pathTop, pathTop + 0.3, TAJ_COLOURS.marbleShade);
  box(b, -T.poolHalf, T.poolSouth, T.poolHalf, T.poolNorth, T.garden - 0.5, pathTop + 0.05, TAJ_COLOURS.water);
  box(b, -T.tankHalf, T.centreY - T.tankHalf, T.tankHalf, T.centreY + T.tankHalf, pathTop, T.garden + 1.0, TAJ_COLOURS.marble);
  box(b, -T.tankHalf + 1.5, T.centreY - T.tankHalf + 1.5, T.tankHalf - 1.5, T.centreY + T.tankHalf - 1.5, T.garden + 1.0, T.garden + 1.05, TAJ_COLOURS.water);
  // Enclosure walls east, west and south (either side of the gate).
  for (const sx of [-1, 1]) box(b, sx * T.terraceHalfX - (sx > 0 ? 2 : 0), T.gardenSouth, sx * T.terraceHalfX + (sx > 0 ? 0 : 2), T.terraceSouth, T.garden, T.garden + T.wallHeight, TAJ_COLOURS.sandstone);
  box(b, -T.terraceHalfX, T.gardenSouth - 1, -T.gateHalfX, T.gardenSouth + 1, T.garden, T.garden + T.wallHeight, TAJ_COLOURS.sandstone);
  box(b, T.gateHalfX, T.gardenSouth - 1, T.terraceHalfX, T.gardenSouth + 1, T.garden, T.garden + T.wallHeight, TAJ_COLOURS.sandstone);
  // Forecourt south of the gate.
  box(b, -T.forecourtHalfX, T.forecourtSouth, T.forecourtHalfX, T.gateY - T.gateHalfY, 0, T.garden, TAJ_COLOURS.path);
  return b.build();
}

/** Mausoleum: chamfered body with iwans, drum and onion dome, four chhatris and the four minarets. */
export function buildTajMausoleum(): MeshData {
  const b = new MeshBuilder(8192, 16384);
  const T = TAJ, c = TAJ_COLOURS.marble;
  const z0 = T.plinth;
  prism(b, chamferedSquare(T.bodyHalf, T.chamfer), z0, z0 + T.bodyHeight, c);
  // Four great iwans and the smaller arches on the chamfered corners.
  iwan(b, 0, T.bodyHalf, 'n', 20, T.bodyHeight * 1.08, 1.5, z0, c);
  iwan(b, 0, -T.bodyHalf, 's', 20, T.bodyHeight * 1.08, 1.5, z0, c);
  iwan(b, T.bodyHalf, 0, 'e', 20, T.bodyHeight * 1.08, 1.5, z0, c);
  iwan(b, -T.bodyHalf, 0, 'w', 20, T.bodyHeight * 1.08, 1.5, z0, c);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const k = T.bodyHalf - T.chamfer / 2;
    for (const zz of [z0 + 1, z0 + T.bodyHeight * 0.52]) {
      addRotatedBox(b, sx * k, sy * k, 5, 0.3, zz, zz + T.bodyHeight * 0.4, Math.atan2(sy, sx) + Math.PI / 2, TAJ_COLOURS.recess);
    }
  }
  // Drum and onion dome with finial.
  const roof = z0 + T.bodyHeight;
  addCone(b, 0, 0, roof, 11.5, roof + 7, 11.5, 24, () => tintColour(c, 0.97), 0, 0, false, SOLID);
  addCone(b, 0, 0, roof + 7, 11.5, roof + 9, 13, 24, () => c, 0, 0, false, SOLID);
  addEllipsoid(b, 0, 0, roof + 20, 13, 13, 14.5, 24, 12, (_nx, _ny, nz) => tintColour(c, nz > 0.3 ? 1.03 : 0.98), 0, SOLID);
  addCone(b, 0, 0, roof + 33.5, 2.2, roof + 36, 0.8, 10, () => tintColour(c, 0.95), 0, 0, false, SOLID);
  addCone(b, 0, 0, roof + 36, 0.8, z0 + T.domeTop, 0.1, 8, () => [214, 176, 90], 0, 0, false, SOLID);
  // Four chhatris around the dome.
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) chhatri(b, sx * 17, sy * 17, roof, 4.2, 12, c);
  // Corner pinnacles on the parapet.
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    addCone(b, sx * (T.bodyHalf - 2), sy * (T.bodyHalf - T.chamfer - 1), roof, 0.6, roof + 4, 0.1, 6, () => c, 0, 0, false, SOLID);
    addCone(b, sx * (T.bodyHalf - T.chamfer - 1), sy * (T.bodyHalf - 2), roof, 0.6, roof + 4, 0.1, 6, () => c, 0, 0, false, SOLID);
  }
  // Minarets at the plinth corners.
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) minaret(b, sx * T.minaretOffset, sy * T.minaretOffset, z0, T.minaretHeight, c);
  return b.build();
}

/** The Great Gate (south) and the mosque (west) and jawab (east) on the riverfront terrace. */
export function buildTajGateAndMosques(): MeshData {
  const b = new MeshBuilder(8192, 16384);
  const T = TAJ, s = TAJ_COLOURS.sandstone, m = TAJ_COLOURS.marble;
  // Great Gate: sandstone block with a taller central pishtaq on both faces (the passage runs through it) and
  // octagonal corner turrets topped by chhatris, plus a row of small domed kiosks along the top.
  const gz = T.garden;
  for (const sx of [-1, 1]) prism(b, chamferedSquare(T.gateHalfX, 0).map(([x, y]) => [x * 0.36 + sx * T.gateHalfX * 0.64, y] as [number, number]), gz, gz + T.gateHeight, s);
  box(b, -T.gateHalfX * 0.36, T.gateY - T.gateHalfY, T.gateHalfX * 0.36, T.gateY + T.gateHalfY, gz + T.gateHeight * 0.55, gz + T.gateHeight * 1.12, s);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    addCone(b, sx * (T.gateHalfX - 3), T.gateY + sy * (T.gateHalfY - 3), gz, 3.2, gz + T.gateHeight * 1.15, 3, 8, () => tintColour(s, 0.95), 0, 0, false, SOLID);
    chhatri(b, sx * (T.gateHalfX - 3), T.gateY + sy * (T.gateHalfY - 3), gz + T.gateHeight * 1.15, 2.6, 6, m);
  }
  for (const sy of [-1, 1]) {
    // Pishtaq frame and dark arch (the arch is the passage: walkable between the two frames).
    const fy = T.gateY + sy * T.gateHalfY;
    addRotatedBox(b, 0, fy + sy * 0.6, 18, 1.2, gz, gz + T.gateHeight * 1.1, 0, tintColour(s, 1.05));
    addRotatedBox(b, 0, fy + sy * 1.3, 10, 0.3, gz + 0.3, gz + T.gateHeight * 0.55, 0, TAJ_COLOURS.recess);
    addEllipsoid(b, 0, fy + sy * 1.3, gz + T.gateHeight * 0.55, 5, 0.15, T.gateHeight * 0.22, 10, 4, () => TAJ_COLOURS.recess, 0, SOLID);
    for (let i = 0; i < 11; i++) {
      const x = -T.gateHalfX + 4 + (i / 10) * (T.gateHalfX * 2 - 8);
      if (Math.abs(x) < 9) continue;
      addEllipsoid(b, x, fy - sy * 2.5, gz + T.gateHeight + 1.2, 1.4, 1.4, 1.3, 8, 4, () => m, 0, SOLID);
    }
  }
  // Mosque (west) and jawab (east): rectangular sandstone halls with three marble domes and corner turrets.
  for (const sx of [-1, 1]) {
    const cx = sx * T.mosqueX;
    box(b, cx - T.mosqueHalfX, -T.mosqueHalfY, cx + T.mosqueHalfX, T.mosqueHalfY, T.terrace, T.terrace + T.mosqueHeight, s);
    // Central pishtaq facing the mausoleum.
    iwan(b, cx - sx * T.mosqueHalfX, 0, sx > 0 ? 'w' : 'e', 16, T.mosqueHeight * 1.15, 1.2, T.terrace, s);
    for (let i = -1; i <= 1; i++) {
      const r = i === 0 ? 8 : 6.5;
      const y = i * 19;
      addCone(b, cx, y, T.terrace + T.mosqueHeight, r * 0.85, T.terrace + T.mosqueHeight + 3, r * 0.85, 16, () => tintColour(s, 0.95), 0, 0, false, SOLID);
      addEllipsoid(b, cx, y, T.terrace + T.mosqueHeight + 3 + r * 0.9, r, r, r * 1.0, 16, 8, () => m, 0, SOLID);
      addCone(b, cx, y, T.terrace + T.mosqueHeight + 3 + r * 1.9, 0.6, T.terrace + T.mosqueHeight + 3 + r * 1.9 + 3, 0.1, 6, () => [214, 176, 90], 0, 0, false, SOLID);
    }
    for (const sy of [-1, 1]) for (const ex of [-1, 1]) chhatri(b, cx + ex * (T.mosqueHalfX - 2), sy * (T.mosqueHalfY - 2.5), T.terrace + T.mosqueHeight, 2.2, 6, m);
  }
  return b.build();
}

/** Cypress rows along the pool and broad trees in the lawns (deterministic). */
export function buildTajTrees(): MeshData {
  const b = new MeshBuilder(8192, 16384);
  const T = TAJ;
  const rng = new Rng(20260907);
  for (let y = T.poolSouth + 6; y < T.poolNorth - 4; y += 12) for (const sx of [-1, 1]) cypress(b, sx * 9.5, y, T.garden + T.pathRise, 7 + rng.range(-1, 1.5));
  // Broad trees: a loose grid inside each of the sixteen lawn plots, keeping clear of paths.
  for (const qx of [-1, 1]) for (const qy of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
    const x0 = qx > 0 ? 12 + px * 66 : -78 + px * 66;
    const y0 = T.gardenSouth + 6 + (qy * 150) + py * 75;
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) tree(b, x0 + 6 + rng.range(0, 52), y0 + 6 + rng.range(0, 60), T.garden, 7 + rng.range(0, 5), rng);
  }
  return b.build();
}

/** Approximate central chamber: octagonal room, southern passage, screen around the cenotaph blocks, inner dome. */
export function buildTajInterior(): MeshData {
  const b = new MeshBuilder(4096, 8192);
  const T = TAJ, c = TAJ_COLOURS.interior;
  const z0 = T.plinth, wallH = 24;
  const ring = octagon(T.chamberRadius);
  // Inward-facing wall panels (south panel omitted for the passage); normals point to the room centre.
  for (let i = 0; i < 8; i++) {
    const a = ring[i], e = ring[(i + 1) % 8];
    const mx = (a[0] + e[0]) / 2, my = (a[1] + e[1]) / 2;
    if (my < -T.chamberRadius * 0.9 && Math.abs(mx) < 1) continue; // south opening
    const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
    addRotatedBox(b, mx, my, len, 0.8, z0, z0 + wallH, Math.atan2(e[1] - a[1], e[0] - a[0]), tintColour(c, 0.95));
    // A dark inset "niche" on each panel.
    addRotatedBox(b, mx * 0.96, my * 0.96, len * 0.4, 0.2, z0 + 1, z0 + wallH * 0.45, Math.atan2(e[1] - a[1], e[0] - a[0]), TAJ_COLOURS.recess);
  }
  // Passage walls from the south door to the chamber.
  for (const sx of [-1, 1]) box(b, sx * T.corridorHalf, -T.bodyHalf, sx * (T.corridorHalf + 0.8), -T.chamberRadius + 1, z0, z0 + 12, tintColour(c, 0.9));
  // Floor inlay band and the octagonal screen (jali) around two plain cenotaph blocks.
  prism(b, octagon(T.chamberRadius - 0.2), z0 - 0.05, z0 + 0.05, tintColour(c, 0.85));
  const screen = octagon(5.5);
  for (let i = 0; i < 8; i++) {
    const a = screen[i], e = screen[(i + 1) % 8];
    const mx = (a[0] + e[0]) / 2, my = (a[1] + e[1]) / 2;
    const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const rot = Math.atan2(e[1] - a[1], e[0] - a[0]);
    addRotatedBox(b, mx, my, len, 0.25, z0, z0 + 0.5, rot, c);
    addRotatedBox(b, mx, my, len, 0.25, z0 + 1.9, z0 + 2.1, rot, c);
    const posts = Math.max(2, Math.round(len / 0.6));
    for (let k = 0; k <= posts; k++) {
      const t = k / posts - 0.5;
      addColumn(b, mx + Math.cos(rot) * t * len, my + Math.sin(rot) * t * len, z0 + 0.5, z0 + 1.9, 0.06, tintColour(c, 1.02));
    }
  }
  addRotatedBox(b, 0.9, 0.2, 1.6, 3.0, z0, z0 + 1.0, 0, tintColour(c, 0.97));
  addRotatedBox(b, -1.1, 0.4, 1.4, 2.7, z0, z0 + 0.9, 0, tintColour(c, 0.97));
  // Inner dome seen from below.
  addEllipsoid(b, 0, 0, z0 + wallH, T.chamberRadius + 0.5, T.chamberRadius + 0.5, 9, 20, 8, (_nx, _ny, nz) => tintColour(c, 0.8 + 0.2 * Math.max(0, nz)), 0, SOLID);
  return b.build();
}

export interface TajMeshes { ground: MeshData; mausoleum: MeshData; gateAndMosques: MeshData; trees: MeshData; interior: MeshData }

export function buildTajMahalMeshes(): TajMeshes {
  return { ground: buildTajGround(), mausoleum: buildTajMausoleum(), gateAndMosques: buildTajGateAndMosques(), trees: buildTajTrees(), interior: buildTajInterior() };
}

function inOctagon(x: number, y: number, inradius: number): boolean {
  return Math.abs(x) <= inradius && Math.abs(y) <= inradius && Math.abs(x) + Math.abs(y) <= inradius * Math.SQRT2;
}

/**
 * Walkable surface height (metres above the local base) at a local point, or null outside the complex. Solid bodies
 * (mausoleum walls, minarets, mosque, gate roof, enclosure walls) return their top so the walker's wall rule blocks
 * them; the mausoleum's central chamber and its south passage return the floor so the interior is reachable.
 */
export function tajHeightAt(x: number, y: number): number | null {
  const T = TAJ;
  const ax = Math.abs(x), ay = Math.abs(y);
  // Mausoleum body (chamfered square) with the hollow chamber and passage.
  if (ax <= T.bodyHalf && ay <= T.bodyHalf && ax + ay <= 2 * T.bodyHalf - T.chamfer) {
    if (inOctagon(x, y, T.chamberRadius) || (ax <= T.corridorHalf && y <= 0 && y >= -T.bodyHalf - 0.5)) return T.plinth;
    return T.plinth + T.bodyHeight;
  }
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (Math.hypot(x - sx * T.minaretOffset, y - sy * T.minaretOffset) <= 4.5) return T.plinth + T.minaretHeight;
  }
  if (ax <= T.plinthHalf && ay <= T.plinthHalf) return T.plinth;
  // South stair ramp up to the plinth.
  if (ax <= 6 && y < -T.plinthHalf && y >= -T.plinthHalf - 8) return T.terrace + (T.plinth - T.terrace) * (1 - (-T.plinthHalf - y) / 8);
  // Mosque and jawab bodies.
  if (Math.abs(ax - T.mosqueX) <= T.mosqueHalfX && ay <= T.mosqueHalfY) return T.terrace + T.mosqueHeight;
  if (ax <= T.terraceHalfX && y >= T.terraceSouth && y <= T.terraceNorth) return T.terrace;
  // Ramp from the garden path onto the terrace.
  if (ax <= 6 && y < T.terraceSouth && y >= T.terraceSouth - 4) return T.garden + T.pathRise + (T.terrace - T.garden - T.pathRise) * (1 - (T.terraceSouth - y) / 4);
  // Great Gate: passage through the middle, roof elsewhere.
  if (ax <= T.gateHalfX && Math.abs(y - T.gateY) <= T.gateHalfY) return ax <= T.gatePassageHalf ? T.garden : T.garden + T.gateHeight;
  // Enclosure walls.
  if (y >= T.gardenSouth && y <= T.terraceSouth && ax >= T.terraceHalfX - 2 && ax <= T.terraceHalfX) return T.garden + T.wallHeight;
  if (Math.abs(y - T.gardenSouth) <= 1 && ax > T.gateHalfX && ax <= T.terraceHalfX) return T.garden + T.wallHeight;
  if (ax <= T.terraceHalfX && y >= T.gardenSouth && y < T.terraceSouth) {
    // Garden: tank, pool, raised paths, lawns.
    if (ax <= T.tankHalf && Math.abs(y - T.centreY) <= T.tankHalf) return T.garden + 1.0;
    if (ax <= T.poolHalf && y >= T.poolSouth && y <= T.poolNorth) return T.garden - 0.5;
    if (ax <= 9 || Math.abs(y - T.centreY) <= 6 || Math.abs(ax - 75) <= 3 || Math.abs(y + 130) <= 3 || Math.abs(y + 280) <= 3) return T.garden + T.pathRise;
    return T.garden;
  }
  if (ax <= T.forecourtHalfX && y >= T.forecourtSouth && y < T.gateY - T.gateHalfY) return T.garden;
  return null;
}

/** Local coordinates of notable spots (metres from the mausoleum centre). */
export const TAJ_SPOTS = {
  southDoor: { x: 0, y: -TAJ.bodyHalf - 3 },
  chamber: { x: 0, y: -6 },
  plinthSouthEdge: { x: 0, y: -TAJ.plinthHalf + 4 },
  gatePassageSouth: { x: 0, y: TAJ.gateY - TAJ.gateHalfY - 6 },
  gatePassageNorth: { x: 0, y: TAJ.gateY + TAJ.gateHalfY + 6 },
  tank: { x: 0, y: TAJ.centreY - 14 },
} as const;
