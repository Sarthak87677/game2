/**
 * Hero footprints where the generic procedural world must not place anything: the Taj Mahal hero owns its terraces
 * and gardens, so procedural buildings, fields and vegetation generated for the tiles under it are dropped here.
 * Pure and cheap (runs once per generated tile, never per frame). Applied by `TerraEngine.generateNearFieldTile`.
 */
import type { NearFieldTile } from '@/world/procedural/types';
import { enuOffsetM } from '@/util/geo';
import { TAJ, TAJ_MAHAL_CENTRE } from './tajMahalGeometry';

export interface HeroExclusionZone {
  id: string;
  lat: number;
  lon: number;
  /** Local ENU rectangle (metres from the centre) kept free of procedural content. */
  west: number;
  east: number;
  south: number;
  north: number;
}

export const HERO_EXCLUSION_ZONES: readonly HeroExclusionZone[] = [
  { id: 'taj-mahal', lat: TAJ_MAHAL_CENTRE.lat, lon: TAJ_MAHAL_CENTRE.lon, west: -TAJ.terraceHalfX - 25, east: TAJ.terraceHalfX + 25, south: TAJ.forecourtSouth - 40, north: TAJ.terraceNorth + 60 },
];

/** Removes procedural placements, buildings and fields of a tile that fall inside a hero zone. Returns the same tile. */
export function applyHeroExclusions(tile: NearFieldTile | null, zones: readonly HeroExclusionZone[] = HERO_EXCLUSION_ZONES): NearFieldTile | null {
  if (!tile) return tile;
  for (const z of zones) {
    // Tile anchor relative to the zone centre; skip tiles that cannot touch the zone (cheap early out).
    const { east: ax, north: ay } = enuOffsetM(z.lat, z.lon, tile.anchorLat, tile.anchorLon);
    if (Math.abs(ax) > 4000 || Math.abs(ay) > 4000) continue;
    const inside = (x: number, y: number): boolean => { const px = ax + x, py = ay + y; return px >= z.west && px <= z.east && py >= z.south && py <= z.north; };
    const before = tile.placements.length + tile.buildings.length + tile.fields.length;
    tile.placements = tile.placements.filter((p) => !inside(p.x, p.y));
    tile.buildings = tile.buildings.filter((b) => b.source !== 'procedural' || !b.footprint.some(([x, y]) => inside(x, y)));
    tile.fields = tile.fields.filter((f) => !f.polygon.some(([x, y]) => inside(x, y)));
    void before; // counts (diagnostics only) are left as generated; the renderer reports what it actually builds
  }
  return tile;
}
