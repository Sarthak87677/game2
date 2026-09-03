/** Pure parsing of Overpass JSON (out body geom) into FeatureTile records. Cesium-free and unit-tested. */
import type { FeatureTile, HeightSource, LandUseKind, LonLat, OsmBuilding, OsmLandUse, OsmPoi, OsmRoad, OsmWater, RoadKind, WaterKind } from './types';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}
export interface OverpassResponse { elements: OverpassElement[]; remark?: string }

export const LEVEL_HEIGHT_M = 3.2;

const DEFAULT_LEVELS: Record<string, number> = {
  house: 2, detached: 2, semidetached_house: 2, terrace: 2, bungalow: 1, hut: 1, shed: 1, garage: 1, garages: 1, cabin: 1, farm: 2, farm_auxiliary: 1, barn: 2,
  residential: 3, apartments: 5, dormitory: 4, hotel: 6, commercial: 4, office: 6, retail: 2, supermarket: 1, warehouse: 2, industrial: 2, school: 2, university: 4, hospital: 5,
  church: 5, cathedral: 8, mosque: 4, temple: 4, synagogue: 3, chapel: 3, stadium: 6, train_station: 3, public: 3, civic: 3, government: 4, yes: 2,
};

/** Parses OSM height tags like "12", "12 m", "40 ft", "12.5m". */
export function parseHeight(tag: string | undefined): number | null {
  if (!tag) return null;
  const m = tag.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(m|ft|feet|')?$/i);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  return /ft|feet|'/i.test(m[2] ?? '') ? v * 0.3048 : v;
}

export function buildingHeight(tags: Record<string, string>): { heightM: number; levels: number | null; source: HeightSource } {
  const h = parseHeight(tags.height) ?? parseHeight(tags['building:height']);
  const levelsRaw = Number(tags['building:levels']);
  const levels = Number.isFinite(levelsRaw) && levelsRaw > 0 ? levelsRaw : null;
  if (h) return { heightM: Math.min(h, 1000), levels, source: 'tag' };
  if (levels) return { heightM: Math.min(levels * LEVEL_HEIGHT_M + 1, 900), levels, source: 'levels' };
  const type = tags.building ?? 'yes';
  const guess = DEFAULT_LEVELS[type] ?? (tags.amenity === 'place_of_worship' ? 5 : 2);
  return { heightM: guess * LEVEL_HEIGHT_M + 1, levels: null, source: 'inferred' };
}

export function roadKind(tags: Record<string, string>): RoadKind | null {
  if (tags.railway) return /^(rail|light_rail|subway|tram|narrow_gauge)$/.test(tags.railway) ? 'rail' : null;
  const h = tags.highway;
  if (!h) return null;
  if (/^(motorway|trunk|primary|secondary|tertiary|residential|service|track|path|pedestrian)$/.test(h)) return h as RoadKind;
  if (/_link$/.test(h)) return h.replace('_link', '') as RoadKind;
  if (/^(living_street|unclassified|road)$/.test(h)) return 'residential';
  if (/^(footway|cycleway|bridleway|steps)$/.test(h)) return 'path';
  return 'other';
}

export const ROAD_WIDTH_M: Record<RoadKind, number> = { motorway: 24, trunk: 18, primary: 14, secondary: 11, tertiary: 9, residential: 7, service: 4.5, track: 3, path: 1.8, pedestrian: 5, rail: 3.5, other: 5 };

export function landUseKind(tags: Record<string, string>): LandUseKind | null {
  const lu = tags.landuse;
  if (lu) {
    if (lu === 'forest') return 'forest';
    if (lu === 'farmland' || lu === 'farmyard' || lu === 'allotments') return 'farmland';
    if (lu === 'residential') return 'residential';
    if (lu === 'industrial' || lu === 'railway' || lu === 'quarry') return 'industrial';
    if (lu === 'commercial' || lu === 'retail') return 'commercial';
    if (lu === 'grass' || lu === 'meadow' || lu === 'recreation_ground' || lu === 'village_green' || lu === 'cemetery') return 'grass';
    if (lu === 'orchard') return 'orchard';
    if (lu === 'vineyard') return 'vineyard';
    return 'other';
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve') return 'park';
  if (tags.leisure === 'pitch' || tags.leisure === 'golf_course') return 'grass';
  const n = tags.natural;
  if (n === 'wood') return 'forest';
  if (n === 'wetland') return 'wetland';
  if (n === 'scrub' || n === 'heath') return 'scrub';
  if (n === 'grassland') return 'grass';
  if (n === 'beach' || n === 'sand') return 'beach';
  return null;
}

function toLonLat(g: { lat: number; lon: number }[] | undefined): LonLat[] {
  return (g ?? []).map((p) => [p.lon, p.lat]);
}

function isClosed(c: LonLat[]): boolean {
  return c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
}

function centroid(c: LonLat[]): LonLat {
  let x = 0, y = 0;
  const n = Math.max(1, c.length - (isClosed(c) ? 1 : 0));
  for (let i = 0; i < n; i++) { x += c[i][0]; y += c[i][1]; }
  return [x / n, y / n];
}

/** Assembles relation member ways into closed rings by chaining shared endpoints. */
export function assembleRings(ways: LonLat[][]): LonLat[][] {
  const pending = ways.map((w) => w.slice()).filter((w) => w.length >= 2);
  const rings: LonLat[][] = [];
  const same = (a: LonLat, b: LonLat) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  while (pending.length) {
    let ring = pending.shift()!;
    let extended = true;
    while (!isClosed(ring) && extended) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const w = pending[i];
        const end = ring[ring.length - 1];
        if (same(end, w[0])) { ring = ring.concat(w.slice(1)); pending.splice(i, 1); extended = true; break; }
        if (same(end, w[w.length - 1])) { ring = ring.concat(w.slice(0, -1).reverse()); pending.splice(i, 1); extended = true; break; }
        const start = ring[0];
        if (same(start, w[w.length - 1])) { ring = w.slice(0, -1).concat(ring); pending.splice(i, 1); extended = true; break; }
        if (same(start, w[0])) { ring = w.slice(1).reverse().concat(ring); pending.splice(i, 1); extended = true; break; }
      }
    }
    if (!isClosed(ring) && ring.length >= 3) ring.push(ring[0]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function ringArea(r: LonLat[]): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2);
}

export function parseOverpass(json: OverpassResponse, tile: { z: number; x: number; y: number; bbox: FeatureTile['bbox'] }, fetchedAt: number, source: FeatureTile['source'] = 'network'): FeatureTile {
  const buildings: OsmBuilding[] = [];
  const roads: OsmRoad[] = [];
  const water: OsmWater[] = [];
  const landuse: OsmLandUse[] = [];
  const pois: OsmPoi[] = [];
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    if (el.type === 'node') {
      if (tags.place && /^(city|town|village|hamlet|suburb|neighbourhood)$/.test(tags.place) && tags.name && el.lat !== undefined && el.lon !== undefined) {
        const pop = Number(tags.population);
        pois.push({ id: `n${el.id}`, name: tags.name, kind: tags.place, lat: el.lat, lon: el.lon, population: Number.isFinite(pop) ? pop : null });
      } else if (tags.name && el.lat !== undefined && el.lon !== undefined && (tags.tourism || tags.amenity || tags.historic)) {
        pois.push({ id: `n${el.id}`, name: tags.name, kind: tags.tourism ?? tags.amenity ?? tags.historic ?? 'poi', lat: el.lat, lon: el.lon, population: null });
      }
      continue;
    }
    let outer: LonLat[] | null = null;
    let holes: LonLat[][] = [];
    let line: LonLat[] | null = null;
    if (el.type === 'way') {
      const coords = toLonLat(el.geometry);
      if (coords.length < 2) continue;
      if (isClosed(coords)) outer = coords;
      line = coords;
    } else if (el.type === 'relation') {
      if (tags.type !== 'multipolygon' && !tags.building && !tags.natural) continue;
      const outers = assembleRings((el.members ?? []).filter((m) => m.role === 'outer' || m.role === '').map((m) => toLonLat(m.geometry)));
      const inners = assembleRings((el.members ?? []).filter((m) => m.role === 'inner').map((m) => toLonLat(m.geometry)));
      if (outers.length === 0) continue;
      outers.sort((a, b) => ringArea(b) - ringArea(a));
      outer = outers[0];
      holes = inners;
      // Additional outers become separate features with the same tags.
      for (let i = 1; i < outers.length; i++) {
        json.elements.push({ type: 'way', id: el.id * 1000 + i, tags, geometry: outers[i].map(([lon, lat]) => ({ lat, lon })) });
      }
    }
    const id = `${el.type[0]}${el.id}`;
    if (tags.building && tags.building !== 'no' && outer) {
      const h = buildingHeight(tags);
      buildings.push({ id, outer, holes, heightM: h.heightM, levels: h.levels, heightSource: h.source, type: tags.building, name: tags.name ?? null, centroid: centroid(outer) });
      continue;
    }
    const rk = roadKind(tags);
    if (rk && line) {
      const lanes = Number(tags.lanes);
      const w = parseHeight(tags.width);
      roads.push({ id, kind: rk, coords: line, name: tags.name ?? null, widthM: w ?? (Number.isFinite(lanes) && lanes > 0 ? lanes * 3.3 : ROAD_WIDTH_M[rk]), bridge: tags.bridge === 'yes', tunnel: tags.tunnel === 'yes', lanes: Number.isFinite(lanes) ? lanes : null, oneway: tags.oneway === 'yes' });
      continue;
    }
    if (tags.waterway && line && !outer) {
      const kind: WaterKind = tags.waterway === 'river' ? 'river' : tags.waterway === 'stream' ? 'stream' : tags.waterway === 'canal' ? 'canal' : 'other';
      const w = parseHeight(tags.width);
      water.push({ id, kind, polygon: null, line, name: tags.name ?? null, widthM: w ?? (kind === 'river' ? 30 : kind === 'canal' ? 12 : 4) });
      continue;
    }
    if ((tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') && outer) {
      const kind: WaterKind = tags.water === 'river' || tags.waterway === 'riverbank' ? 'river' : tags.water === 'reservoir' || tags.landuse === 'reservoir' ? 'reservoir' : tags.water === 'lake' || tags.natural === 'water' ? 'lake' : 'other';
      water.push({ id, kind, polygon: outer, line: null, name: tags.name ?? null, widthM: 0 });
      continue;
    }
    const lk = landUseKind(tags);
    if (lk && outer) landuse.push({ id, kind: lk, polygon: outer, name: tags.name ?? null });
  }
  return { key: `${tile.z}/${tile.x}/${tile.y}`, z: tile.z, x: tile.x, y: tile.y, bbox: tile.bbox, buildings, roads, water, landuse, pois, fetchedAt, source, truncated: !!json.remark && /runtime error|timeout|memory/i.test(json.remark) };
}
