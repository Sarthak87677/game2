import type { VehicleKind } from '@/gameplay/vehicles/catalog';

/**
 * Pure layout of the generated showroom in local metres (x forward = towards the glass front, y left, z up; origin at
 * the centre of the display floor). Rendered by ShowroomSystem; unit-tested for consistency. Every showroom is an
 * ORIGINAL design — not any dealer's real interior.
 */
export interface Block { x: number; y: number; z: number; l: number; w: number; h: number; colour: string; translucent?: boolean; id?: string }
export interface Plinth { x: number; y: number; kind: VehicleKind; headingDeg: number }
export interface Stand { x: number; y: number; kind: VehicleKind }

export interface ShowroomLayout {
  floor: { l: number; w: number };
  blocks: Block[];
  plinths: Plinth[];
  stands: Stand[];
  reception: { x: number; y: number };
  workshop: { x: number; y: number; kind: VehicleKind };
  /** Test-drive bay outside the exit (local metres) and the heading a spawned vehicle faces. */
  testDrive: { x: number; y: number; headingLocalDeg: number };
  parking: { x: number; y: number }[];
  labels: { x: number; y: number; z: number; text: string }[];
}

export const PLINTH_HEIGHT_M = 0.28;
const FLOOR_L = 34;
const FLOOR_W = 24;
const WALL_H = 5.2;

export function buildShowroomLayout(display: VehicleKind[]): ShowroomLayout {
  const blocks: Block[] = [];
  const floor = { l: FLOOR_L, w: FLOOR_W };
  blocks.push({ x: 0, y: 0, z: 0.1, l: FLOOR_L, w: FLOOR_W, h: 0.2, colour: '#d8d5cf', id: 'floor' });
  // Roof slab and back/side walls; the front (positive x) is glass.
  blocks.push({ x: 0, y: 0, z: WALL_H + 0.15, l: FLOOR_L, w: FLOOR_W, h: 0.3, colour: '#3b3f45', id: 'roof' });
  blocks.push({ x: -FLOOR_L / 2 + 0.15, y: 0, z: WALL_H / 2 + 0.2, l: 0.3, w: FLOOR_W, h: WALL_H, colour: '#eceae4' });
  blocks.push({ x: 0, y: FLOOR_W / 2 - 0.15, z: WALL_H / 2 + 0.2, l: FLOOR_L, w: 0.3, h: WALL_H, colour: '#eceae4' });
  blocks.push({ x: 0, y: -FLOOR_W / 2 + 0.15, z: WALL_H / 2 + 0.2, l: FLOOR_L, w: 0.3, h: WALL_H, colour: '#eceae4' });
  // Glass front with a 4 m opening in the middle (the entrance) and mullions.
  const gw = (FLOOR_W - 4) / 2;
  blocks.push({ x: FLOOR_L / 2 - 0.1, y: 2 + gw / 2, z: WALL_H / 2 + 0.2, l: 0.12, w: gw, h: WALL_H, colour: '#7fb0d8', translucent: true });
  blocks.push({ x: FLOOR_L / 2 - 0.1, y: -2 - gw / 2, z: WALL_H / 2 + 0.2, l: 0.12, w: gw, h: WALL_H, colour: '#7fb0d8', translucent: true });
  blocks.push({ x: FLOOR_L / 2 - 0.1, y: 0, z: WALL_H - 0.4, l: 0.16, w: 4.4, h: 1.0, colour: '#3b3f45' });
  for (const y of [2, -2, FLOOR_W / 2, -FLOOR_W / 2]) blocks.push({ x: FLOOR_L / 2 - 0.1, y, z: WALL_H / 2 + 0.2, l: 0.2, w: 0.2, h: WALL_H, colour: '#3b3f45' });
  // Display plinths in two rows facing the glass.
  const plinths: Plinth[] = [];
  const stands: Stand[] = [];
  const kinds = display.length >= 4 ? display.slice(0, 6) : [...display, 'hatchback', 'sedan', 'suv', 'sports'].slice(0, 4);
  kinds.forEach((kind, i) => {
    const row = i < 3 ? 0 : 1;
    const col = i % 3;
    const x = 6 - row * 11;
    const y = (col - 1) * 7.5;
    blocks.push({ x, y, z: 0.2 + PLINTH_HEIGHT_M / 2, l: 6.5, w: 3.4, h: PLINTH_HEIGHT_M, colour: '#f2f0ea', id: `plinth:${i}` });
    plinths.push({ x, y, kind, headingDeg: 90 - 25 + (col - 1) * 25 });
    // Information stand at the front-left corner of each plinth.
    blocks.push({ x: x + 3.9, y: y + 1.5, z: 0.2 + 0.55, l: 0.4, w: 0.4, h: 1.1, colour: '#2b2f36' });
    blocks.push({ x: x + 3.9, y: y + 1.5, z: 0.2 + 1.25, l: 0.06, w: 0.5, h: 0.35, colour: '#9fd3ff' });
    stands.push({ x: x + 3.9, y: y + 1.5, kind });
  });
  // Reception desk near the entrance, right-hand side.
  const reception = { x: 12, y: -8 };
  blocks.push({ x: reception.x, y: reception.y, z: 0.2 + 0.55, l: 1.0, w: 4.0, h: 1.1, colour: '#7a5a3a' });
  blocks.push({ x: reception.x, y: reception.y, z: 0.2 + 1.13, l: 1.2, w: 4.2, h: 0.06, colour: '#e8e2d6' });
  // Lounge seating.
  for (const y of [7, 8.6]) blocks.push({ x: 12.5, y, z: 0.2 + 0.25, l: 0.9, w: 1.4, h: 0.5, colour: '#385a7a' });
  // Workshop bay at the back-left: two lift rails, a tool bench and a vehicle on the lift.
  const workshop = { x: -11, y: 8, kind: (display[0] ?? 'hatchback') as VehicleKind };
  blocks.push({ x: workshop.x, y: workshop.y + 0.9, z: 0.2 + 0.2, l: 5.0, w: 0.35, h: 0.4, colour: '#c8462e', id: 'lift' });
  blocks.push({ x: workshop.x, y: workshop.y - 0.9, z: 0.2 + 0.2, l: 5.0, w: 0.35, h: 0.4, colour: '#c8462e' });
  blocks.push({ x: workshop.x - 4.2, y: workshop.y, z: 0.2 + 0.45, l: 0.8, w: 3.0, h: 0.9, colour: '#5a5e64' });
  blocks.push({ x: workshop.x, y: 4.5, z: WALL_H / 2 + 0.2, l: 12, w: 0.2, h: WALL_H - 0.4, colour: '#dcd8d0' });
  // Outside: forecourt slab, parking bays and the test-drive exit lane markings.
  blocks.push({ x: FLOOR_L / 2 + 10, y: 0, z: 0.05, l: 20, w: FLOOR_W + 12, h: 0.1, colour: '#8e8f91', id: 'forecourt' });
  const parking: { x: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const y = -FLOOR_W / 2 - 2 + i * 3.2 + 4;
    parking.push({ x: FLOOR_L / 2 + 15, y });
    blocks.push({ x: FLOOR_L / 2 + 15, y: y - 1.6, z: 0.11, l: 5.5, w: 0.12, h: 0.02, colour: '#ffffff' });
  }
  const testDrive = { x: FLOOR_L / 2 + 8, y: FLOOR_W / 2 + 3, headingLocalDeg: 0 };
  blocks.push({ x: testDrive.x, y: testDrive.y + 1.8, z: 0.11, l: 10, w: 0.15, h: 0.02, colour: '#ffb400' });
  blocks.push({ x: testDrive.x, y: testDrive.y - 1.8, z: 0.11, l: 10, w: 0.15, h: 0.02, colour: '#ffb400' });
  blocks.push({ x: testDrive.x + 5.5, y: testDrive.y + 2.2, z: 1.3, l: 0.25, w: 0.25, h: 2.6, colour: '#ffffff' });
  blocks.push({ x: testDrive.x + 5.5, y: testDrive.y - 2.2, z: 1.3, l: 0.25, w: 0.25, h: 2.6, colour: '#ffffff' });
  const labels = [
    { x: FLOOR_L / 2 + 0.5, y: 0, z: WALL_H + 1.2, text: '' },
    { x: reception.x, y: reception.y, z: 2.2, text: 'Reception' },
    { x: workshop.x, y: workshop.y, z: 3.2, text: 'Workshop bay' },
    { x: testDrive.x, y: testDrive.y, z: 3.2, text: 'Test-drive exit' },
  ];
  return { floor, blocks, plinths, stands, reception, workshop, testDrive, parking, labels };
}
