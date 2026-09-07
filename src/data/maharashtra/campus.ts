/**
 * SGIS-inspired hero campus — an ORIGINAL, FICTIONALISED school campus placed at the approximate public map position
 * of the school near Atigre, Kolhapur. It is not the school's actual layout, contains no security-relevant detail and
 * every building interior is generated from the handcrafted programmes below. Coordinates are local metres (east,
 * north) from `origin`; `origin` itself is an approximate reference value (±300 m).
 */
import type { HeroLayoutSpec, InteriorCategory } from '@/world/interiors/types';

export interface CampusBuildingSpec {
  id: string;
  name: string;
  category: InteriorCategory;
  /** Footprint centre in campus metres. */
  east: number;
  north: number;
  /** Footprint size: w along the building's long axis, d across; rotationDeg turns the long axis from east (CCW). */
  wM: number;
  dM: number;
  rotationDeg: number;
  heightM: number;
  floors: number;
  colour: string;
  /** Which side (in the building's own frame: south = -d/2) the entrance is on. */
  entrance: 'north' | 'south' | 'east' | 'west';
  layout: HeroLayoutSpec;
}

export interface CampusSpec {
  id: string;
  name: string;
  /** Persistent on-screen note (shown whenever the player is on the campus). */
  note: string;
  dataNote: string;
  approximate: true;
  origin: { lat: number; lon: number };
  /** Landscaped platform extent in campus metres. */
  platform: { e0: number; n0: number; e1: number; n1: number };
  gate: { east: number; north: number; widthM: number };
  roads: { points: [number, number][]; widthM: number }[];
  parking: { east: number; north: number; wM: number; dM: number; buses: number; cars: number }[];
  courts: { id: string; label: string; east: number; north: number; wM: number; dM: number; kind: 'basketball' | 'volleyball' | 'field' }[];
  gardens: { east: number; north: number; radiusM: number }[];
  trees: { east: number; north: number; heightM: number }[];
  parkour: { east: number; north: number; label: string; blocks: { e: number; n: number; w: number; d: number; h: number }[] };
  buildings: CampusBuildingSpec[];
}

const classroomFloor = (prefix: string, extra: HeroLayoutSpec['floors'][number]['rooms'] = []): HeroLayoutSpec['floors'][number] => ({
  name: `${prefix} floor`,
  rooms: [
    { label: `Classroom ${prefix[0]}1`, kind: 'classroom', widthM: 8, side: 'north', decorativeDoor: true },
    { label: `Classroom ${prefix[0]}2`, kind: 'classroom', widthM: 8, side: 'north' },
    { label: `Classroom ${prefix[0]}3`, kind: 'classroom', widthM: 8, side: 'north' },
    { label: 'Staff room', kind: 'staff-room', widthM: 6, side: 'south' },
    { label: `Classroom ${prefix[0]}4`, kind: 'classroom', widthM: 8, side: 'south' },
    { label: 'Washrooms', kind: 'washroom', widthM: 4, side: 'south' },
    ...extra,
  ],
});

const ACADEMIC_A: HeroLayoutSpec = {
  elevator: true, terrace: true, entrance: 'south', corridorWidthM: 2.8,
  floors: [
    { name: 'Ground floor', rooms: [
      { label: 'Entrance hall', kind: 'lobby', widthM: 8, side: 'south' },
      { label: 'Administration office', kind: 'administration', widthM: 8, side: 'south' },
      { label: 'Reception', kind: 'reception', widthM: 6, side: 'south' },
      { label: 'Classroom G1', kind: 'classroom', widthM: 8, side: 'north', decorativeDoor: true },
      { label: 'Classroom G2', kind: 'classroom', widthM: 8, side: 'north' },
      { label: 'Art room', kind: 'art-room', widthM: 9, side: 'north' },
    ] },
    classroomFloor('First'),
    { name: 'Second floor', rooms: [
      { label: 'Science lab', kind: 'science-lab', widthM: 11, side: 'north' },
      { label: 'Computer lab', kind: 'computer-lab', widthM: 10, side: 'north' },
      { label: 'Classroom S1', kind: 'classroom', widthM: 8, side: 'south' },
      { label: 'Classroom S2', kind: 'classroom', widthM: 8, side: 'south', decorativeDoor: true },
      { label: 'Store', kind: 'store', widthM: 3, side: 'south' },
    ] },
    classroomFloor('Third'),
  ],
};

const ACADEMIC_B: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'south', corridorWidthM: 2.8,
  floors: [
    { name: 'Ground floor', rooms: [
      { label: 'Entrance hall', kind: 'lobby', widthM: 7, side: 'south' },
      { label: 'Language room', kind: 'classroom', widthM: 8, side: 'south' },
      { label: 'Classroom G1', kind: 'classroom', widthM: 8, side: 'north' },
      { label: 'Classroom G2', kind: 'classroom', widthM: 8, side: 'north', decorativeDoor: true },
      { label: 'Music room', kind: 'art-room', widthM: 8, side: 'north' },
    ] },
    classroomFloor('First'),
    classroomFloor('Second'),
  ],
};

const ACADEMIC_C: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'south', corridorWidthM: 2.8,
  floors: [
    { name: 'Ground floor', rooms: [
      { label: 'Entrance hall', kind: 'lobby', widthM: 7, side: 'south' },
      { label: 'Maths room', kind: 'classroom', widthM: 8, side: 'south' },
      { label: 'Classroom G1', kind: 'classroom', widthM: 8, side: 'north' },
      { label: 'Classroom G2', kind: 'classroom', widthM: 8, side: 'north' },
      { label: 'Counsellor', kind: 'office', widthM: 4, side: 'north' },
    ] },
    classroomFloor('First'),
    { name: 'Second floor', rooms: [
      { label: 'Robotics lab', kind: 'computer-lab', widthM: 10, side: 'north' },
      { label: 'Classroom S1', kind: 'classroom', widthM: 8, side: 'north' },
      { label: 'Classroom S2', kind: 'classroom', widthM: 8, side: 'south' },
      { label: 'Classroom S3', kind: 'classroom', widthM: 8, side: 'south' },
    ] },
  ],
};

const LIBRARY: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'east',
  floors: [
    { name: 'Reading hall', hall: { label: 'Library — reading hall', kind: 'library' } },
    { name: 'Reference floor', hall: { label: 'Library — reference & periodicals', kind: 'library' } },
  ],
};

const ADMIN: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'north', corridorWidthM: 2.4,
  floors: [
    { name: 'Ground floor', rooms: [
      { label: 'Reception', kind: 'reception', widthM: 6, side: 'south' },
      { label: 'Accounts office', kind: 'administration', widthM: 6, side: 'south' },
      { label: 'Admissions office', kind: 'administration', widthM: 6, side: 'north' },
      { label: 'Meeting room', kind: 'meeting', widthM: 6, side: 'north' },
    ] },
    { name: 'First floor', rooms: [
      { label: 'Principal’s office', kind: 'office', widthM: 6, side: 'north' },
      { label: 'Staff room', kind: 'staff-room', widthM: 7, side: 'north' },
      { label: 'Records', kind: 'store', widthM: 4, side: 'south', decorativeDoor: true },
      { label: 'Conference room', kind: 'meeting', widthM: 8, side: 'south' },
    ] },
  ],
};

const AUDITORIUM: HeroLayoutSpec = {
  elevator: false, terrace: false, entrance: 'south',
  floors: [{ name: 'Auditorium', hall: { label: 'Auditorium', kind: 'auditorium' }, rooms: [{ label: 'Green room', kind: 'store', widthM: 6 }, { label: 'Control room', kind: 'office', widthM: 5 }] }],
};

const CAFETERIA: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'south',
  floors: [{ name: 'Cafeteria', hall: { label: 'Cafeteria', kind: 'cafeteria' }, rooms: [{ label: 'Kitchen', kind: 'kitchen-commercial', widthM: 8 }] }],
};

const LABS: HeroLayoutSpec = {
  elevator: false, terrace: true, entrance: 'south', corridorWidthM: 2.8,
  floors: [
    { name: 'Ground floor', rooms: [
      { label: 'Physics lab', kind: 'science-lab', widthM: 10, side: 'north' },
      { label: 'Chemistry lab', kind: 'science-lab', widthM: 10, side: 'north' },
      { label: 'Entrance hall', kind: 'lobby', widthM: 6, side: 'south' },
      { label: 'Biology lab', kind: 'science-lab', widthM: 10, side: 'south' },
      { label: 'Prep room', kind: 'store', widthM: 4, side: 'south', decorativeDoor: true },
    ] },
    { name: 'First floor', rooms: [
      { label: 'Computer lab 1', kind: 'computer-lab', widthM: 10, side: 'north' },
      { label: 'Computer lab 2', kind: 'computer-lab', widthM: 10, side: 'north' },
      { label: 'Maker space', kind: 'art-room', widthM: 9, side: 'south' },
      { label: 'Server room', kind: 'store', widthM: 4, side: 'south', decorativeDoor: true },
    ] },
  ],
};

const SPORTS_HALL: HeroLayoutSpec = {
  elevator: false, terrace: false, entrance: 'west',
  floors: [{ name: 'Indoor sports hall', hall: { label: 'Indoor sports hall', kind: 'sports-hall' }, rooms: [{ label: 'Equipment store', kind: 'store', widthM: 5 }, { label: 'Changing rooms', kind: 'washroom', widthM: 6 }] }],
};

const hostelFloor = (n: number): HeroLayoutSpec['floors'][number] => ({
  name: n === 0 ? 'Ground floor' : `Floor ${n}`,
  rooms: [
    ...(n === 0 ? [{ label: 'Warden’s office', kind: 'office' as const, widthM: 4, side: 'south' as const }, { label: 'Common room', kind: 'living' as const, widthM: 7, side: 'south' as const }] : [{ label: `Study room ${n}`, kind: 'living' as const, widthM: 6, side: 'south' as const }]),
    ...[1, 2, 3, 4].map((i) => ({ label: `Hostel room ${n}${String(i).padStart(2, '0')}`, kind: 'bedroom' as const, widthM: 4.2, side: 'north' as const })),
    { label: 'Washrooms', kind: 'washroom' as const, widthM: 4, side: 'south' as const },
  ],
});

const HOSTEL: HeroLayoutSpec = { elevator: false, terrace: true, entrance: 'south', corridorWidthM: 2.2, floors: [hostelFloor(0), hostelFloor(1), hostelFloor(2)] };

const treesAlong = (x0: number, y0: number, x1: number, y1: number, n: number): CampusSpec['trees'] =>
  Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0.5 : i / (n - 1); return { east: x0 + (x1 - x0) * t, north: y0 + (y1 - y0) * t, heightM: 6 + ((i * 7) % 5) * 0.6 }; });

export const SGIS_CAMPUS: CampusSpec = {
  id: 'sgis-inspired-campus',
  name: 'SGIS-inspired campus (fictionalised)',
  note: 'Original, fictionalised campus inspired by SGIS — not the school’s actual layout',
  dataNote: 'Approximate public map position near Atigre, Kolhapur (±300 m). Layout, buildings and interiors are original inventions for the game; nothing here is surveyed and no security-relevant detail is depicted.',
  approximate: true,
  origin: { lat: 16.7335, lon: 74.4015 },
  platform: { e0: -160, n0: -20, e1: 200, n1: 260 },
  gate: { east: 0, north: 12, widthM: 12 },
  roads: [
    { points: [[0, -20], [0, 235]], widthM: 7 },
    { points: [[-140, 60], [190, 60]], widthM: 6 },
    { points: [[-140, 120], [90, 120]], widthM: 6 },
    { points: [[-140, 180], [90, 180]], widthM: 6 },
    { points: [[-120, 60], [-120, 180]], widthM: 5 },
    { points: [[90, 60], [90, 235]], widthM: 5 },
    { points: [[-60, -8], [60, -8]], widthM: 5 },
  ],
  parking: [
    { east: 60, north: 22, wM: 48, dM: 20, buses: 4, cars: 0 },
    { east: -62, north: 22, wM: 44, dM: 20, buses: 0, cars: 10 },
  ],
  courts: [
    { id: 'field', label: 'Sports field', east: 145, north: 130, wM: 90, dM: 60, kind: 'field' },
    { id: 'basketball', label: 'Basketball court', east: 118, north: 80, wM: 28, dM: 15, kind: 'basketball' },
    { id: 'volleyball', label: 'Volleyball court', east: 160, north: 80, wM: 18, dM: 9, kind: 'volleyball' },
  ],
  gardens: [
    { east: 0, north: 60, radiusM: 9 },
    { east: 0, north: 120, radiusM: 7 },
    { east: -22, north: 34, radiusM: 5 },
    { east: 22, north: 34, radiusM: 5 },
    { east: 0, north: 180, radiusM: 7 },
  ],
  trees: [
    ...treesAlong(-6, 0, -6, 52, 6), ...treesAlong(6, 0, 6, 52, 6),
    ...treesAlong(-130, 66, 80, 66, 12), ...treesAlong(-130, 114, 80, 114, 12),
    ...treesAlong(-130, 126, 80, 126, 12), ...treesAlong(-130, 174, 80, 174, 12),
    ...treesAlong(-150, 30, -150, 240, 9), ...treesAlong(105, 190, 190, 190, 6),
    ...treesAlong(-40, 240, 60, 240, 6),
  ],
  parkour: {
    east: 145, north: 100, label: 'Parkour course — low walls, jump assist',
    blocks: [
      { e: 110, n: 100, w: 3, d: 1, h: 0.5 }, { e: 116, n: 100, w: 3, d: 1, h: 0.8 }, { e: 122, n: 100, w: 3, d: 1, h: 1.1 },
      { e: 128, n: 101, w: 2, d: 2, h: 0.6 }, { e: 133, n: 99, w: 2, d: 2, h: 0.9 }, { e: 138, n: 101, w: 2, d: 2, h: 1.2 },
      { e: 145, n: 100, w: 6, d: 1, h: 0.7 }, { e: 153, n: 100, w: 3, d: 1, h: 1.0 }, { e: 159, n: 100, w: 3, d: 1, h: 0.5 },
      { e: 166, n: 100, w: 1, d: 6, h: 0.8 }, { e: 172, n: 100, w: 3, d: 1, h: 1.1 }, { e: 178, n: 100, w: 3, d: 1, h: 0.6 },
    ],
  },
  buildings: [
    { id: 'academic-a', name: 'Academic block A', category: 'school', east: -55, north: 90, wM: 48, dM: 16, rotationDeg: 0, heightM: 14.4, floors: 4, colour: '#e8d9c0', entrance: 'south', layout: ACADEMIC_A },
    { id: 'academic-b', name: 'Academic block B', category: 'school', east: 45, north: 90, wM: 44, dM: 16, rotationDeg: 0, heightM: 10.8, floors: 3, colour: '#e3cfb4', entrance: 'south', layout: ACADEMIC_B },
    { id: 'academic-c', name: 'Academic block C', category: 'school', east: -55, north: 150, wM: 44, dM: 16, rotationDeg: 0, heightM: 10.8, floors: 3, colour: '#e8d9c0', entrance: 'south', layout: ACADEMIC_C },
    { id: 'admin', name: 'Administration block', category: 'office', east: 40, north: 36, wM: 26, dM: 14, rotationDeg: 90, heightM: 7.4, floors: 2, colour: '#d8cdbf', entrance: 'north', layout: ADMIN },
    { id: 'library', name: 'Library', category: 'school', east: -40, north: 36, wM: 28, dM: 18, rotationDeg: 0, heightM: 8.4, floors: 2, colour: '#d9c9a8', entrance: 'east', layout: LIBRARY },
    { id: 'auditorium', name: 'Auditorium', category: 'school', east: 45, north: 152, wM: 42, dM: 26, rotationDeg: 0, heightM: 9.5, floors: 1, colour: '#c9b6a3', entrance: 'south', layout: AUDITORIUM },
    { id: 'cafeteria', name: 'Cafeteria', category: 'restaurant-cafe', east: 0, north: 210, wM: 32, dM: 16, rotationDeg: 0, heightM: 4.6, floors: 1, colour: '#e6d3b3', entrance: 'south', layout: CAFETERIA },
    { id: 'labs', name: 'Labs block', category: 'school', east: -55, north: 210, wM: 40, dM: 16, rotationDeg: 0, heightM: 7.6, floors: 2, colour: '#dfd6c8', entrance: 'south', layout: LABS },
    { id: 'sports-hall', name: 'Indoor sports hall', category: 'school', east: 150, north: 215, wM: 44, dM: 26, rotationDeg: 0, heightM: 9.0, floors: 1, colour: '#cfd6d9', entrance: 'west', layout: SPORTS_HALL },
    { id: 'hostel', name: 'Hostel-style block', category: 'hotel', east: -128, north: 120, wM: 46, dM: 14, rotationDeg: 90, heightM: 10.2, floors: 3, colour: '#e0cdb9', entrance: 'south', layout: HOSTEL },
  ],
};

/** Footprint ring (campus metres, CCW) of a campus building. */
export function campusBuildingFootprint(b: CampusBuildingSpec): [number, number][] {
  const r = (b.rotationDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const corners: [number, number][] = [[-b.wM / 2, -b.dM / 2], [b.wM / 2, -b.dM / 2], [b.wM / 2, b.dM / 2], [-b.wM / 2, b.dM / 2]];
  return corners.map(([x, y]) => [b.east + x * c - y * s, b.north + x * s + y * c]);
}

/** Entrance door point (campus metres) — midpoint of the entrance side, pushed 1 m outside the wall. */
export function campusBuildingDoor(b: CampusBuildingSpec): [number, number] {
  const r = (b.rotationDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const local: [number, number] = b.entrance === 'south' ? [0, -b.dM / 2 - 1] : b.entrance === 'north' ? [0, b.dM / 2 + 1] : b.entrance === 'east' ? [b.wM / 2 + 1, 0] : [-b.wM / 2 - 1, 0];
  return [b.east + local[0] * c - local[1] * s, b.north + local[0] * s + local[1] * c];
}

export function campusBuildingById(id: string): CampusBuildingSpec | undefined {
  return SGIS_CAMPUS.buildings.find((b) => b.id === id);
}
