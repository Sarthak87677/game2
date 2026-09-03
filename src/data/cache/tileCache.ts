/**
 * IndexedDB-backed binary/JSON cache with a byte budget and LRU eviction. Used for terrain tiles, OSM feature
 * responses and other streamed data so revisits are fast and offline-tolerant. Safe to use when IndexedDB is missing
 * (falls back to an in-memory map).
 */
export interface TileCacheOptions { name?: string; maxBytes?: number }
interface Row { key: string; value: ArrayBuffer | string; bytes: number; ts: number }

const DB_VERSION = 1;
const STORE = 'tiles';

export class TileCache {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, Row>();
  private opening: Promise<void> | null = null;
  private usedBytes = 0;
  readonly name: string;
  maxBytes: number;
  hits = 0;
  misses = 0;

  constructor(opts: TileCacheOptions = {}) {
    this.name = opts.name ?? 'terra-infinite-cache';
    this.maxBytes = opts.maxBytes ?? 256 * 1024 * 1024;
  }

  private open(): Promise<void> {
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(); return; }
      let req: IDBOpenDBRequest;
      try { req = indexedDB.open(this.name, DB_VERSION); } catch { resolve(); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'key' });
          s.createIndex('ts', 'ts');
        }
      };
      req.onsuccess = () => { this.db = req.result; this.recount().finally(resolve); };
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    return this.opening;
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db) return null;
    try { return this.db.transaction(STORE, mode).objectStore(STORE); } catch { return null; }
  }

  private async recount(): Promise<void> {
    const store = this.tx('readonly');
    if (!store) return;
    await new Promise<void>((resolve) => {
      let total = 0;
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { total += (c.value as Row).bytes; c.continue(); } else { this.usedBytes = total; resolve(); }
      };
      cur.onerror = () => resolve();
    });
  }

  get bytesUsed(): number { return this.usedBytes; }

  async get(key: string): Promise<ArrayBuffer | string | null> {
    await this.open();
    if (!this.db) {
      const m = this.memory.get(key);
      if (m) { m.ts = Date.now(); this.hits++; return m.value; }
      this.misses++;
      return null;
    }
    return new Promise((resolve) => {
      const store = this.tx('readwrite');
      if (!store) { resolve(null); return; }
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result as Row | undefined;
        if (!row) { this.misses++; resolve(null); return; }
        this.hits++;
        row.ts = Date.now();
        try { store.put(row); } catch { /* ignore */ }
        resolve(row.value);
      };
      req.onerror = () => { this.misses++; resolve(null); };
    });
  }

  async put(key: string, value: ArrayBuffer | string): Promise<void> {
    await this.open();
    const bytes = typeof value === 'string' ? value.length * 2 : value.byteLength;
    if (bytes > this.maxBytes * 0.25) return;
    if (!this.db) {
      this.memory.set(key, { key, value, bytes, ts: Date.now() });
      this.usedBytes += bytes;
      this.evictMemory();
      return;
    }
    await new Promise<void>((resolve) => {
      const store = this.tx('readwrite');
      if (!store) { resolve(); return; }
      const req = store.put({ key, value, bytes, ts: Date.now() } satisfies Row);
      req.onsuccess = () => { this.usedBytes += bytes; resolve(); };
      req.onerror = () => resolve();
    });
    if (this.usedBytes > this.maxBytes) await this.evict();
  }

  private evictMemory(): void {
    if (this.usedBytes <= this.maxBytes) return;
    const rows = [...this.memory.values()].sort((a, b) => a.ts - b.ts);
    for (const r of rows) {
      if (this.usedBytes <= this.maxBytes * 0.8) break;
      this.memory.delete(r.key);
      this.usedBytes -= r.bytes;
    }
  }

  /** Evicts least-recently-used rows until usage is under 80 % of the budget. */
  async evict(): Promise<void> {
    if (!this.db) { this.evictMemory(); return; }
    await new Promise<void>((resolve) => {
      const store = this.tx('readwrite');
      if (!store) { resolve(); return; }
      const cur = store.index('ts').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c && this.usedBytes > this.maxBytes * 0.8) {
          this.usedBytes -= (c.value as Row).bytes;
          c.delete();
          c.continue();
        } else resolve();
      };
      cur.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    await this.open();
    this.memory.clear();
    this.usedBytes = 0;
    if (!this.db) return;
    await new Promise<void>((resolve) => {
      const store = this.tx('readwrite');
      if (!store) { resolve(); return; }
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  async setBudget(maxBytes: number): Promise<void> {
    this.maxBytes = maxBytes;
    if (this.usedBytes > maxBytes) await this.evict();
  }
}

let shared: TileCache | null = null;
export function sharedTileCache(): TileCache {
  if (!shared) shared = new TileCache();
  return shared;
}
