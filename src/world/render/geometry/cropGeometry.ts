/**
 * Cultivated fields: rows of small plant cards laid out along the field's row angle, clipped to the polygon, with
 * crop-specific heights and spacing (0.6-1.5 m rows). Rice paddies add a flat water-tinted ground polygon. Plant
 * counts are capped per field by widening the spacing so a single field never dominates the tile budget.
 */
import { fnv1a, mixSeed, Rng } from '@/util/hash';
import type { FieldSpec } from '@/world/procedural/types';
import { MeshBuilder, type BucketedMesh } from './mesh';
import { addCrossedCards, addPolygonCap, cleanRing, normalize, pointInRing, ringArea } from './shapes';
import { parseColour, scaleColour, type RGB } from './colour';
import { ATLAS_CELLS, type AtlasCell } from '../leafAtlas';
import { clamp } from './common';

export interface CropProfile {
  heightM: number;
  rowSpacingM: number;
  plantSpacingM: number;
  /** Card width as a fraction of plant height. */
  widthFactor: number;
  cell: AtlasCell;
  /** Flooded paddy: adds a water-tinted ground polygon. */
  water?: boolean;
  /** Flower head colour drawn on top of each plant (sunflower, rapeseed). */
  flowerColour?: string;
}

/** Crop rendering profiles keyed by a lowercase substring of the field's crop name. */
export const CROP_PROFILES: Record<string, CropProfile> = {
  wheat: { heightM: 0.9, rowSpacingM: 0.6, plantSpacingM: 0.45, widthFactor: 0.55, cell: 'crop' },
  barley: { heightM: 0.85, rowSpacingM: 0.6, plantSpacingM: 0.45, widthFactor: 0.55, cell: 'crop' },
  oat: { heightM: 1.0, rowSpacingM: 0.6, plantSpacingM: 0.45, widthFactor: 0.55, cell: 'crop' },
  rye: { heightM: 1.3, rowSpacingM: 0.6, plantSpacingM: 0.45, widthFactor: 0.5, cell: 'crop' },
  maize: { heightM: 2.2, rowSpacingM: 0.9, plantSpacingM: 0.5, widthFactor: 0.45, cell: 'crop' },
  corn: { heightM: 2.2, rowSpacingM: 0.9, plantSpacingM: 0.5, widthFactor: 0.45, cell: 'crop' },
  rice: { heightM: 0.8, rowSpacingM: 0.6, plantSpacingM: 0.4, widthFactor: 0.5, cell: 'grass', water: true },
  soy: { heightM: 0.7, rowSpacingM: 0.75, plantSpacingM: 0.4, widthFactor: 0.8, cell: 'shrub' },
  sunflower: { heightM: 1.8, rowSpacingM: 0.8, plantSpacingM: 0.6, widthFactor: 0.45, cell: 'crop', flowerColour: '#ebbe28' },
  rapeseed: { heightM: 1.3, rowSpacingM: 0.6, plantSpacingM: 0.4, widthFactor: 0.6, cell: 'shrub', flowerColour: '#e6d232' },
  canola: { heightM: 1.3, rowSpacingM: 0.6, plantSpacingM: 0.4, widthFactor: 0.6, cell: 'shrub', flowerColour: '#e6d232' },
  potato: { heightM: 0.5, rowSpacingM: 0.9, plantSpacingM: 0.45, widthFactor: 1.1, cell: 'shrub' },
  sugarcane: { heightM: 3.0, rowSpacingM: 1.5, plantSpacingM: 0.6, widthFactor: 0.35, cell: 'grass' },
  cotton: { heightM: 1.1, rowSpacingM: 1.0, plantSpacingM: 0.45, widthFactor: 0.8, cell: 'shrub' },
  vine: { heightM: 1.7, rowSpacingM: 1.5, plantSpacingM: 1.2, widthFactor: 0.6, cell: 'shrub' },
  grape: { heightM: 1.7, rowSpacingM: 1.5, plantSpacingM: 1.2, widthFactor: 0.6, cell: 'shrub' },
  tea: { heightM: 1.0, rowSpacingM: 1.5, plantSpacingM: 0.5, widthFactor: 1.2, cell: 'shrub' },
  millet: { heightM: 1.5, rowSpacingM: 0.7, plantSpacingM: 0.4, widthFactor: 0.5, cell: 'crop' },
  sorghum: { heightM: 1.5, rowSpacingM: 0.7, plantSpacingM: 0.4, widthFactor: 0.5, cell: 'crop' },
  cassava: { heightM: 1.6, rowSpacingM: 1.0, plantSpacingM: 0.8, widthFactor: 0.8, cell: 'shrub' },
  default: { heightM: 0.9, rowSpacingM: 0.7, plantSpacingM: 0.45, widthFactor: 0.6, cell: 'crop' },
};

/** Profile for a crop name (substring match, case-insensitive), falling back to a generic cereal. */
export function cropProfile(crop: string): CropProfile {
  const c = crop.toLowerCase();
  for (const key of Object.keys(CROP_PROFILES)) if (key !== 'default' && c.includes(key)) return CROP_PROFILES[key];
  return CROP_PROFILES.default;
}

const UP = { x: 0, y: 0, z: 1 };

/** Adds one crop plant (two crossed cards, plus a flower head for flowering crops) to a builder. */
export function addCropPlant(b: MeshBuilder, profile: CropProfile, x: number, y: number, z: number, rng: Rng, colour: RGB, scale = 1): void {
  const h = profile.heightM * scale * rng.range(0.85, 1.15);
  const w = h * profile.widthFactor;
  const k = rng.range(0.9, 1.1);
  const rot = rng.range(0, Math.PI);
  addCrossedCards(b, x, y, z, w, h, rot, scaleColour(colour, 0.6), scaleColour(colour, 1.05 * k), ATLAS_CELLS[profile.cell], 0, 1, { normal: normalize({ x: -Math.sin(rot) * 0.35, y: Math.cos(rot) * 0.35, z: 0.9 }), flipU: rng.next() < 0.5 });
  if (profile.flowerColour) {
    const fc = parseColour(profile.flowerColour, [230, 200, 60]);
    addCrossedCards(b, x, y, z + h * 0.9, w * 0.55, w * 0.55, rot, fc, scaleColour(fc, 1.05), ATLAS_CELLS.flower, 0.9, 1, { centred: true, normal: UP });
  }
}

export interface FieldOptions {
  /** Tile seed folded with the field id. */
  seed: number;
  /** Terrain height (absolute, metres) at local x/y. */
  heightAt: (x: number, y: number) => number;
  /** Upper bound on plants for this field (spacing widens beyond it). Default 2500. */
  maxPlants?: number;
  /** 0..1 multiplier on maxPlants. */
  detail?: number;
}

/** Builds a field: plant cards (cutout) and, for paddies, a water-tinted ground polygon (opaque). */
export function buildField(field: FieldSpec, opts: FieldOptions): BucketedMesh {
  const opaque = new MeshBuilder(16, 32);
  const cutout = new MeshBuilder(512, 1024);
  const ring = cleanRing(field.polygon);
  if (!ring) return { opaque: opaque.build(), cutout: cutout.build() };
  const profile = cropProfile(field.crop);
  const rng = new Rng(mixSeed(opts.seed, fnv1a(field.id)));
  const colour = parseColour(field.colour, [120, 140, 60]);
  const a = field.rowAngle;
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = -dy, py = dx;
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const [x, y] of ring) {
    const s = x * dx + y * dy, t = x * px + y * py;
    if (s < smin) smin = s; if (s > smax) smax = s; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  const area = Math.abs(ringArea(ring));
  let rs = profile.rowSpacingM, ps = profile.plantSpacingM;
  const maxPlants = Math.max(50, (opts.maxPlants ?? 2500) * clamp(opts.detail ?? 1, 0.05, 1));
  const est = area / (rs * ps);
  if (est > maxPlants) { const k = Math.sqrt(est / maxPlants); rs *= k; ps *= k; }
  const hw = profile.heightM * profile.widthFactor * 0.5 + 0.05;
  let planted = 0;
  const rows = Math.ceil((tmax - tmin) / rs);
  const cols = Math.ceil((smax - smin) / ps);
  for (let i = 0; i < rows && planted < maxPlants * 1.05; i++) {
    const t = tmin + rs * (i + 0.5);
    for (let j = 0; j < cols; j++) {
      const s = smin + ps * (j + 0.5);
      const jx = (rng.next() - 0.5) * 0.16, jy = (rng.next() - 0.5) * 0.16;
      const x = dx * s + px * t + jx, y = dy * s + py * t + jy;
      if (x - hw < bx0 || x + hw > bx1 || y - hw < by0 || y + hw > by1) continue;
      if (!pointInRing(ring, x, y)) continue;
      addCropPlant(cutout, profile, x, y, opts.heightAt(x, y), rng, colour);
      planted++;
    }
  }
  if (profile.water) addPolygonCap(opaque, ring, (x, y) => opts.heightAt(x, y) + 0.04, [64, 96, 104], true, 0);
  return { opaque: opaque.build(), cutout: cutout.build() };
}
