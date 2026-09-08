/**
 * Vocabulary for the procedural interior grammar (`src/world/interiors/grammar.ts`): per building category, the rooms
 * it is made of, how wide they tend to be, what furniture blocks they hold and the palette used when rendering.
 *
 * DATA NOTE — everything here is a fictional generic programme. Interiors generated from it are never surveys of a
 * real building; the UI shows "Generated interior — fictional, not surveyed" while one is active.
 */
import type { InteriorCategory, RoomKind } from '@/world/interiors/types';

export interface FurnitureTemplate {
  label: string;
  /** Block size in metres (w along the room's x, d along y, h up). */
  w: number;
  d: number;
  h: number;
  colour: string;
  /** How the blocks are laid out: a grid of repeated units, one unit against the back wall, or one in the room centre. */
  place: 'grid' | 'back' | 'centre' | 'perimeter';
  /** Grid pitch (metres) between units for 'grid' and 'perimeter'. */
  pitchX?: number;
  pitchY?: number;
}

export interface RoomTypeSpec {
  kind: RoomKind;
  labels: string[];
  minW: number;
  maxW: number;
  furniture: FurnitureTemplate[];
  /** Relative frequency when the grammar picks rooms for a floor. */
  weight: number;
  /** Chance of a decorative cupboard door on the back wall. */
  decorativeDoorChance?: number;
}

export interface CategoryVocabulary {
  category: InteriorCategory;
  /** Short verb-object shown in the interaction prompt: "Enter office (procedural interior)". */
  enterLabel: string;
  corridorWidthM: number;
  floorHeightM: [number, number];
  /** Ground floor entrance room. */
  lobby: RoomTypeSpec;
  rooms: RoomTypeSpec[];
  palette: { floor: string; wall: string; ceiling: string; accent: string; door: string };
  /** Categories whose ground floor is a single open hall rather than rooms along a corridor. */
  groundHall?: { label: string; kind: RoomKind };
  elevatorFromFloors: number;
}

const DESK: FurnitureTemplate = { label: 'desk', w: 1.2, d: 0.6, h: 0.75, colour: '#8c6a4a', place: 'grid', pitchX: 1.7, pitchY: 1.4 };
const STUDENT_DESK: FurnitureTemplate = { label: 'student desk', w: 1.1, d: 0.5, h: 0.72, colour: '#a97f58', place: 'grid', pitchX: 1.5, pitchY: 1.2 };
const TEACHER_DESK: FurnitureTemplate = { label: 'teacher desk', w: 1.6, d: 0.7, h: 0.76, colour: '#6f5137', place: 'back' };
const BENCH_LAB: FurnitureTemplate = { label: 'lab bench', w: 3.0, d: 0.9, h: 0.9, colour: '#4d5a66', place: 'grid', pitchX: 3.8, pitchY: 2.2 };
const SHELF: FurnitureTemplate = { label: 'bookshelf', w: 0.5, d: 3.2, h: 2.0, colour: '#7a5a3e', place: 'grid', pitchX: 1.9, pitchY: 4.2 };
const TABLE_ROUND: FurnitureTemplate = { label: 'table', w: 1.2, d: 1.2, h: 0.75, colour: '#b48a5a', place: 'grid', pitchX: 2.6, pitchY: 2.6 };
const BED: FurnitureTemplate = { label: 'bed', w: 2.0, d: 1.4, h: 0.55, colour: '#c9c2d6', place: 'back' };
const HOSPITAL_BED: FurnitureTemplate = { label: 'bed', w: 2.1, d: 0.95, h: 0.6, colour: '#dfe6ee', place: 'grid', pitchX: 2.8, pitchY: 1.9 };
const COUNTER: FurnitureTemplate = { label: 'counter', w: 3.0, d: 0.7, h: 1.05, colour: '#5e5148', place: 'back' };
const SEAT_ROW: FurnitureTemplate = { label: 'seats', w: 2.4, d: 0.5, h: 0.5, colour: '#3d6b9a', place: 'grid', pitchX: 3.0, pitchY: 1.4 };
const DISPLAY: FurnitureTemplate = { label: 'display plinth', w: 1.0, d: 1.0, h: 1.1, colour: '#e8e4dc', place: 'grid', pitchX: 3.5, pitchY: 3.5 };
const CAR_PLINTH: FurnitureTemplate = { label: 'vehicle plinth', w: 4.6, d: 2.2, h: 0.2, colour: '#d8d8dc', place: 'grid', pitchX: 6.5, pitchY: 4.2 };
const SOFA: FurnitureTemplate = { label: 'sofa', w: 2.0, d: 0.9, h: 0.8, colour: '#6d7f92', place: 'centre' };
const WARDROBE: FurnitureTemplate = { label: 'wardrobe', w: 1.2, d: 0.6, h: 2.1, colour: '#7a5a3e', place: 'back' };
const RACK: FurnitureTemplate = { label: 'shop rack', w: 0.6, d: 2.4, h: 1.6, colour: '#8c8f96', place: 'grid', pitchX: 2.4, pitchY: 3.2 };
const EASEL: FurnitureTemplate = { label: 'easel', w: 0.7, d: 0.7, h: 1.6, colour: '#c8b08a', place: 'grid', pitchX: 2.0, pitchY: 2.0 };
const PC_DESK: FurnitureTemplate = { label: 'computer desk', w: 1.4, d: 0.7, h: 0.75, colour: '#9aa3ad', place: 'grid', pitchX: 1.8, pitchY: 1.6 };
const BENCH: FurnitureTemplate = { label: 'bench', w: 1.8, d: 0.45, h: 0.45, colour: '#8a6d4d', place: 'perimeter', pitchX: 3.5 };
const WASH: FurnitureTemplate = { label: 'washbasins', w: 2.0, d: 0.5, h: 0.85, colour: '#e6e9ec', place: 'back' };

const WASHROOM: RoomTypeSpec = { kind: 'washroom', labels: ['Washrooms'], minW: 3, maxW: 4.5, furniture: [WASH], weight: 0.6 };
const STORE: RoomTypeSpec = { kind: 'store', labels: ['Store room', 'Housekeeping'], minW: 2.5, maxW: 3.5, furniture: [WARDROBE], weight: 0.5, decorativeDoorChance: 0.6 };

export const INTERIOR_VOCABULARY: Record<InteriorCategory, CategoryVocabulary> = {
  residential: {
    category: 'residential', enterLabel: 'Enter apartments', corridorWidthM: 2.2, floorHeightM: [2.9, 3.3], elevatorFromFloors: 4,
    lobby: { kind: 'lobby', labels: ['Entrance lobby'], minW: 4, maxW: 6, furniture: [SOFA], weight: 1 },
    rooms: [
      { kind: 'flat', labels: ['Flat A', 'Flat B', 'Flat C', 'Flat D', 'Flat E'], minW: 6, maxW: 9, furniture: [BED, SOFA, TABLE_ROUND], weight: 3, decorativeDoorChance: 0.3 },
      { kind: 'living', labels: ['Common room'], minW: 5, maxW: 7, furniture: [SOFA, TABLE_ROUND], weight: 0.4 },
      STORE,
    ],
    palette: { floor: '#c9b79a', wall: '#efe9dc', ceiling: '#f4f1ea', accent: '#9a6a48', door: '#6b4a32' },
  },
  office: {
    category: 'office', enterLabel: 'Enter office', corridorWidthM: 2.4, floorHeightM: [3.2, 3.8], elevatorFromFloors: 3,
    lobby: { kind: 'reception', labels: ['Reception'], minW: 6, maxW: 9, furniture: [COUNTER, SOFA], weight: 1 },
    rooms: [
      { kind: 'office', labels: ['Open office', 'Team room', 'Project room', 'Studio'], minW: 6, maxW: 12, furniture: [DESK], weight: 3 },
      { kind: 'meeting', labels: ['Meeting room', 'Board room', 'Huddle room'], minW: 4, maxW: 6, furniture: [TABLE_ROUND], weight: 1.5 },
      { kind: 'kitchen', labels: ['Pantry'], minW: 3, maxW: 4, furniture: [COUNTER], weight: 0.6 },
      WASHROOM, STORE,
    ],
    palette: { floor: '#8f949b', wall: '#eceef0', ceiling: '#f7f7f5', accent: '#3e6ea7', door: '#4a4f56' },
  },
  school: {
    category: 'school', enterLabel: 'Enter school', corridorWidthM: 2.8, floorHeightM: [3.4, 3.8], elevatorFromFloors: 4,
    lobby: { kind: 'lobby', labels: ['Entrance hall'], minW: 6, maxW: 9, furniture: [BENCH], weight: 1 },
    rooms: [
      { kind: 'classroom', labels: ['Classroom', 'Classroom', 'Classroom', 'Maths room', 'Language room'], minW: 7, maxW: 9, furniture: [STUDENT_DESK, TEACHER_DESK], weight: 4, decorativeDoorChance: 0.4 },
      { kind: 'science-lab', labels: ['Science lab'], minW: 8, maxW: 11, furniture: [BENCH_LAB], weight: 0.8 },
      { kind: 'computer-lab', labels: ['Computer lab'], minW: 8, maxW: 10, furniture: [PC_DESK], weight: 0.7 },
      { kind: 'art-room', labels: ['Art room'], minW: 7, maxW: 9, furniture: [EASEL], weight: 0.5 },
      { kind: 'staff-room', labels: ['Staff room'], minW: 5, maxW: 7, furniture: [DESK, SOFA], weight: 0.6 },
      { kind: 'library', labels: ['Library'], minW: 9, maxW: 14, furniture: [SHELF, TABLE_ROUND], weight: 0.5 },
      WASHROOM,
    ],
    palette: { floor: '#d9cbb0', wall: '#f3eedf', ceiling: '#f8f6ef', accent: '#3f7f5f', door: '#5e7d5a' },
  },
  hotel: {
    category: 'hotel', enterLabel: 'Enter hotel', corridorWidthM: 2.0, floorHeightM: [3.0, 3.4], elevatorFromFloors: 3,
    lobby: { kind: 'reception', labels: ['Hotel lobby'], minW: 8, maxW: 12, furniture: [COUNTER, SOFA], weight: 1 },
    rooms: [
      { kind: 'bedroom', labels: ['Room 01', 'Room 02', 'Room 03', 'Room 04', 'Room 05', 'Room 06', 'Suite'], minW: 3.8, maxW: 5.2, furniture: [BED, WARDROBE], weight: 5, decorativeDoorChance: 0.5 },
      { kind: 'lounge', labels: ['Guest lounge'], minW: 6, maxW: 9, furniture: [SOFA, TABLE_ROUND], weight: 0.4 },
      STORE,
    ],
    palette: { floor: '#7d3b3b', wall: '#f1e7d8', ceiling: '#f7f2ea', accent: '#c9a45a', door: '#4e3024' },
  },
  hospital: {
    category: 'hospital', enterLabel: 'Enter hospital', corridorWidthM: 3.0, floorHeightM: [3.4, 3.8], elevatorFromFloors: 2,
    lobby: { kind: 'reception', labels: ['Out-patient reception'], minW: 8, maxW: 12, furniture: [COUNTER, SEAT_ROW], weight: 1 },
    rooms: [
      { kind: 'ward', labels: ['General ward', 'Recovery ward', 'Day ward'], minW: 8, maxW: 12, furniture: [HOSPITAL_BED], weight: 3 },
      { kind: 'clinic', labels: ['Consulting room', 'Examination room'], minW: 4, maxW: 5.5, furniture: [DESK, HOSPITAL_BED], weight: 2 },
      { kind: 'pharmacy', labels: ['Pharmacy'], minW: 5, maxW: 7, furniture: [COUNTER, RACK], weight: 0.5 },
      { kind: 'waiting', labels: ['Waiting area'], minW: 5, maxW: 8, furniture: [SEAT_ROW], weight: 1 },
      WASHROOM, STORE,
    ],
    palette: { floor: '#c8dfe6', wall: '#f2f7f9', ceiling: '#fbfdfe', accent: '#2f8f8a', door: '#5d7f8a' },
  },
  mall: {
    category: 'mall', enterLabel: 'Enter mall', corridorWidthM: 5.0, floorHeightM: [4.0, 5.0], elevatorFromFloors: 2,
    lobby: { kind: 'atrium', labels: ['Atrium'], minW: 10, maxW: 16, furniture: [BENCH], weight: 1 },
    rooms: [
      { kind: 'shop', labels: ['Clothing store', 'Bookshop', 'Electronics', 'Toys & games', 'Home store', 'Shoe shop', 'Sweet shop'], minW: 6, maxW: 10, furniture: [RACK, COUNTER], weight: 5 },
      { kind: 'food-court', labels: ['Food court'], minW: 12, maxW: 18, furniture: [TABLE_ROUND, COUNTER], weight: 0.7 },
      WASHROOM,
    ],
    palette: { floor: '#e2dcd2', wall: '#f5f2ee', ceiling: '#fbfaf8', accent: '#d2793a', door: '#7a7f88' },
  },
  'restaurant-cafe': {
    category: 'restaurant-cafe', enterLabel: 'Enter café', corridorWidthM: 2.0, floorHeightM: [3.0, 3.6], elevatorFromFloors: 99,
    lobby: { kind: 'dining', labels: ['Dining room'], minW: 8, maxW: 14, furniture: [TABLE_ROUND, COUNTER], weight: 1 },
    rooms: [
      { kind: 'dining', labels: ['Dining room', 'Family section', 'Terrace seating'], minW: 6, maxW: 12, furniture: [TABLE_ROUND], weight: 3 },
      { kind: 'kitchen-commercial', labels: ['Kitchen'], minW: 5, maxW: 8, furniture: [COUNTER, BENCH_LAB], weight: 1 },
      WASHROOM, STORE,
    ],
    palette: { floor: '#8a5a3c', wall: '#f3e6cf', ceiling: '#efe4d0', accent: '#c65f3a', door: '#5a3a28' },
    groundHall: { label: 'Dining room', kind: 'dining' },
  },
  museum: {
    category: 'museum', enterLabel: 'Enter museum', corridorWidthM: 3.5, floorHeightM: [4.0, 5.0], elevatorFromFloors: 2,
    lobby: { kind: 'lobby', labels: ['Museum foyer'], minW: 8, maxW: 12, furniture: [COUNTER, BENCH], weight: 1 },
    rooms: [
      { kind: 'gallery', labels: ['Gallery — Geology', 'Gallery — Textiles', 'Gallery — Coins', 'Gallery — Sculpture', 'Gallery — Maps', 'Temporary exhibition'], minW: 8, maxW: 14, furniture: [DISPLAY, BENCH], weight: 4 },
      { kind: 'store', labels: ['Conservation store'], minW: 4, maxW: 6, furniture: [RACK], weight: 0.4, decorativeDoorChance: 0.8 },
      WASHROOM,
    ],
    palette: { floor: '#b9b1a3', wall: '#f4f1ea', ceiling: '#f9f7f2', accent: '#7a4a3a', door: '#4a4038' },
  },
  'railway-station': {
    category: 'railway-station', enterLabel: 'Enter station building', corridorWidthM: 6.0, floorHeightM: [4.5, 6.0], elevatorFromFloors: 2,
    lobby: { kind: 'ticket-hall', labels: ['Ticket hall'], minW: 12, maxW: 20, furniture: [COUNTER, SEAT_ROW], weight: 1 },
    rooms: [
      { kind: 'waiting', labels: ['Waiting hall', 'Upper-class waiting room'], minW: 8, maxW: 14, furniture: [SEAT_ROW], weight: 3 },
      { kind: 'platform-access', labels: ['Platform access'], minW: 6, maxW: 8, furniture: [], weight: 1 },
      { kind: 'shop', labels: ['Bookstall', 'Tea stall'], minW: 4, maxW: 6, furniture: [COUNTER, RACK], weight: 1.5 },
      WASHROOM,
    ],
    palette: { floor: '#a8a49c', wall: '#e9e4d8', ceiling: '#d9d4c8', accent: '#b7452b', door: '#3e434b' },
    groundHall: { label: 'Concourse', kind: 'ticket-hall' },
  },
  'airport-public': {
    category: 'airport-public', enterLabel: 'Enter terminal (public area)', corridorWidthM: 8.0, floorHeightM: [5.0, 7.0], elevatorFromFloors: 2,
    lobby: { kind: 'check-in', labels: ['Check-in hall'], minW: 16, maxW: 30, furniture: [COUNTER, SEAT_ROW], weight: 1 },
    rooms: [
      { kind: 'gate-lounge', labels: ['Gate lounge A', 'Gate lounge B', 'Gate lounge C'], minW: 10, maxW: 18, furniture: [SEAT_ROW], weight: 3 },
      { kind: 'shop', labels: ['Bookshop', 'Café', 'Souvenirs'], minW: 5, maxW: 8, furniture: [COUNTER, RACK], weight: 2 },
      WASHROOM,
    ],
    palette: { floor: '#d4d6d8', wall: '#f5f6f7', ceiling: '#eef0f2', accent: '#2c7bb6', door: '#5b6068' },
    groundHall: { label: 'Check-in hall (public area)', kind: 'check-in' },
  },
  showroom: {
    category: 'showroom', enterLabel: 'Enter showroom', corridorWidthM: 3.0, floorHeightM: [4.0, 5.5], elevatorFromFloors: 99,
    lobby: { kind: 'showroom-floor', labels: ['Showroom floor'], minW: 12, maxW: 24, furniture: [CAR_PLINTH, COUNTER], weight: 1 },
    rooms: [
      { kind: 'office', labels: ['Sales office', 'Finance desk'], minW: 4, maxW: 6, furniture: [DESK], weight: 2 },
      { kind: 'service-bay', labels: ['Service bay'], minW: 8, maxW: 12, furniture: [CAR_PLINTH], weight: 1 },
      { kind: 'lounge', labels: ['Customer lounge'], minW: 5, maxW: 7, furniture: [SOFA, TABLE_ROUND], weight: 1 },
    ],
    palette: { floor: '#e9ebee', wall: '#fafbfc', ceiling: '#f1f3f5', accent: '#c8102e', door: '#3a3f47' },
    groundHall: { label: 'Showroom floor', kind: 'showroom-floor' },
  },
  'cruise-public': {
    category: 'cruise-public', enterLabel: 'Enter ship (public decks)', corridorWidthM: 1.8, floorHeightM: [2.6, 3.0], elevatorFromFloors: 2,
    lobby: { kind: 'atrium', labels: ['Atrium deck'], minW: 8, maxW: 12, furniture: [SOFA, COUNTER], weight: 1 },
    rooms: [
      { kind: 'cabin', labels: ['Cabin 101', 'Cabin 102', 'Cabin 103', 'Cabin 104', 'Cabin 105'], minW: 2.8, maxW: 3.6, furniture: [BED, WARDROBE], weight: 5 },
      { kind: 'lounge', labels: ['Observation lounge', 'Card room'], minW: 6, maxW: 10, furniture: [SOFA, TABLE_ROUND], weight: 1 },
      { kind: 'dining', labels: ['Dining saloon'], minW: 8, maxW: 12, furniture: [TABLE_ROUND], weight: 0.8 },
    ],
    palette: { floor: '#3f4d63', wall: '#eef1f4', ceiling: '#f6f8fa', accent: '#c9a45a', door: '#3b4757' },
  },
};

/** Maps an OpenStreetMap `building=*` value onto an interior category, or null when the building is not enterable. */
export function categoryForOsmBuilding(type: string | null | undefined, name?: string | null): InteriorCategory | null {
  const t = (type ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();
  if (/hospital|clinic/.test(t) || /hospital|clinic/.test(n)) return 'hospital';
  if (/school|college|university|kindergarten/.test(t) || /school|college|vidyalaya|university/.test(n)) return 'school';
  if (/hotel|dormitory|hostel/.test(t) || /hotel|lodge|resort/.test(n)) return 'hotel';
  if (/train_station|transportation/.test(t) || /railway station|junction/.test(n)) return 'railway-station';
  if (/terminal|hangar/.test(t) && /airport|terminal/.test(n)) return 'airport-public';
  if (/mall|retail|supermarket|kiosk/.test(t) || /mall|market|plaza/.test(n)) return 'mall';
  if (/restaurant|cafe|food/.test(n)) return 'restaurant-cafe';
  if (/museum|gallery/.test(n)) return 'museum';
  if (/showroom|motors|automobiles/.test(n)) return 'showroom';
  if (/commercial|office|government|civic|public/.test(t)) return 'office';
  if (/apartments|residential|house|detached|semidetached_house|terrace|bungalow|yes/.test(t)) return 'residential';
  return null;
}
