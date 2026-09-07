/**
 * Sightings registry: the wildlife system reports which species are currently simulated near the player; the
 * activities system reads it for "nature observation". A tiny module-level store so the two gameplay systems never
 * import each other.
 */
export interface Sighting {
  species: string;
  label: string;
  lat: number;
  lon: number;
  /** performance.now() of the last report. */
  at: number;
  count: number;
}

const TTL_MS = 30_000;
const sightings = new Map<string, Sighting>();

export function reportSighting(species: string, label: string, lat: number, lon: number, count: number, nowMs: number): void {
  const s = sightings.get(species);
  if (s) { s.lat = lat; s.lon = lon; s.at = nowMs; s.count = count; s.label = label; }
  else sightings.set(species, { species, label, lat, lon, at: nowMs, count });
}

/** Fresh sightings within `radiusM` (haversine-free: flat approximation is fine at these ranges). */
export function nearbySightings(lat: number, lon: number, radiusM: number, nowMs: number): Sighting[] {
  const out: Sighting[] = [];
  const mLat = 111_132, mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  for (const s of sightings.values()) {
    if (nowMs - s.at > TTL_MS) continue;
    const dx = (s.lon - lon) * mLon, dy = (s.lat - lat) * mLat;
    if (dx * dx + dy * dy <= radiusM * radiusM) out.push(s);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function clearSightings(): void { sightings.clear(); }
