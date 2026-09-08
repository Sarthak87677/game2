#!/usr/bin/env node
/**
 * Exports the shared Maharashtra data layer (`src/data/maharashtra/**`) to JSON data tables for the Unreal Engine 5
 * client under `unreal/TerraInfinite/Content/Data/`.
 *
 * One source of truth: the TypeScript modules are read (never edited) through Vite's SSR loader so that path
 * aliases and extension-less imports resolve exactly as they do for the browser client. The output is a UE
 * `UDataTable`-compatible JSON array per table (one object per row, `Name` = row name) that the C++ side loads at
 * run time with `FJsonObjectConverter` (see `Source/TerraInfinite/Public/Data/*.h` for the row structs).
 *
 * Usage:
 *   node scripts/export-unreal-data.mjs            # (re)write the JSON tables
 *   node scripts/export-unreal-data.mjs --check    # exit 1 if the committed tables are out of date
 *
 * The exporter is deterministic (no timestamps, no commit hashes) so `tests/unit/exportUnrealData.test.ts` can
 * assert that the committed tables equal a fresh export of the current source data.
 *
 * Contract with the other tracks (documented in docs/PLAN_MAHARASHTRA.md): tables are discovered by the SHAPE of the
 * arrays exported from `src/data/maharashtra/index.ts`, not by export name, so each track may name its export freely.
 * Campus specs and interior-grammar parameters are matched by export name (/campus/i, /grammar/i) because their
 * TypeScript types are owned by the interiors track and may still change; unknown fields are preserved in
 * `ExtraJson` so nothing is silently dropped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const OUTPUT_DIR = 'unreal/TerraInfinite/Content/Data';
export const SOURCE_ENTRY = '/src/data/maharashtra/index.ts';

const NOTE = 'Exported from src/data/maharashtra by scripts/export-unreal-data.mjs. Coordinates are approximate public reference values (not surveyed); campuses, interiors, landmark bodies, timetables and tickets are procedural / fictional and must be labelled as such in the UI.';

/* ----------------------------------------------------------------------------------------------------------------
 * Small helpers
 * -------------------------------------------------------------------------------------------------------------- */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const round = (v, digits = 6) => (isNum(v) ? Number(v.toFixed(digits)) : 0);

/** First defined value among the candidate keys, else the fallback. */
function pick(obj, keys, fallback) {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return fallback;
}

function geoPoint(p) {
  if (!isObj(p)) return { Lat: 0, Lon: 0 };
  return { Lat: round(pick(p, ['lat', 'latitude'], 0)), Lon: round(pick(p, ['lon', 'lng', 'longitude'], 0)) };
}

function geoPath(list) {
  return Array.isArray(list) ? list.map(geoPoint) : [];
}

function strList(list) {
  return Array.isArray(list) ? list.filter(isStr) : [];
}

/** Everything not consumed by the row mapping, serialised so UE can still read it (as an FString). */
function extraJson(obj, consumedKeys) {
  const rest = {};
  for (const k of Object.keys(obj).sort()) if (!consumedKeys.includes(k)) rest[k] = obj[k];
  return Object.keys(rest).length ? JSON.stringify(rest) : '';
}

/* ----------------------------------------------------------------------------------------------------------------
 * Table specifications. `match` recognises rows of the table by shape; `map` converts one source item to a UE row.
 * Field names are the C++ UPROPERTY names of the row structs (PascalCase).
 * -------------------------------------------------------------------------------------------------------------- */

export const TABLES = [
  {
    file: 'Spawns.json', rowStruct: 'FTerraSpawnRow', sourceType: 'SpawnPoint[]',
    match: (r) => isObj(r) && isStr(r.id) && isNum(r.lat) && isNum(r.lon) && isNum(r.headingDeg) && isStr(r.region) && typeof r.approximate === 'boolean',
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Region: r.region,
      Lat: round(r.lat), Lon: round(r.lon),
      HeadingDeg: round(r.headingDeg, 2),
      Description: r.description ?? '',
      DataNote: r.dataNote ?? '',
      bApproximate: r.approximate === true,
    }),
  },
  {
    file: 'Destinations.json', rowStruct: 'FTerraDestinationRow', sourceType: 'Destination[]',
    match: (r) => isObj(r) && isStr(r.id) && isStr(r.kind) && isStr(r.district) && isNum(r.lat) && isNum(r.lon) && isNum(r.overviewHeightM),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Kind: r.kind,
      District: r.district,
      Lat: round(r.lat), Lon: round(r.lon),
      OverviewHeightM: round(r.overviewHeightM, 1),
      bHasSpawn: isObj(r.spawn),
      SpawnLat: isObj(r.spawn) ? round(r.spawn.lat) : round(r.lat),
      SpawnLon: isObj(r.spawn) ? round(r.spawn.lon) : round(r.lon),
      SpawnHeadingDeg: isObj(r.spawn) ? round(r.spawn.headingDeg, 2) : 0,
      Tags: strList(r.tags),
      bExternal: r.external === true,
      Description: r.description ?? '',
      DataNote: r.dataNote ?? '',
    }),
  },
  {
    file: 'Stations.json', rowStruct: 'FTerraStationRow', sourceType: 'Station[]',
    match: (r) => isObj(r) && isStr(r.id) && isStr(r.code) && isNum(r.platforms) && isNum(r.lat) && isNum(r.lon),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Code: r.code,
      District: r.district ?? '',
      Lat: round(r.lat), Lon: round(r.lon),
      Platforms: Math.max(0, Math.round(r.platforms)),
      DataNote: r.dataNote ?? '',
    }),
  },
  {
    file: 'RailCorridors.json', rowStruct: 'FTerraRailCorridorRow', sourceType: 'RailCorridor[]',
    match: (r) => isObj(r) && isStr(r.id) && Array.isArray(r.stations) && Array.isArray(r.path) && isStr(r.service),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Service: r.service,
      StationIds: strList(r.stations),
      Path: geoPath(r.path),
      DataNote: r.dataNote ?? '',
    }),
  },
  {
    file: 'Airports.json', rowStruct: 'FTerraAirportRow', sourceType: 'Airport[]',
    match: (r) => isObj(r) && isStr(r.id) && isStr(r.iata) && isNum(r.runwayHeadingDeg) && isNum(r.runwayLengthM),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Iata: r.iata,
      City: r.city ?? '',
      Lat: round(r.lat), Lon: round(r.lon),
      RunwayHeadingDeg: round(r.runwayHeadingDeg, 2),
      RunwayLengthM: round(r.runwayLengthM, 1),
      Terminal: geoPoint(r.terminal),
      DataNote: r.dataNote ?? '',
    }),
  },
  {
    file: 'Ports.json', rowStruct: 'FTerraPortRow', sourceType: 'Port[]',
    match: (r) => isObj(r) && isStr(r.id) && ['jetty', 'harbour', 'marina', 'cruise-terminal'].includes(r.kind) && isNum(r.lat) && isNum(r.lon) && !isStr(r.district),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      Kind: r.kind,
      Lat: round(r.lat), Lon: round(r.lon),
      DataNote: r.dataNote ?? '',
    }),
  },
  {
    file: 'WaterRoutes.json', rowStruct: 'FTerraWaterRouteRow', sourceType: 'WaterRoute[]',
    match: (r) => isObj(r) && isStr(r.id) && isStr(r.vessel) && Array.isArray(r.path) && isStr(r.from) && isStr(r.to),
    map: (r) => ({
      Name: r.id,
      DisplayName: r.name,
      FromPortId: r.from,
      ToPortId: r.to,
      Vessel: r.vessel,
      Path: geoPath(r.path),
      DataNote: r.dataNote ?? '',
    }),
  },
];

/* ----------------------------------------------------------------------------------------------------------------
 * Campus spec and interior grammar (name-matched; shapes owned by the interiors track).
 * -------------------------------------------------------------------------------------------------------------- */

const CAMPUS_KEYS = ['id', 'name', 'lat', 'lon', 'origin', 'position', 'center', 'headingDeg', 'heading', 'buildings', 'dataNote', 'description'];
const BUILDING_KEYS = ['id', 'name', 'category', 'kind', 'type', 'lat', 'lon', 'position', 'origin', 'center', 'headingDeg', 'heading', 'widthM', 'width', 'depthM', 'depth', 'floors', 'levels', 'storeys', 'floorHeightM', 'footprint', 'polygon', 'dataNote', 'description'];

function campusRows(spec, exportName) {
  const campuses = Array.isArray(spec) ? spec.filter(isObj) : isObj(spec) ? [spec] : [];
  const campusOut = [];
  const buildingOut = [];
  campuses.forEach((c, ci) => {
    const origin = pick(c, ['origin', 'position', 'center'], c);
    const id = isStr(c.id) ? c.id : `${exportName}-${ci}`;
    const buildings = Array.isArray(c.buildings) ? c.buildings.filter(isObj) : [];
    campusOut.push({
      Name: id,
      DisplayName: pick(c, ['name'], id),
      Lat: round(pick(origin, ['lat'], 0)), Lon: round(pick(origin, ['lon', 'lng'], 0)),
      HeadingDeg: round(pick(c, ['headingDeg', 'heading'], 0), 2),
      BuildingCount: buildings.length,
      Description: pick(c, ['description'], ''),
      DataNote: pick(c, ['dataNote'], 'Original, fictionalised campus; procedural, not surveyed.'),
      ExtraJson: extraJson(c, CAMPUS_KEYS),
    });
    buildings.forEach((b, bi) => {
      const bo = pick(b, ['position', 'origin', 'center'], b);
      const bid = isStr(b.id) ? b.id : `building-${bi}`;
      buildingOut.push({
        Name: `${id}:${bid}`,
        CampusId: id,
        BuildingId: bid,
        DisplayName: pick(b, ['name'], bid),
        Category: String(pick(b, ['category', 'kind', 'type'], 'generic')),
        Lat: round(pick(bo, ['lat'], 0)), Lon: round(pick(bo, ['lon', 'lng'], 0)),
        HeadingDeg: round(pick(b, ['headingDeg', 'heading'], 0), 2),
        WidthM: round(pick(b, ['widthM', 'width'], 0), 2),
        DepthM: round(pick(b, ['depthM', 'depth'], 0), 2),
        Floors: Math.max(0, Math.round(pick(b, ['floors', 'levels', 'storeys'], 1))),
        FloorHeightM: round(pick(b, ['floorHeightM'], 3.2), 2),
        Footprint: geoPath(pick(b, ['footprint', 'polygon'], [])),
        Description: pick(b, ['description'], ''),
        DataNote: pick(b, ['dataNote'], ''),
        ExtraJson: extraJson(b, BUILDING_KEYS),
      });
    });
  });
  return { campusOut, buildingOut };
}

const GRAMMAR_KEYS = ['category', 'id', 'kind', 'name', 'floorHeightM', 'corridorWidthM', 'roomMinM', 'roomMaxM', 'roomTypes', 'rooms', 'dataNote'];

function grammarRows(spec) {
  const entries = Array.isArray(spec)
    ? spec.filter(isObj).map((g, i) => [String(pick(g, ['category', 'id', 'kind', 'name'], `category-${i}`)), g])
    : isObj(spec) ? Object.entries(spec).filter(([, v]) => isObj(v)) : [];
  return entries.map(([category, g]) => {
    const numeric = {};
    const strings = {};
    for (const k of Object.keys(g).sort()) {
      if (GRAMMAR_KEYS.includes(k)) continue;
      if (isNum(g[k])) numeric[k] = round(g[k], 4);
      else if (isStr(g[k])) strings[k] = g[k];
    }
    const roomTypes = pick(g, ['roomTypes', 'rooms'], []);
    // The interiors vocabulary stores floorHeightM as a [min, max] range and room specs keyed by `kind`.
    const floorH = pick(g, ['floorHeightM'], 3.2);
    const floorHeightM = Array.isArray(floorH) && floorH.length === 2 && floorH.every(isNum) ? (floorH[0] + floorH[1]) / 2 : floorH;
    const roomWidths = Array.isArray(roomTypes) ? roomTypes.map((r) => (isObj(r) ? pick(r, ['widthM', 'width'], null) : null)).filter(isNum) : [];
    return {
      Name: category,
      Category: category,
      FloorHeightM: round(isNum(floorHeightM) ? floorHeightM : 3.2, 2),
      CorridorWidthM: round(pick(g, ['corridorWidthM'], 2.4), 2),
      RoomMinM: round(pick(g, ['roomMinM'], roomWidths.length ? Math.min(...roomWidths) : 3), 2),
      RoomMaxM: round(pick(g, ['roomMaxM'], roomWidths.length ? Math.max(...roomWidths) : 12), 2),
      RoomTypes: Array.isArray(roomTypes) ? roomTypes.map((r) => (isStr(r) ? r : String(pick(r, ['id', 'kind', 'name', 'type'], 'room')))) : [],
      NumericParams: numeric,
      StringParams: strings,
      DataNote: pick(g, ['dataNote'], 'Procedural interior grammar; generated layouts are fictional.'),
      ExtraJson: extraJson(g, [...GRAMMAR_KEYS, ...Object.keys(numeric), ...Object.keys(strings)]),
    };
  });
}

/* ----------------------------------------------------------------------------------------------------------------
 * Build
 * -------------------------------------------------------------------------------------------------------------- */

/**
 * Converts the module namespace of `src/data/maharashtra/index.ts` into `{ files: { [fileName]: json }, manifest }`.
 * Pure and deterministic: identical input always yields identical output.
 */
export function buildExport(dataModule) {
  const exportsList = Object.entries(dataModule ?? {}).filter(([, v]) => typeof v !== 'function');
  const files = {};
  const tables = [];

  for (const spec of TABLES) {
    const rows = [];
    const sources = [];
    // The same object may be re-exported through several arrays (e.g. cities, destinations and the combined
    // "all places" list); count each source object once, and only reject genuinely different rows sharing a name.
    const seenItems = new Set();
    for (const [name, value] of exportsList) {
      if (!Array.isArray(value) || value.length === 0) continue;
      if (!value.every(spec.match)) continue;
      sources.push(name);
      for (const item of value) {
        if (seenItems.has(item)) continue;
        seenItems.add(item);
        rows.push(spec.map(item));
      }
    }
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.Name)) throw new Error(`${spec.file}: duplicate row name "${row.Name}"`);
      seen.add(row.Name);
    }
    files[spec.file] = rows;
    tables.push({ file: spec.file, rowStruct: spec.rowStruct, sourceType: spec.sourceType, sourceExports: sources, rows: rows.length, status: sources.length ? 'exported' : 'missing-in-source' });
  }

  // Campus spec(s)
  const campusExports = exportsList.filter(([n, v]) => /campus/i.test(n) && (isObj(v) || Array.isArray(v)));
  const campusOut = [];
  const buildingOut = [];
  for (const [name, value] of campusExports) {
    const r = campusRows(value, name);
    campusOut.push(...r.campusOut);
    buildingOut.push(...r.buildingOut);
  }
  files['Campuses.json'] = campusOut;
  files['CampusBuildings.json'] = buildingOut;
  tables.push({ file: 'Campuses.json', rowStruct: 'FTerraCampusRow', sourceType: 'campus spec (export name /campus/i)', sourceExports: campusExports.map(([n]) => n), rows: campusOut.length, status: campusExports.length ? 'exported' : 'missing-in-source' });
  tables.push({ file: 'CampusBuildings.json', rowStruct: 'FTerraCampusBuildingRow', sourceType: 'campus spec buildings[]', sourceExports: campusExports.map(([n]) => n), rows: buildingOut.length, status: campusExports.length ? 'exported' : 'missing-in-source' });

  // Interior grammar
  const grammarExports = exportsList.filter(([n, v]) => /grammar/i.test(n) && (isObj(v) || Array.isArray(v)));
  const grammarOut = [];
  for (const [, value] of grammarExports) grammarOut.push(...grammarRows(value));
  files['InteriorGrammar.json'] = grammarOut;
  tables.push({ file: 'InteriorGrammar.json', rowStruct: 'FTerraInteriorGrammarRow', sourceType: 'interior grammar (export name /grammar/i)', sourceExports: grammarExports.map(([n]) => n), rows: grammarOut.length, status: grammarExports.length ? 'exported' : 'missing-in-source' });

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generator: 'scripts/export-unreal-data.mjs',
    sourceEntry: 'src/data/maharashtra/index.ts',
    dataNote: NOTE,
    tables,
  };
  files['Manifest.json'] = manifest;
  return { files, manifest };
}

export function serialize(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Loads the TypeScript data module through Vite (aliases, extension-less imports and TS all resolve as in the app). */
export async function loadDataModule(root) {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  });
  try {
    return await server.ssrLoadModule(SOURCE_ENTRY);
  } finally {
    await server.close();
  }
}

/** Writes (or, with check=true, only compares) the export. Returns the list of files that differ from disk. */
export function writeExport(root, files, { check = false } = {}) {
  const outDir = path.join(root, OUTPUT_DIR);
  if (!check) mkdirSync(outDir, { recursive: true });
  const changed = [];
  for (const [file, value] of Object.entries(files)) {
    const target = path.join(outDir, file);
    const next = serialize(value);
    const prev = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (prev !== next) {
      changed.push(file);
      if (!check) writeFileSync(target, next);
    }
  }
  // Stale tables (removed from TABLES) are deleted so the directory always mirrors the exporter.
  if (existsSync(outDir)) {
    for (const stale of readdirSync(outDir).filter((f) => f.endsWith('.json') && !(f in files))) {
      changed.push(stale);
      if (!check) unlinkSync(path.join(outDir, stale));
    }
  }
  return changed;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const dataModule = await loadDataModule(root);
  const { files, manifest } = buildExport(dataModule);
  const changed = writeExport(root, files, { check });
  for (const t of manifest.tables) {
    const src = t.sourceExports.length ? t.sourceExports.join(', ') : '(no matching export yet)';
    console.log(`${t.status === 'exported' ? '✓' : '·'} ${t.file.padEnd(22)} ${String(t.rows).padStart(4)} rows  ${t.rowStruct.padEnd(26)} ← ${src}`);
  }
  if (check) {
    if (changed.length) {
      console.error(`\nOut of date: ${changed.join(', ')}\nRun: node scripts/export-unreal-data.mjs`);
      process.exit(1);
    }
    console.log('\nUnreal data tables are up to date.');
  } else {
    console.log(changed.length ? `\nWrote ${changed.length} file(s) to ${OUTPUT_DIR}` : `\nNo changes in ${OUTPUT_DIR}`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((err) => { console.error(err); process.exit(1); });
