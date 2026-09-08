/**
 * Keeps the Unreal client's JSON data tables (unreal/TerraInfinite/Content/Data) in sync with the shared
 * TypeScript data layer (src/data/maharashtra). If this test fails, run `node scripts/export-unreal-data.mjs`
 * and commit the regenerated tables.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as maharashtra from '@/data/maharashtra';
import type { Airport, Destination, Port, RailCorridor, Station, WaterRoute } from '@/data/maharashtra';
import type { SpawnPoint } from '@/gameplay/types';
import { buildExport, OUTPUT_DIR, SCHEMA_VERSION, serialize, TABLES } from '../../scripts/export-unreal-data.mjs';

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, OUTPUT_DIR);
const rows = (files: Record<string, unknown>, file: string) => files[file] as Record<string, unknown>[];
const table = (file: string) => TABLES.find((t) => t.file === file)!;

describe('export-unreal-data: committed tables match the shared data layer', () => {
  const { files, manifest } = buildExport(maharashtra as unknown as Record<string, unknown>);

  it('every exported table is committed and identical to a fresh export', () => {
    for (const [file, value] of Object.entries(files)) {
      const target = path.join(outDir, file);
      expect(existsSync(target), `${file} missing — run node scripts/export-unreal-data.mjs`).toBe(true);
      expect(readFileSync(target, 'utf8'), `${file} is out of date — run node scripts/export-unreal-data.mjs`).toBe(serialize(value));
    }
  });

  it('manifest lists every table file with a row struct and a provenance note', () => {
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.dataNote).toMatch(/approximate/i);
    expect(manifest.dataNote).toMatch(/procedural/i);
    const listed = manifest.tables.map((t) => t.file).sort();
    const produced = Object.keys(files).filter((f) => f !== 'Manifest.json').sort();
    expect(listed).toEqual(produced);
    for (const t of manifest.tables) expect(t.rowStruct).toMatch(/^FTerra\w+Row$/);
  });

  it('spawns are exported one-to-one with MAHARASHTRA_SPAWNS and keep their provenance notes', () => {
    const spawns = rows(files, 'Spawns.json');
    expect(spawns.length).toBe(maharashtra.MAHARASHTRA_SPAWNS.length);
    for (const [i, s] of maharashtra.MAHARASHTRA_SPAWNS.entries()) {
      const r = spawns[i];
      expect(r.Name).toBe(s.id);
      expect(r.DisplayName).toBe(s.name);
      expect(r.Lat).toBeCloseTo(s.lat, 5);
      expect(r.Lon).toBeCloseTo(s.lon, 5);
      expect(r.HeadingDeg).toBe(s.headingDeg);
      expect(r.bApproximate).toBe(true);
      expect(String(r.DataNote).length).toBeGreaterThan(10);
    }
    const names = spawns.map((r) => r.Name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is deterministic', () => {
    const again = buildExport(maharashtra as unknown as Record<string, unknown>);
    expect(serialize(again.files)).toBe(serialize(files));
  });
});

describe('export-unreal-data: table detection by shape (contract for the other tracks)', () => {
  const spawn: SpawnPoint = { id: 's', name: 'S', region: 'R', lat: 18.9, lon: 72.8, headingDeg: 90, description: 'd', dataNote: 'approximate', approximate: true };
  const destination: Destination = { id: 'd', name: 'D', kind: 'fort', district: 'Pune', description: 'x', dataNote: 'approximate', overviewHeightM: 800, lat: 18.5, lon: 73.8, spawn: { lat: 18.51, lon: 73.81, headingDeg: 45 }, tags: ['hero'] };
  const station: Station = { id: 'csmt', name: 'CSMT', code: 'CSMT', district: 'Mumbai', platforms: 18, lat: 18.94, lon: 72.835 };
  const corridor: RailCorridor = { id: 'c', name: 'C', stations: ['csmt', 'pune'], path: [{ lat: 18.94, lon: 72.835 }, { lat: 18.53, lon: 73.87 }], service: 'intercity' };
  const airport: Airport = { id: 'bom', name: 'Mumbai', iata: 'BOM', city: 'Mumbai', runwayHeadingDeg: 270, runwayLengthM: 3445, terminal: { lat: 19.09, lon: 72.87 }, lat: 19.0896, lon: 72.8656 };
  const port: Port = { id: 'gateway-jetty', name: 'Gateway jetty', kind: 'jetty', lat: 18.9215, lon: 72.8347 };
  const waterRoute: WaterRoute = { id: 'w', name: 'W', from: 'gateway-jetty', to: 'mandwa', path: [{ lat: 18.92, lon: 72.83 }, { lat: 18.8, lon: 72.99 }], vessel: 'ferry' };

  const fixture = {
    SPAWNS: [spawn], DESTS: [destination], STATIONS: [station], CORRIDORS: [corridor], AIRPORTS: [airport], PORTS: [port], WATER: [waterRoute],
    MAHARASHTRA_CAMPUS: { id: 'campus', name: 'Campus', origin: { lat: 16.73, lon: 74.40 }, headingDeg: 20, dataNote: 'fictional', buildings: [{ id: 'library', name: 'Library', category: 'library', position: { lat: 16.731, lon: 74.401 }, floors: 3, widthM: 40, depthM: 20, footprint: [{ lat: 16.731, lon: 74.401 }], custom: 7 }] },
    INTERIOR_GRAMMAR: { library: { floorHeightM: 4, corridorWidthM: 3, roomTypes: ['reading-room', 'stacks'], shelfSpacingM: 1.2, palette: 'warm', nested: { a: 1 } } },
    helper: () => 1,
  };
  const { files, manifest } = buildExport(fixture);

  it('each typed table matches exactly its own shape', () => {
    const samples: Record<string, unknown> = { 'Spawns.json': spawn, 'Destinations.json': destination, 'Stations.json': station, 'RailCorridors.json': corridor, 'Airports.json': airport, 'Ports.json': port, 'WaterRoutes.json': waterRoute };
    for (const spec of TABLES) {
      for (const [file, sample] of Object.entries(samples)) {
        expect(spec.match(sample), `${spec.file}.match(${file} sample)`).toBe(file === spec.file);
      }
    }
  });

  it('maps every table to PascalCase UE rows named by id', () => {
    expect(rows(files, 'Destinations.json')[0]).toMatchObject({ Name: 'd', Kind: 'fort', District: 'Pune', bHasSpawn: true, SpawnHeadingDeg: 45, Tags: ['hero'], bExternal: false, OverviewHeightM: 800 });
    expect(rows(files, 'Stations.json')[0]).toMatchObject({ Name: 'csmt', Code: 'CSMT', Platforms: 18 });
    expect(rows(files, 'RailCorridors.json')[0]).toMatchObject({ Name: 'c', Service: 'intercity', StationIds: ['csmt', 'pune'], Path: [{ Lat: 18.94, Lon: 72.835 }, { Lat: 18.53, Lon: 73.87 }] });
    expect(rows(files, 'Airports.json')[0]).toMatchObject({ Name: 'bom', Iata: 'BOM', RunwayHeadingDeg: 270, RunwayLengthM: 3445, Terminal: { Lat: 19.09, Lon: 72.87 } });
    expect(rows(files, 'Ports.json')[0]).toMatchObject({ Name: 'gateway-jetty', Kind: 'jetty' });
    expect(rows(files, 'WaterRoutes.json')[0]).toMatchObject({ Name: 'w', FromPortId: 'gateway-jetty', ToPortId: 'mandwa', Vessel: 'ferry' });
    for (const spec of TABLES) {
      for (const r of rows(files, spec.file)) expect(typeof r.Name).toBe('string');
    }
    expect(manifest.tables.every((t) => t.status === 'exported')).toBe(true);
  });

  it('campus specs become a campus row plus one row per building, preserving unknown fields', () => {
    expect(rows(files, 'Campuses.json')[0]).toMatchObject({ Name: 'campus', Lat: 16.73, Lon: 74.4, HeadingDeg: 20, BuildingCount: 1, DataNote: 'fictional' });
    const b = rows(files, 'CampusBuildings.json')[0];
    expect(b).toMatchObject({ Name: 'campus:library', CampusId: 'campus', BuildingId: 'library', Category: 'library', Floors: 3, WidthM: 40, DepthM: 20, Lat: 16.731, Lon: 74.401 });
    expect(JSON.parse(String(b.ExtraJson))).toEqual({ custom: 7 });
  });

  it('interior grammar becomes one row per category with numeric/string parameter maps', () => {
    const g = rows(files, 'InteriorGrammar.json')[0];
    expect(g).toMatchObject({ Name: 'library', Category: 'library', FloorHeightM: 4, CorridorWidthM: 3, RoomTypes: ['reading-room', 'stacks'], NumericParams: { shelfSpacingM: 1.2 }, StringParams: { palette: 'warm' } });
    expect(JSON.parse(String(g.ExtraJson))).toEqual({ nested: { a: 1 } });
  });

  it('reports tables that have no source yet instead of inventing rows', () => {
    const { files: empty, manifest: m } = buildExport({ ONLY: [spawn] });
    expect(rows(empty, 'Stations.json')).toEqual([]);
    expect(m.tables.find((t) => t.file === 'Stations.json')?.status).toBe('missing-in-source');
    expect(m.tables.find((t) => t.file === 'Spawns.json')?.status).toBe('exported');
  });

  it('counts the same object once when it is re-exported through several arrays', () => {
    const out = buildExport({ A: [spawn], B: [spawn], All: [spawn] });
    expect(out.files['Spawns.json']).toHaveLength(1);
  });

  it('rejects duplicate row names across exports', () => {
    expect(() => buildExport({ A: [spawn], B: [{ ...spawn }] })).toThrow(/duplicate row name/);
  });

  it('spawns match the SpawnPoint contract fields used by the UE row struct', () => {
    expect(table('Spawns.json').map(spawn)).toEqual({ Name: 's', DisplayName: 'S', Region: 'R', Lat: 18.9, Lon: 72.8, HeadingDeg: 90, Description: 'd', DataNote: 'approximate', bApproximate: true });
  });
});
