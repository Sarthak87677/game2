/**
 * Synthetic Overpass responder for offline development and CI. Enabled with TERRA_FIXTURES=1 (see vite.config.ts):
 * POST /__fixtures/overpass returns a deterministic, plausible OSM-like feature set for the requested bbox
 * (street grid, mixed-height buildings, a park, a river, a place node). It is clearly NOT real OpenStreetMap data and
 * exists so the OSM rendering path, collisions and night lighting can be exercised where the network is blocked.
 */
function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function syntheticOverpass(bbox) {
  const { south, west, north, east } = bbox;
  const elements = [];
  const latM = 111_132;
  const lonM = 111_320 * Math.cos(((south + north) / 2) * Math.PI / 180);
  const blockM = 150;
  const streetM = 14;
  const cellLat = (blockM + streetM) / latM;
  const cellLon = (blockM + streetM) / lonM;
  const i0 = Math.floor(west / cellLon), i1 = Math.ceil(east / cellLon);
  const j0 = Math.floor(south / cellLat), j1 = Math.ceil(north / cellLat);
  let id = 1;
  // Roads on the grid lines
  for (let i = i0; i <= i1; i++) {
    const lon = i * cellLon;
    const kind = i % 6 === 0 ? 'primary' : i % 2 === 0 ? 'secondary' : 'residential';
    elements.push({ type: 'way', id: id++, tags: { highway: kind, name: `Avenue ${i}` }, geometry: [{ lat: south - cellLat, lon }, { lat: north + cellLat, lon }] });
  }
  for (let j = j0; j <= j1; j++) {
    const lat = j * cellLat;
    elements.push({ type: 'way', id: id++, tags: { highway: j % 5 === 0 ? 'primary' : 'residential', name: `Street ${j}` }, geometry: [{ lat, lon: west - cellLon }, { lat, lon: east + cellLon }] });
  }
  // Blocks: buildings, a park every 7th block, a lake occasionally
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
    const r = hash(i, j, 1);
    const bw = west + 0, bs = south + 0; void bw; void bs;
    const lon0 = i * cellLon + streetM / 2 / lonM, lat0 = j * cellLat + streetM / 2 / latM;
    const lon1 = lon0 + blockM / lonM, lat1 = lat0 + blockM / latM;
    if (r < 0.08) {
      elements.push({ type: 'way', id: id++, tags: { leisure: 'park', name: `Park ${i}-${j}` }, geometry: [{ lat: lat0, lon: lon0 }, { lat: lat0, lon: lon1 }, { lat: lat1, lon: lon1 }, { lat: lat1, lon: lon0 }, { lat: lat0, lon: lon0 }] });
      continue;
    }
    if (r < 0.1) {
      elements.push({ type: 'way', id: id++, tags: { natural: 'water', water: 'lake' }, geometry: [{ lat: lat0, lon: lon0 }, { lat: lat0, lon: lon1 }, { lat: lat1, lon: lon1 }, { lat: lat1, lon: lon0 }, { lat: lat0, lon: lon0 }] });
      continue;
    }
    // Subdivide the block into 2×2 or 3×3 lots
    const n = r < 0.5 ? 2 : 1;
    const density = 0.4 + 0.5 * hash(i >> 2, j >> 2, 3); // neighbourhoods vary
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const q = hash(i * 10 + a, j * 10 + b, 2);
      if (q > density) continue;
      const lw = (lon1 - lon0) / n, lh = (lat1 - lat0) / n;
      const pad = 0.12;
      const x0 = lon0 + (a + pad) * lw, x1 = lon0 + (a + 1 - pad) * lw, y0 = lat0 + (b + pad) * lh, y1 = lat0 + (b + 1 - pad) * lh;
      const tall = q > 0.93 && density > 0.8;
      const levels = tall ? 20 + Math.round(q * 40) : 2 + Math.round(q * 6 * density);
      const type = tall ? 'office' : levels > 4 ? 'apartments' : q < 0.3 ? 'house' : 'residential';
      elements.push({ type: 'way', id: id++, tags: { building: type, 'building:levels': String(levels), ...(tall ? { name: `Tower ${i}${j}` } : {}) }, geometry: [{ lat: y0, lon: x0 }, { lat: y0, lon: x1 }, { lat: y1, lon: x1 }, { lat: y1, lon: x0 }, { lat: y0, lon: x0 }] });
    }
  }
  // A river meandering west→east through the middle
  const midLat = (south + north) / 2;
  const river = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    river.push({ lat: midLat + Math.sin(t * Math.PI * 2) * (north - south) * 0.12, lon: west + t * (east - west) });
  }
  elements.push({ type: 'way', id: id++, tags: { waterway: 'river', name: 'Fixture River', width: '60' }, geometry: river });
  elements.push({ type: 'node', id: id++, lat: midLat, lon: (west + east) / 2, tags: { place: 'town', name: 'Fixture Town', population: '50000' } });
  return { version: 0.6, generator: 'terra-synthetic-fixture', elements };
}

export function parseBboxFromQuery(query) {
  const m = query.match(/\[bbox:([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\]/);
  if (!m) return null;
  return { south: Number(m[1]), west: Number(m[2]), north: Number(m[3]), east: Number(m[4]) };
}

/** Connect-style middleware serving the synthetic responder at /__fixtures/overpass (POST form body "data=..."). */
export function fixtureMiddleware(req, res, next) {
  if (!req.url || !req.url.startsWith('/__fixtures/overpass')) return next();
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const data = decodeURIComponent((body.match(/data=([^&]*)/) ?? [])[1] ?? '');
    const bbox = parseBboxFromQuery(data);
    if (!bbox) { res.statusCode = 400; res.end('missing bbox'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Terra-Fixture', 'synthetic-osm');
    res.end(JSON.stringify(syntheticOverpass(bbox)));
  });
}
