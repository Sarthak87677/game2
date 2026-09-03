#!/usr/bin/env node
/**
 * Terra Infinite asset-processing pipeline.
 *
 * Converts raw Natural Earth (public domain) GeoJSON into compact, attribute-stripped JSON under public/data/ne/.
 * Raw sources are read from $NE_SOURCE_DIR if set, otherwise downloaded once into .cache/ne/ from the official
 * Natural Earth GitHub mirror (https://github.com/nvkelso/natural-earth-vector). Nothing planet-scale is stored.
 *
 * Usage: node scripts/process-assets.mjs [--precision 3]
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = process.env.NE_SOURCE_DIR || path.join(root, '.cache', 'ne');
const outDir = path.join(root, 'public', 'data', 'ne');
const MIRROR = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const precisionArg = process.argv.indexOf('--precision');
const PRECISION = precisionArg > -1 ? Number(process.argv[precisionArg + 1]) : 3;
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

async function load(name) {
  const file = path.join(cacheDir, `${name}.geojson`);
  if (!existsSync(file) || statSync(file).size === 0) {
    const url = `${MIRROR}/${name}.geojson`;
    process.stdout.write(`downloading ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

const r = (v) => Number(v.toFixed(PRECISION));
function roundCoords(c) {
  if (typeof c[0] === 'number') return [r(c[0]), r(c[1])];
  return c.map(roundCoords);
}
function dedupeRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}
function cleanGeometry(g) {
  const coords = roundCoords(g.coordinates);
  if (g.type === 'Polygon') return { type: g.type, coordinates: coords.map(dedupeRing).filter((ring) => ring.length >= 4) };
  if (g.type === 'MultiPolygon') {
    return { type: g.type, coordinates: coords.map((poly) => poly.map(dedupeRing).filter((ring) => ring.length >= 4)).filter((poly) => poly.length > 0) };
  }
  return { type: g.type, coordinates: coords };
}
function prop(p, ...keys) {
  for (const k of keys) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== '' && p[k] !== -99) return p[k];
    const lower = k.toLowerCase();
    if (p[lower] !== undefined && p[lower] !== null && p[lower] !== '' && p[lower] !== -99) return p[lower];
  }
  return undefined;
}
function write(name, data) {
  const file = path.join(outDir, name);
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  process.stdout.write(`${name.padEnd(28)} ${(text.length / 1024).toFixed(0).padStart(6)} KB\n`);
}
function featureCollection(fc, pick) {
  return {
    type: 'FeatureCollection',
    features: fc.features
      .filter((f) => f.geometry)
      .map((f) => ({ type: 'Feature', properties: pick(f.properties), geometry: cleanGeometry(f.geometry) })),
  };
}

const land50 = await load('ne_50m_land');
write('land_50m.json', featureCollection(land50, () => ({})));
const land110 = await load('ne_110m_land');
write('land_110m.json', featureCollection(land110, () => ({})));
const lakes = await load('ne_50m_lakes');
write('lakes_50m.json', featureCollection(lakes, (p) => ({ name: prop(p, 'name', 'NAME') ?? null })));
const rivers = await load('ne_50m_rivers_lake_centerlines');
write('rivers_50m.json', featureCollection(rivers, (p) => ({ name: prop(p, 'name', 'NAME') ?? null, rank: prop(p, 'scalerank', 'SCALERANK') ?? 10 })));
const ice = await load('ne_50m_glaciated_areas');
write('glaciated_50m.json', featureCollection(ice, (p) => ({ name: prop(p, 'name', 'NAME') ?? null })));
const countries = await load('ne_110m_admin_0_countries');
write('countries_110m.json', featureCollection(countries, (p) => ({
  name: prop(p, 'NAME', 'ADMIN'),
  iso2: prop(p, 'ISO_A2_EH', 'ISO_A2', 'WB_A2') ?? null,
  continent: prop(p, 'CONTINENT') ?? null,
  pop: prop(p, 'POP_EST') ?? null,
})));
const regions = await load('ne_110m_geography_regions_polys');
write('regions_110m.json', featureCollection(regions, (p) => ({ name: prop(p, 'NAME', 'name'), kind: prop(p, 'FEATURECLA', 'featurecla'), region: prop(p, 'REGION', 'region') ?? null })));
const marine = await load('ne_110m_geography_marine_polys');
write('marine_110m.json', featureCollection(marine, (p) => ({ name: prop(p, 'name', 'NAME'), kind: prop(p, 'featurecla', 'FEATURECLA') })));

// Populated places → compact rows for the offline search index and urban-density model.
const places = await load('ne_50m_populated_places');
const placeRows = places.features
  .filter((f) => f.geometry && f.geometry.type === 'Point')
  .map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const capital = prop(p, 'ADM0CAP') === 1 || /Admin-0 capital/.test(prop(p, 'FEATURECLA', 'featurecla') ?? '');
    return [prop(p, 'NAME', 'name'), prop(p, 'ADM0NAME', 'adm0name') ?? '', prop(p, 'ISO_A2', 'iso_a2') ?? '', r(lat), r(lon), Math.max(0, Math.round(prop(p, 'POP_MAX', 'pop_max') ?? 0)), capital ? 1 : 0, prop(p, 'SCALERANK', 'scalerank') ?? 10];
  })
  .sort((a, b) => b[5] - a[5]);
write('places_50m.json', { columns: ['name', 'country', 'iso2', 'lat', 'lon', 'pop', 'capital', 'rank'], rows: placeRows });

const points = await load('ne_50m_geography_regions_points');
const pointRows = points.features
  .filter((f) => f.geometry && f.geometry.type === 'Point')
  .map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return [prop(p, 'name', 'NAME'), prop(p, 'featurecla', 'FEATURECLA') ?? 'place', r(lat), r(lon)];
  });
write('physical_points_50m.json', { columns: ['name', 'kind', 'lat', 'lon'], rows: pointRows });

writeFileSync(path.join(outDir, 'README.md'), `# Derived Natural Earth data\n\nGenerated by \`npm run assets:process\` from Natural Earth 1:50m and 1:110m vectors (public domain, https://www.naturalearthdata.com/).\nCoordinates are rounded to ${PRECISION} decimal places (~${(111000 / 10 ** PRECISION).toFixed(0)} m); attributes are reduced to what the app uses.\nDo not edit by hand.\n`);
process.stdout.write('done\n');
