/**
 * Offline search index over the Maharashtra gazetteer (cities, destinations, spawn points). Pure TypeScript: no
 * Cesium, no network, no async — it answers synchronously so "Kolhapur", "CSMT", "Ganpatipule" or "SGIS" resolve
 * even before the Natural Earth gazetteer has loaded. `TerraEngine.search` merges its results with the gazetteer.
 *
 * Scoring mirrors the offline gazetteer so the two lists interleave sensibly:
 * exact > exact alias > prefix > word-prefix > alias-prefix > substring > fuzzy, plus a small prior for important places.
 */
import type { GeocodeResult } from '../geocoding/types';
import { boundedEditDistance, normalizeSearchText, tokenizeSearchText } from '../geocoding/textMatch';
import { ALL_MAHARASHTRA_PLACES } from './destinations';
import { URBAN_REGION_IDS } from './cities';
import { MAHARASHTRA_SPAWNS } from './spawns';
import type { Destination, DestinationKind } from './types';

/** Bookmark id used for a Maharashtra place in `WORLD_HIGHLIGHTS` and in search results. */
export function maharashtraBookmarkId(destinationId: string): string {
  return `mh-${destinationId}`;
}

const PLACE_KINDS = new Set<DestinationKind>(['city', 'town', 'hill-station', 'coast', 'park', 'nature', 'village']);

interface IndexEntry {
  readonly dest: Destination;
  readonly result: Omit<GeocodeResult, 'score'>;
  readonly norm: string;
  readonly words: readonly string[];
  readonly aliases: readonly string[];
  readonly aliasWords: readonly string[];
  readonly context: readonly string[];
  readonly prior: number;
}

const URBAN = new Set<string>(URBAN_REGION_IDS);

function priorFor(d: Destination): number {
  if (URBAN.has(d.id)) return 60;
  if (d.external) return 50;
  switch (d.kind) {
    case 'city': return 45;
    case 'monument': case 'fort': case 'temple': return 35;
    case 'hill-station': case 'coast': case 'station': case 'airport': return 30;
    default: return 20;
  }
}

function makeEntry(d: Destination, extraAliases: readonly string[]): IndexEntry {
  const norm = normalizeSearchText(d.name);
  // District, kind and state are context (matched by multi-word queries), not aliases: "Pune" must not rank every
  // Pune-district entry as if it were named Pune.
  const contextOnly = new Set([normalizeSearchText(d.district), d.kind, 'maharashtra']);
  const aliasSet = new Set<string>();
  for (const t of [...(d.tags ?? []), ...extraAliases]) { const n = normalizeSearchText(t); if (n && n !== norm && !contextOnly.has(n)) aliasSet.add(n); }
  // Bracketed alternative names ("Ahilyanagar (Ahmednagar)") become aliases too.
  const paren = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(d.name)) !== null) { const n = normalizeSearchText(m[1]); if (n) aliasSet.add(n); }
  const aliases = [...aliasSet];
  const place = d.external ? d.district : `${d.district}, Maharashtra`;
  return {
    dest: d,
    result: {
      id: maharashtraBookmarkId(d.id),
      name: d.name,
      displayName: `${d.name} · ${place}`,
      kind: PLACE_KINDS.has(d.kind) ? 'bookmark' : 'landmark',
      lat: d.lat,
      lon: d.lon,
      heightM: d.overviewHeightM,
      source: 'terra-bookmarks',
      bookmarkId: maharashtraBookmarkId(d.id),
    },
    norm,
    words: tokenizeSearchText(norm),
    aliases,
    aliasWords: [...new Set(aliases.flatMap((a) => tokenizeSearchText(a)))],
    context: [normalizeSearchText(d.district), d.kind, 'maharashtra', 'india'].filter((c) => c.length > 0),
    prior: priorFor(d),
  };
}

function matchTier(e: IndexEntry, q: string): number {
  if (e.norm === q) return 1000;
  // An exact alias hit is an alternative name ("Aurangabad", "CSMT", "VT"): it outranks a prefix of another name.
  if (e.aliases.includes(q)) return 900;
  if (e.norm.startsWith(q)) return 850;
  for (let i = 1; i < e.words.length; i++) if (e.words[i].startsWith(q)) return 750 - Math.min(i, 3) * 10;
  if (e.aliases.some((a) => a.startsWith(q)) || e.aliasWords.some((w) => w.startsWith(q))) return 680;
  if (e.norm.includes(q)) return 550;
  if (q.length >= 5) {
    for (const w of [e.norm, ...e.words, ...e.aliases]) {
      if (Math.abs(w.length - q.length) > 2) continue;
      const d = boundedEditDistance(w, q, 2);
      if (d <= 2) return 450 - 100 * (d - 1);
    }
  }
  return 0;
}

function multiTokenTier(e: IndexEntry, qWords: readonly string[]): number {
  let nameHits = 0, contextHits = 0;
  for (const t of qWords) {
    if (e.words.some((w) => w.startsWith(t)) || e.aliasWords.some((w) => w.startsWith(t))) nameHits += 1;
    else if (e.context.some((c) => c.startsWith(t))) contextHits += 1;
    else if (t.length >= 5 && e.words.some((w) => w.length >= 4 && boundedEditDistance(t, w, 1) <= 1)) nameHits += 0.7;
  }
  if (nameHits === 0) return 0;
  return (600 * (nameHits + 0.6 * contextHits)) / qWords.length;
}

export class MaharashtraIndex {
  private readonly entries: IndexEntry[];

  constructor(places: readonly Destination[] = ALL_MAHARASHTRA_PLACES) {
    const spawnAliases = new Map<string, string[]>();
    for (const s of MAHARASHTRA_SPAWNS) spawnAliases.set(s.id, [s.name, ...s.name.split(/[,(]/)]);
    this.entries = places.map((d) => makeEntry(d, spawnAliases.get(d.id) ?? []));
  }

  get size(): number { return this.entries.length; }

  /** Synchronous search; results carry ids `mh-<destination id>` and comparable scores to the offline gazetteer. */
  search(query: string, limit = 10): GeocodeResult[] {
    const q = normalizeSearchText(query ?? '');
    if (q.length === 0) return [];
    const qWords = tokenizeSearchText(q);
    const max = Math.max(1, Math.min(100, Math.floor(limit) || 10));
    const scored: { e: IndexEntry; score: number }[] = [];
    for (const e of this.entries) {
      let tier = matchTier(e, q);
      let penalty = 0;
      if (tier > 0) penalty = Math.min(20, Math.max(0, e.norm.length - q.length) * 0.5);
      else if (qWords.length >= 2) tier = multiTokenTier(e, qWords);
      if (tier <= 0) continue;
      scored.push({ e, score: tier + e.prior - penalty });
    }
    scored.sort((a, b) => b.score - a.score || a.e.result.name.localeCompare(b.e.result.name, 'en') || (a.e.result.id < b.e.result.id ? -1 : 1));
    return scored.slice(0, max).map(({ e, score }) => ({ ...e.result, score: Math.round(score * 10) / 10 }));
  }

  /** Looks a destination up by its gazetteer id (without the `mh-` prefix) or by bookmark id. */
  byId(id: string): Destination | undefined {
    const bare = id.startsWith('mh-') ? id.slice(3) : id;
    return this.entries.find((e) => e.dest.id === bare)?.dest;
  }

  /** Nearest places to a point (great-circle, closest first). Cheap enough for HUD use a few times a second. */
  nearest(lat: number, lon: number, limit = 3): { dest: Destination; distanceKm: number }[] {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const out: { dest: Destination; distanceKm: number }[] = [];
    for (const e of this.entries) {
      const dLat = (e.dest.lat - lat) * 111.32;
      const dLon = (e.dest.lon - lon) * 111.32 * cosLat;
      out.push({ dest: e.dest, distanceKm: Math.hypot(dLat, dLon) });
    }
    out.sort((a, b) => a.distanceKm - b.distanceKm);
    return out.slice(0, Math.max(1, limit));
  }
}

/** Shared instance (the index is small and immutable). */
export const MAHARASHTRA_INDEX = new MaharashtraIndex();

/**
 * Merges two already-scored result lists by descending score, dropping duplicates by id/bookmark id or by position
 * (within ~150 m). Stable: for equal scores the first list wins.
 */
export function mergeSearchResults(primary: readonly GeocodeResult[], extra: readonly GeocodeResult[], limit: number): GeocodeResult[] {
  const out: GeocodeResult[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  const key = (r: GeocodeResult) => `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
  const push = (r: GeocodeResult): void => {
    if (ids.has(r.id) || (r.bookmarkId && ids.has(r.bookmarkId)) || cells.has(key(r))) return;
    ids.add(r.id);
    if (r.bookmarkId) ids.add(r.bookmarkId);
    cells.add(key(r));
    out.push(r);
  };
  let i = 0, j = 0;
  while (i < primary.length || j < extra.length) {
    if (j >= extra.length || (i < primary.length && primary[i].score >= extra[j].score)) push(primary[i++]);
    else push(extra[j++]);
  }
  return out.slice(0, limit);
}
