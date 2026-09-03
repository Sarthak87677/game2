import type { WorldMap } from '@/world/worldMap';
import type { OsmLayer } from '@/world/osm/OsmLayer';
import type { OfflineGazetteer } from '@/data/geocoding/offlineIndex';
import { tileBounds, haversineM } from '@/util/geo';
import type { GenerationContext } from '@/world/procedural/types';
import type { HeightFieldSource } from './heightField';

export interface ContextBuilderDeps {
  worldMap: () => WorldMap | null;
  osm: () => OsmLayer | null;
  gazetteer: () => OfflineGazetteer | null;
  heightFields: HeightFieldSource;
  date: () => Date;
  density: () => number;
}

/**
 * Estimated urban density 0..1 at a point from Natural Earth populated places: population sets an influence radius
 * (≈ 1 km for a village of 4k, ≈ 2.3 km for a town of 20k, capped at 25 km for megacities) with a smooth fall-off. This is an INFERENCE used only
 * where OpenStreetMap buildings are unavailable.
 */
export function urbanDensityFromPlaces(places: { lat: number; lon: number; pop: number }[], lat: number, lon: number): number {
  let best = 0;
  for (const p of places) {
    if (p.pop < 2000) continue;
    const radiusM = Math.min(25_000, 600 * Math.pow(Math.max(1, p.pop) / 1000, 0.45));
    const d = haversineM(lat, lon, p.lat, p.lon);
    if (d > radiusM * 1.6) continue;
    const core = Math.min(1, Math.log10(Math.max(1, p.pop)) / 7);
    const fall = d <= radiusM ? 1 - 0.5 * (d / radiusM) : Math.max(0, 1 - (d - radiusM) / (radiusM * 0.6)) * 0.5;
    best = Math.max(best, core * fall);
  }
  return Math.min(1, best);
}

/** Assembles a GenerationContext for a near-field tile from the loaded world data (null when the atlas is not ready). */
export async function buildGenerationContext(deps: ContextBuilderDeps, z: number, x: number, y: number): Promise<GenerationContext | null> {
  const wm = deps.worldMap();
  if (!wm) return null;
  const b = tileBounds(x, y, z);
  const lat = (b.north + b.south) / 2;
  const lon = (b.east + b.west) / 2;
  const sample = wm.sample(lat, lon);
  const heightField = await deps.heightFields.forTile(z, x, y);
  const osmLayer = deps.osm();
  const osm = osmLayer?.tileFor(lat, lon) ?? null;
  const gaz = deps.gazetteer();
  const nearest = gaz ? gaz.nearest(lat, lon, 6) : [];
  const places = nearest.map((n) => ({ lat: n.lat, lon: n.lon, pop: (n as unknown as { population?: number }).population ?? (n.kind === 'capital' ? 1_000_000 : n.kind === 'city' ? 200_000 : 0), name: n.name }));
  const urbanDensity = osm && osm.buildings.length > 0 ? Math.min(1, 0.2 + osm.buildings.length / 600) : urbanDensityFromPlaces(places, lat, lon);
  const settlement = nearest.length > 0 ? nearest[0].name : null;
  return {
    z, x, y,
    dateIso: deps.date().toISOString(),
    biome: sample.biome,
    koppen: sample.koppen,
    monthlyTempC: sample.monthlyTempC,
    monthlyPrecipMm: sample.monthlyPrecipMm,
    distCoastKm: sample.distCoastKm,
    surface: sample.surface,
    heightField,
    osm,
    urbanDensity,
    settlementName: settlement,
    density: deps.density(),
  };
}
