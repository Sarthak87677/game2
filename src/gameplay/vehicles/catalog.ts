import type { DriveParams } from '@/modes/ModeController';

/**
 * Generic drivable vehicles. Every design here is ORIGINAL and deliberately generic — no real make, model, badge,
 * livery or brand is depicted or implied. Dimensions are plausible class averages, not measurements of any product.
 *
 * Vehicle frame: +x forward, +y left, +z up, origin on the ground under the vehicle's centre; units are metres.
 */
export type VehicleKind = 'hatchback' | 'sedan' | 'suv' | 'sports' | 'bus' | 'taxi' | 'truck' | 'rickshaw';

/** Colour role of a body part: resolved against the chosen paint at build time. */
export type PartTone = 'paint' | 'accent' | 'glass' | 'dark' | 'chrome' | 'canvas' | 'wood';

export interface BodyPart {
  /** Box centre in the vehicle frame. */
  x: number; y: number; z: number;
  /** Box dimensions (length along x, width along y, height along z). */
  l: number; w: number; h: number;
  tone: PartTone;
}

export interface WheelSpec { x: number; y: number; radiusM: number; widthM: number; steers: boolean }

export type LampKind = 'head' | 'tail' | 'indicatorLeft' | 'indicatorRight' | 'roof';
export interface LampSpec { kind: LampKind; x: number; y: number; z: number; sizeM: number }

export interface EngineAudioProfile {
  /** Fundamental oscillator frequency at idle and at top speed (Hz). */
  idleHz: number;
  maxHz: number;
  /** Waveform character: petrol is bright, diesel is rough/low, two-stroke buzzy, electric near-silent whine. */
  kind: 'petrol' | 'diesel' | 'two-stroke' | 'electric';
  /** Horn fundamental(s) in Hz — a single tone or a dual-tone chord. */
  hornHz: number[];
  /** Engine loudness 0..1 relative to the mix. */
  level: number;
}

export interface VehicleSpec {
  id: VehicleKind;
  name: string;
  description: string;
  /** Overall envelope. */
  lengthM: number;
  widthM: number;
  heightM: number;
  massKg: number;
  seats: number;
  /** Paint options (CSS colours). The first is the default showroom colour. */
  colours: string[];
  accent: string;
  parts: BodyPart[];
  wheels: WheelSpec[];
  lamps: LampSpec[];
  drive: DriveParams;
  audio: EngineAudioProfile;
  /** Driver's door hinge point (used to place the player when leaving the vehicle). */
  door: { x: number; y: number };
  /** Approximate 0–100 km/h time in seconds (for the spec sheet). */
  zeroToHundredS: number;
  /** Rough fuel/energy note for the spec sheet (fictional). */
  drivetrain: string;
  /** Provenance note shown wherever the vehicle is described. */
  note: string;
}

export const VEHICLE_NOTE = 'Original generic design — not a real make or model; specifications are fictional game values.';

const glassStrip = (x: number, l: number, w: number, z: number, h = 0.5): BodyPart => ({ x, y: 0, z, l, w, h, tone: 'glass' });

const carWheels = (x: number, y: number, r: number, w = 0.22): WheelSpec[] => [
  { x, y, radiusM: r, widthM: w, steers: true }, { x, y: -y, radiusM: r, widthM: w, steers: true },
  { x: -x, y, radiusM: r, widthM: w, steers: false }, { x: -x, y: -y, radiusM: r, widthM: w, steers: false },
];

const carLamps = (front: number, rear: number, y: number, z: number, size = 0.22): LampSpec[] => [
  { kind: 'head', x: front, y, z, sizeM: size }, { kind: 'head', x: front, y: -y, z, sizeM: size },
  { kind: 'tail', x: rear, y, z, sizeM: size * 0.9 }, { kind: 'tail', x: rear, y: -y, z, sizeM: size * 0.9 },
  { kind: 'indicatorLeft', x: front, y: y + size * 0.9, z, sizeM: size * 0.6 }, { kind: 'indicatorLeft', x: rear, y: y + size * 0.9, z, sizeM: size * 0.6 },
  { kind: 'indicatorRight', x: front, y: -y - size * 0.9, z, sizeM: size * 0.6 }, { kind: 'indicatorRight', x: rear, y: -y - size * 0.9, z, sizeM: size * 0.6 },
];

export const VEHICLE_CATALOG: VehicleSpec[] = [
  {
    id: 'hatchback', name: 'City Hatchback', description: 'Compact five-door runabout for narrow lanes and tight parking.',
    lengthM: 3.8, widthM: 1.7, heightM: 1.52, massKg: 1010, seats: 5,
    colours: ['#d94f3c', '#f2f2f2', '#2e6fb5', '#7c8590', '#f0c419'], accent: '#22262b',
    parts: [
      { x: 0, y: 0, z: 0.58, l: 3.8, w: 1.7, h: 0.62, tone: 'paint' },
      { x: -0.25, y: 0, z: 1.2, l: 2.3, w: 1.58, h: 0.62, tone: 'paint' },
      glassStrip(-0.25, 2.34, 1.6, 1.22, 0.4),
      { x: 1.86, y: 0, z: 0.42, l: 0.12, w: 1.6, h: 0.32, tone: 'dark' }, { x: -1.86, y: 0, z: 0.42, l: 0.12, w: 1.6, h: 0.32, tone: 'dark' },
    ],
    wheels: carWheels(1.2, 0.76, 0.3),
    lamps: carLamps(1.9, -1.9, 0.55, 0.72),
    drive: { accelMs2: 4.2, maxSpeedMs: 40, turnRate: 1.6, eyeHeightM: 1.22, followBackM: 9, followUpM: 3.4 },
    audio: { idleHz: 55, maxHz: 240, kind: 'petrol', hornHz: [420], level: 0.55 },
    door: { x: 0.4, y: -0.85 }, zeroToHundredS: 13.5, drivetrain: 'Petrol, front wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'sedan', name: 'Executive Sedan', description: 'Three-box saloon with a long wheelbase and a soft ride.',
    lengthM: 4.7, widthM: 1.82, heightM: 1.46, massKg: 1420, seats: 5,
    colours: ['#1c2733', '#c9ccd1', '#6e1f24', '#e9e9e9', '#3a4a5c'], accent: '#111417',
    parts: [
      { x: 0, y: 0, z: 0.56, l: 4.7, w: 1.82, h: 0.6, tone: 'paint' },
      { x: -0.15, y: 0, z: 1.14, l: 2.5, w: 1.7, h: 0.6, tone: 'paint' },
      glassStrip(-0.15, 2.54, 1.72, 1.18, 0.38),
      { x: 2.3, y: 0, z: 0.4, l: 0.12, w: 1.72, h: 0.3, tone: 'chrome' }, { x: -2.3, y: 0, z: 0.4, l: 0.12, w: 1.72, h: 0.3, tone: 'chrome' },
    ],
    wheels: carWheels(1.45, 0.82, 0.32),
    lamps: carLamps(2.35, -2.35, 0.6, 0.7),
    drive: { accelMs2: 5.2, maxSpeedMs: 52, turnRate: 1.35, eyeHeightM: 1.2, followBackM: 11, followUpM: 3.8 },
    audio: { idleHz: 50, maxHz: 220, kind: 'petrol', hornHz: [400, 500], level: 0.5 },
    door: { x: 0.5, y: -0.91 }, zeroToHundredS: 9.8, drivetrain: 'Petrol, rear wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'suv', name: 'Ghat SUV', description: 'Tall seven-seater with ground clearance for hill roads and monsoon ruts.',
    lengthM: 4.65, widthM: 1.9, heightM: 1.82, massKg: 1900, seats: 7,
    colours: ['#3d4a3a', '#f4f4f4', '#8a2f2f', '#2b2f36', '#a67c52'], accent: '#1a1d21',
    parts: [
      { x: 0, y: 0, z: 0.78, l: 4.65, w: 1.9, h: 0.72, tone: 'paint' },
      { x: -0.3, y: 0, z: 1.44, l: 2.9, w: 1.82, h: 0.66, tone: 'paint' },
      glassStrip(-0.3, 2.94, 1.84, 1.48, 0.42),
      { x: 2.3, y: 0, z: 0.5, l: 0.14, w: 1.8, h: 0.36, tone: 'dark' }, { x: -2.3, y: 0, z: 0.5, l: 0.14, w: 1.8, h: 0.36, tone: 'dark' },
      { x: -0.3, y: 0, z: 1.82, l: 2.2, w: 1.1, h: 0.06, tone: 'dark' },
    ],
    wheels: carWheels(1.42, 0.86, 0.38, 0.26),
    lamps: carLamps(2.32, -2.32, 0.62, 0.95, 0.24),
    drive: { accelMs2: 4.6, maxSpeedMs: 46, turnRate: 1.25, eyeHeightM: 1.55, followBackM: 12, followUpM: 4.4 },
    audio: { idleHz: 42, maxHz: 170, kind: 'diesel', hornHz: [380, 470], level: 0.6 },
    door: { x: 0.5, y: -0.95 }, zeroToHundredS: 11.2, drivetrain: 'Diesel, all wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'sports', name: 'Coastal Coupé', description: 'Low two-seater for the sea-link sweep and the ghat hairpins.',
    lengthM: 4.4, widthM: 1.92, heightM: 1.24, massKg: 1380, seats: 2,
    colours: ['#f2b705', '#c8102e', '#f5f5f5', '#101214', '#1fa7a0'], accent: '#0e1013',
    parts: [
      { x: 0.2, y: 0, z: 0.44, l: 4.4, w: 1.92, h: 0.5, tone: 'paint' },
      { x: -0.4, y: 0, z: 0.92, l: 1.9, w: 1.6, h: 0.5, tone: 'paint' },
      glassStrip(-0.4, 1.94, 1.62, 0.94, 0.34),
      { x: -2.1, y: 0, z: 0.86, l: 0.2, w: 1.5, h: 0.08, tone: 'dark' },
      { x: 2.2, y: 0, z: 0.32, l: 0.14, w: 1.8, h: 0.24, tone: 'dark' },
    ],
    wheels: carWheels(1.4, 0.88, 0.34, 0.28),
    lamps: carLamps(2.25, -2.15, 0.66, 0.58, 0.2),
    drive: { accelMs2: 9, maxSpeedMs: 70, turnRate: 1.7, eyeHeightM: 0.98, followBackM: 10, followUpM: 3.2 },
    audio: { idleHz: 65, maxHz: 320, kind: 'petrol', hornHz: [520, 660], level: 0.75 },
    door: { x: 0.3, y: -0.96 }, zeroToHundredS: 4.9, drivetrain: 'Petrol, rear wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'bus', name: 'Town Bus', description: 'Single-deck city bus with two doors on the kerb side.',
    lengthM: 11, widthM: 2.5, heightM: 3.2, massKg: 11500, seats: 40,
    colours: ['#c8313a', '#2f6db5', '#3e8f4f', '#e6e6e6'], accent: '#e8d9a8',
    parts: [
      { x: 0, y: 0, z: 1.0, l: 11, w: 2.5, h: 1.3, tone: 'paint' },
      { x: 0, y: 0, z: 2.3, l: 11, w: 2.5, h: 1.3, tone: 'paint' },
      glassStrip(0, 10.6, 2.54, 2.2, 0.8),
      { x: 5.45, y: 0, z: 2.2, l: 0.14, w: 2.3, h: 0.9, tone: 'glass' },
      { x: 1.5, y: 1.26, z: 1.1, l: 1.1, w: 0.04, h: 2.1, tone: 'dark' }, { x: -3.5, y: 1.26, z: 1.1, l: 1.1, w: 0.04, h: 2.1, tone: 'dark' },
      { x: 5.5, y: 0, z: 0.5, l: 0.12, w: 2.4, h: 0.4, tone: 'dark' }, { x: -5.5, y: 0, z: 0.5, l: 0.12, w: 2.4, h: 0.4, tone: 'dark' },
    ],
    wheels: [
      { x: 3.4, y: 1.05, radiusM: 0.5, widthM: 0.3, steers: true }, { x: 3.4, y: -1.05, radiusM: 0.5, widthM: 0.3, steers: true },
      { x: -3.2, y: 1.05, radiusM: 0.5, widthM: 0.3, steers: false }, { x: -3.2, y: -1.05, radiusM: 0.5, widthM: 0.3, steers: false },
    ],
    lamps: [
      ...carLamps(5.52, -5.52, 0.85, 0.85, 0.26),
      { kind: 'roof', x: 5.2, y: 0, z: 3.05, sizeM: 0.18 },
    ],
    drive: { accelMs2: 2.2, maxSpeedMs: 24, turnRate: 0.8, eyeHeightM: 2.35, followBackM: 20, followUpM: 6.5 },
    audio: { idleHz: 34, maxHz: 120, kind: 'diesel', hornHz: [300, 370], level: 0.7 },
    door: { x: 4.3, y: 1.4 }, zeroToHundredS: 45, drivetrain: 'Diesel, rear wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'taxi', name: 'Black-and-Yellow Cab', description: 'Compact city taxi in the classic two-tone scheme with a roof light.',
    lengthM: 3.95, widthM: 1.66, heightM: 1.6, massKg: 1000, seats: 4,
    colours: ['#1a1a1a'], accent: '#f2c318',
    parts: [
      { x: 0, y: 0, z: 0.58, l: 3.95, w: 1.66, h: 0.62, tone: 'paint' },
      { x: -0.2, y: 0, z: 1.2, l: 2.2, w: 1.56, h: 0.5, tone: 'accent' },
      glassStrip(-0.2, 2.24, 1.58, 1.24, 0.4),
      { x: -0.2, y: 0, z: 1.48, l: 2.24, w: 1.58, h: 0.06, tone: 'accent' },
      { x: 1.93, y: 0, z: 0.42, l: 0.12, w: 1.56, h: 0.3, tone: 'chrome' }, { x: -1.93, y: 0, z: 0.42, l: 0.12, w: 1.56, h: 0.3, tone: 'chrome' },
    ],
    wheels: carWheels(1.22, 0.74, 0.3),
    lamps: [...carLamps(1.98, -1.98, 0.52, 0.72), { kind: 'roof', x: -0.2, y: 0, z: 1.62, sizeM: 0.22 }],
    drive: { accelMs2: 3.8, maxSpeedMs: 36, turnRate: 1.6, eyeHeightM: 1.22, followBackM: 9, followUpM: 3.4 },
    audio: { idleHz: 52, maxHz: 230, kind: 'petrol', hornHz: [460, 560], level: 0.55 },
    door: { x: 0.4, y: -0.83 }, zeroToHundredS: 15, drivetrain: 'Petrol/CNG, front wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'truck', name: 'Goods Truck', description: 'Two-axle lorry with a painted cab and a high-sided load bed.',
    lengthM: 7.6, widthM: 2.4, heightM: 3.0, massKg: 7400, seats: 3,
    colours: ['#d97b1f', '#2e6f43', '#2f4f9b', '#b8352a'], accent: '#e2c48a',
    parts: [
      { x: 0, y: 0, z: 0.75, l: 7.6, w: 2.3, h: 0.5, tone: 'dark' },
      { x: 2.6, y: 0, z: 1.85, l: 2.2, w: 2.4, h: 1.7, tone: 'paint' },
      { x: 3.72, y: 0, z: 2.3, l: 0.06, w: 2.2, h: 0.7, tone: 'glass' },
      { x: -1.3, y: 0, z: 1.9, l: 5.0, w: 2.4, h: 1.8, tone: 'accent' },
      { x: -1.3, y: 0, z: 2.85, l: 5.0, w: 2.4, h: 0.1, tone: 'canvas' },
      { x: 3.75, y: 0, z: 0.55, l: 0.14, w: 2.3, h: 0.36, tone: 'chrome' },
    ],
    wheels: [
      { x: 2.4, y: 1.0, radiusM: 0.5, widthM: 0.3, steers: true }, { x: 2.4, y: -1.0, radiusM: 0.5, widthM: 0.3, steers: true },
      { x: -2.0, y: 1.0, radiusM: 0.5, widthM: 0.3, steers: false }, { x: -2.0, y: -1.0, radiusM: 0.5, widthM: 0.3, steers: false },
    ],
    lamps: carLamps(3.78, -3.8, 0.8, 0.95, 0.26),
    drive: { accelMs2: 2.4, maxSpeedMs: 26, turnRate: 0.85, eyeHeightM: 2.3, followBackM: 17, followUpM: 6 },
    audio: { idleHz: 36, maxHz: 125, kind: 'diesel', hornHz: [280, 350], level: 0.7 },
    door: { x: 2.6, y: -1.3 }, zeroToHundredS: 40, drivetrain: 'Diesel, rear wheels, automatic',
    note: VEHICLE_NOTE,
  },
  {
    id: 'rickshaw', name: 'Auto-rickshaw', description: 'Three-wheeled passenger auto with an open cabin and a canvas roof.',
    lengthM: 2.65, widthM: 1.35, heightM: 1.75, massKg: 400, seats: 3,
    colours: ['#1c1c1c'], accent: '#f2c318',
    parts: [
      { x: 0, y: 0, z: 0.5, l: 2.6, w: 1.3, h: 0.5, tone: 'paint' },
      { x: 0.95, y: 0, z: 1.0, l: 0.5, w: 1.1, h: 0.55, tone: 'accent' },
      { x: 1.05, y: 0, z: 1.4, l: 0.05, w: 1.0, h: 0.5, tone: 'glass' },
      { x: -0.2, y: 0, z: 1.68, l: 2.0, w: 1.3, h: 0.08, tone: 'canvas' },
      { x: -0.2, y: 0.62, z: 1.2, l: 0.06, w: 0.06, h: 1.0, tone: 'dark' }, { x: -0.2, y: -0.62, z: 1.2, l: 0.06, w: 0.06, h: 1.0, tone: 'dark' },
      { x: 0.9, y: 0.62, z: 1.35, l: 0.06, w: 0.06, h: 0.7, tone: 'dark' }, { x: 0.9, y: -0.62, z: 1.35, l: 0.06, w: 0.06, h: 0.7, tone: 'dark' },
      { x: -0.6, y: 0, z: 0.95, l: 0.8, w: 1.2, h: 0.4, tone: 'accent' },
    ],
    wheels: [
      { x: 1.05, y: 0, radiusM: 0.22, widthM: 0.1, steers: true },
      { x: -0.85, y: 0.58, radiusM: 0.22, widthM: 0.1, steers: false }, { x: -0.85, y: -0.58, radiusM: 0.22, widthM: 0.1, steers: false },
    ],
    lamps: [
      { kind: 'head', x: 1.32, y: 0, z: 1.0, sizeM: 0.2 },
      { kind: 'tail', x: -1.3, y: 0.4, z: 0.6, sizeM: 0.14 }, { kind: 'tail', x: -1.3, y: -0.4, z: 0.6, sizeM: 0.14 },
      { kind: 'indicatorLeft', x: 1.3, y: 0.45, z: 0.85, sizeM: 0.1 }, { kind: 'indicatorLeft', x: -1.3, y: 0.58, z: 0.6, sizeM: 0.1 },
      { kind: 'indicatorRight', x: 1.3, y: -0.45, z: 0.85, sizeM: 0.1 }, { kind: 'indicatorRight', x: -1.3, y: -0.58, z: 0.6, sizeM: 0.1 },
      { kind: 'roof', x: 0.6, y: 0, z: 1.78, sizeM: 0.16 },
    ],
    drive: { accelMs2: 2.6, maxSpeedMs: 16, turnRate: 2.0, eyeHeightM: 1.25, followBackM: 7, followUpM: 3 },
    audio: { idleHz: 70, maxHz: 260, kind: 'two-stroke', hornHz: [620], level: 0.6 },
    door: { x: 0.3, y: -0.9 }, zeroToHundredS: 99, drivetrain: 'CNG single-cylinder, rear wheels, automatic',
    note: VEHICLE_NOTE,
  },
];

export function vehicleSpec(id: VehicleKind): VehicleSpec {
  const s = VEHICLE_CATALOG.find((v) => v.id === id);
  if (!s) throw new Error(`Unknown vehicle ${id}`);
  return s;
}

/** Human-readable spec sheet lines for overlays and information stands. */
export function specSheet(s: VehicleSpec): string[] {
  return [
    s.description,
    `Length ${s.lengthM.toFixed(2)} m · width ${s.widthM.toFixed(2)} m · height ${s.heightM.toFixed(2)} m`,
    `Seats ${s.seats} · kerb mass ${s.massKg} kg · ${s.drivetrain}`,
    `Top speed ${Math.round(s.drive.maxSpeedMs * 3.6)} km/h · 0–100 km/h ${s.zeroToHundredS >= 99 ? 'n/a' : `${s.zeroToHundredS.toFixed(1)} s`}`,
    `Paint options: ${s.colours.length}`,
  ];
}
