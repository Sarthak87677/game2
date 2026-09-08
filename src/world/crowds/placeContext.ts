/**
 * Classifies where the player is (station forecourt, market, campus, village lane, open country, coast…) from the
 * curated hotspot table, loaded OSM features, the climate atlas and the procedural near-field stats. Shared by the
 * crowds and wildlife systems (a utility, not a gameplay system).
 */
import type { TerraEngine } from '@/engine/TerraEngine';
import { CROWD_HOTSPOTS, type AmbienceKind, type CrowdHotspot } from '@/data/maharashtra/living';
import { haversineM } from '@/util/geo';
import type { PaletteId } from './palettes';
import type { PlaceKind } from './density';

export interface PlaceContext {
  kind: PlaceKind;
  palette: PaletteId;
  hotspot: CrowdHotspot | null;
  hotspotDistM: number;
  ambience: AmbienceKind;
  coastal: boolean;
  biome: string;
  /** OSM buildings in the tile under the point (0 when no OSM). */
  buildings: number;
  farmland: boolean;
  park: boolean;
  forest: boolean;
  elevationM: number;
  /** Whether any OSM tile is loaded under the point. */
  osm: boolean;
}

export function nearestHotspot(lat: number, lon: number): { hotspot: CrowdHotspot; distM: number } | null {
  let best: CrowdHotspot | null = null;
  let bestD = Infinity;
  for (const h of CROWD_HOTSPOTS) {
    if (Math.abs(h.lat - lat) > 0.02 || Math.abs(h.lon - lon) > 0.02) continue;
    const d = haversineM(lat, lon, h.lat, h.lon);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best ? { hotspot: best, distM: bestD } : null;
}

export function paletteFor(kind: PlaceKind): PaletteId {
  switch (kind) {
    case 'station': return 'station';
    case 'market': return 'market';
    case 'campus': return 'campus';
    case 'temple': return 'temple';
    case 'beach': case 'promenade': case 'lake': return 'coast';
    case 'village': case 'rural': return 'village';
    default: return 'city';
  }
}

export function classifyPlace(engine: TerraEngine, lat: number, lon: number): PlaceContext {
  const near = nearestHotspot(lat, lon);
  const hotspot = near && near.distM <= near.hotspot.radiusM ? near.hotspot : null;
  const tile = engine.osm?.tileFor(lat, lon) ?? null;
  const buildings = tile ? tile.buildings.length : 0;
  const landUse = engine.osm?.landUseAt(lat, lon) ?? null;
  const sample = engine.worldMap?.sample(lat, lon, engine.naturalEarth?.isLand(lat, lon) ?? true) ?? null;
  const biome = sample?.biome ?? 'unknown';
  const coastal = (sample?.distCoastKm ?? 999) < 1.5 || hotspot?.kind === 'beach';
  const nf = engine.nearFieldStats;
  const farmland = landUse === 'farmland' || landUse === 'orchard' || (!!nf && nf.fields > 0 && buildings < 20);
  const park = landUse === 'park' || landUse === 'grass' || hotspot?.kind === 'park' || hotspot?.kind === 'campus' || hotspot?.kind === 'lake';
  const forest = landUse === 'forest' || (/forest|rainforest/.test(biome) && buildings < 5 && !hotspot);
  const elevationM = sample?.elevationM ?? 0;
  let kind: PlaceKind;
  if (hotspot) kind = hotspot.kind;
  else if (tile) kind = buildings > 70 ? 'urban' : buildings > 18 ? 'suburban' : buildings > 3 ? 'rural' : 'none';
  else if (near && near.distM < near.hotspot.radiusM * 3) kind = near.hotspot.kind === 'village' ? 'rural' : 'suburban';
  else kind = nf && nf.buildings > 25 ? 'suburban' : nf && nf.buildings > 3 ? 'rural' : 'none';
  let ambience: AmbienceKind;
  if (kind === 'station') ambience = 'station';
  else if (coastal) ambience = 'coast';
  else if (kind === 'urban' || kind === 'market' || kind === 'promenade' || kind === 'temple' || kind === 'monument' || kind === 'suburban') ambience = 'city';
  else if (forest) ambience = 'forest';
  else if (elevationM > 600) ambience = 'hills';
  else ambience = 'village';
  return { kind, palette: paletteFor(kind), hotspot, hotspotDistM: near?.distM ?? Infinity, ambience, coastal, biome, buildings, farmland, park, forest, elevationM, osm: !!tile };
}

/**
 * Ground height fallback used by every living-world system when the globe has no terrain loaded under a point (the
 * sandbox cannot reach the terrain host): the player's body height when embodied (it stands on the same surface),
 * else the climate-atlas elevation, else sea level.
 */
export function groundFallback(engine: TerraEngine, player: { embodied: boolean; lat: number; lon: number; heightM: number; mode: string }): number {
  if (player.embodied && player.mode !== 'passenger') return player.heightM;
  return Math.max(0, engine.worldMap?.sample(player.lat, player.lon).elevationM ?? 0);
}
