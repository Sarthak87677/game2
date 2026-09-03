/**
 * Natural Earth reference vectors (public domain) loaded from /data/ne/*.json (see scripts/process-assets.mjs).
 * Provides land/lake/glacier polygons, rivers, countries, physical regions and ocean names with spatial queries.
 * Pure TypeScript except for optional Path2D caching used by the canvas rasterisers.
 */
import { bboxContains, bboxIntersects, bboxOfRings, linesOf, pointInPolygon, polygonsOf, type BBox, type Feature, type FeatureCollection, type Geometry, type Position } from './geometry';

export type FetchJson = (url: string) => Promise<unknown>;

export interface IndexedPolygon<P> { bbox: BBox; rings: Position[][]; props: P; area: number }
export interface IndexedLine<P> { bbox: BBox; coords: Position[]; props: P }

export class PolygonSet<P = Record<string, unknown>> {
  readonly items: IndexedPolygon<P>[] = [];
  private path2d: Path2D | null = null;

  constructor(fc: FeatureCollection<P> | null) {
    if (!fc) return;
    for (const f of fc.features) {
      for (const rings of polygonsOf(f.geometry)) {
        if (rings.length === 0 || rings[0].length < 4) continue;
        const bbox = bboxOfRings(rings);
        this.items.push({ bbox, rings, props: f.properties, area: (bbox.east - bbox.west) * (bbox.north - bbox.south) });
      }
    }
    // Largest first so the most significant polygon wins ties in "at" queries and rasterises first.
    this.items.sort((a, b) => b.area - a.area);
  }

  /** Polygon containing the point, or null. Largest wins by default; `smallest` picks the most specific (e.g. a desert inside a continent). */
  at(lat: number, lon: number, smallest = false): IndexedPolygon<P> | null {
    let found: IndexedPolygon<P> | null = null;
    for (const it of this.items) {
      if (bboxContains(it.bbox, lon, lat) && pointInPolygon(it.rings, lon, lat)) {
        if (!smallest) return it;
        found = it; // items are sorted largest → smallest, so the last hit is the most specific
      }
    }
    return found;
  }

  contains(lat: number, lon: number): boolean {
    return this.at(lat, lon) !== null;
  }

  intersecting(b: BBox): IndexedPolygon<P>[] {
    return this.items.filter((it) => bboxIntersects(it.bbox, b));
  }

  /** Cached Path2D in raw lon/lat coordinates (x = lon, y = lat); callers apply a canvas transform. */
  get path(): Path2D {
    if (!this.path2d) {
      const p = new Path2D();
      for (const it of this.items) for (const ring of it.rings) {
        p.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) p.lineTo(ring[i][0], ring[i][1]);
        p.closePath();
      }
      this.path2d = p;
    }
    return this.path2d;
  }
}

export class LineSet<P = Record<string, unknown>> {
  readonly items: IndexedLine<P>[] = [];
  private path2d: Path2D | null = null;
  constructor(fc: FeatureCollection<P> | null) {
    if (!fc) return;
    for (const f of fc.features) for (const coords of linesOf(f.geometry)) {
      if (coords.length < 2) continue;
      this.items.push({ bbox: bboxOfRings([coords]), coords, props: f.properties });
    }
  }
  intersecting(b: BBox): IndexedLine<P>[] {
    return this.items.filter((it) => bboxIntersects(it.bbox, b));
  }
  get path(): Path2D {
    if (!this.path2d) {
      const p = new Path2D();
      for (const it of this.items) {
        p.moveTo(it.coords[0][0], it.coords[0][1]);
        for (let i = 1; i < it.coords.length; i++) p.lineTo(it.coords[i][0], it.coords[i][1]);
      }
      this.path2d = p;
    }
    return this.path2d;
  }
}

export interface CountryProps { name: string; iso2: string | null; continent: string | null; pop: number | null }
export interface RegionProps { name: string; kind: string; region: string | null }
export interface MarineProps { name: string; kind: string }
export interface NamedProps { name: string | null }
export interface RiverProps { name: string | null; rank: number }

export interface NaturalEarthFiles {
  land: FeatureCollection | null;
  landCoarse: FeatureCollection | null;
  lakes: FeatureCollection<NamedProps> | null;
  glaciers: FeatureCollection<NamedProps> | null;
  rivers: FeatureCollection<RiverProps> | null;
  countries: FeatureCollection<CountryProps> | null;
  regions: FeatureCollection<RegionProps> | null;
  marine: FeatureCollection<MarineProps> | null;
}

export type SurfaceKind = 'ocean' | 'land' | 'lake' | 'glacier';

export interface SurfaceInfo {
  kind: SurfaceKind;
  country: CountryProps | null;
  region: RegionProps | null;
  marine: MarineProps | null;
  lakeName: string | null;
}

/** Loaded Natural Earth index. Construct via NaturalEarth.load(). */
export class NaturalEarth {
  readonly land: PolygonSet;
  readonly landCoarse: PolygonSet;
  readonly lakes: PolygonSet<NamedProps>;
  readonly glaciers: PolygonSet<NamedProps>;
  readonly rivers: LineSet<RiverProps>;
  readonly countries: PolygonSet<CountryProps>;
  readonly regions: PolygonSet<RegionProps>;
  readonly marine: PolygonSet<MarineProps>;

  constructor(files: NaturalEarthFiles) {
    this.land = new PolygonSet(files.land);
    this.landCoarse = new PolygonSet(files.landCoarse);
    this.lakes = new PolygonSet(files.lakes);
    this.glaciers = new PolygonSet(files.glaciers);
    this.rivers = new LineSet(files.rivers);
    this.countries = new PolygonSet(files.countries);
    this.regions = new PolygonSet(files.regions);
    this.marine = new PolygonSet(files.marine);
  }

  static async load(fetchJson: FetchJson, baseUrl = '/data/ne', onProgress?: (loaded: number, total: number) => void): Promise<NaturalEarth> {
    const names: (keyof NaturalEarthFiles)[] = ['land', 'landCoarse', 'lakes', 'glaciers', 'rivers', 'countries', 'regions', 'marine'];
    const fileNames: Record<keyof NaturalEarthFiles, string> = {
      land: 'land_50m.json', landCoarse: 'land_110m.json', lakes: 'lakes_50m.json', glaciers: 'glaciated_50m.json',
      rivers: 'rivers_50m.json', countries: 'countries_110m.json', regions: 'regions_110m.json', marine: 'marine_110m.json',
    };
    let loaded = 0;
    const files: Partial<NaturalEarthFiles> = {};
    await Promise.all(names.map(async (n) => {
      try {
        files[n] = (await fetchJson(`${baseUrl}/${fileNames[n]}`)) as never;
      } catch (e) {
        console.warn(`[natural-earth] failed to load ${fileNames[n]}`, e);
        files[n] = null as never;
      }
      loaded++;
      onProgress?.(loaded, names.length);
    }));
    return new NaturalEarth(files as NaturalEarthFiles);
  }

  /** What is at the surface at this point according to Natural Earth 1:50m vectors. */
  surfaceAt(lat: number, lon: number): SurfaceInfo {
    const glacier = this.glaciers.at(lat, lon);
    const lake = glacier ? null : this.lakes.at(lat, lon);
    const isLand = glacier !== null || lake !== null || this.land.contains(lat, lon);
    const kind: SurfaceKind = glacier ? 'glacier' : lake ? 'lake' : isLand ? 'land' : 'ocean';
    const country = isLand ? this.countries.at(lat, lon)?.props ?? null : null;
    const region = this.regions.at(lat, lon, true)?.props ?? null;
    const marine = kind === 'ocean' ? this.marine.at(lat, lon)?.props ?? null : null;
    return { kind, country, region, marine, lakeName: lake?.props.name ?? null };
  }

  isLand(lat: number, lon: number): boolean {
    return this.land.contains(lat, lon) || this.lakes.contains(lat, lon) || this.glaciers.contains(lat, lon);
  }

  /** Serialisable geometry bundle for workers (land + lakes + glaciers rings). */
  toWorkerBundle(): { land: Position[][][]; lakes: Position[][][]; glaciers: Position[][][] } {
    return {
      land: this.land.items.map((i) => i.rings),
      lakes: this.lakes.items.map((i) => i.rings),
      glaciers: this.glaciers.items.map((i) => i.rings),
    };
  }
}

export function featureGeometry(f: Feature): Geometry {
  return f.geometry;
}
