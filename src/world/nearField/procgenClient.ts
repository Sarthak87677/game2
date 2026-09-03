import type { GenerationContext, NearFieldTile } from '@/world/procedural/types';

interface Pending { resolve: (t: NearFieldTile | null) => void; reject: (e: Error) => void }

/**
 * Client for the procedural generation worker pool. Height fields are transferred (not copied); requests are
 * round-robined across workers; failures resolve to null so the renderer can retry later.
 */
export class ProcgenClient {
  private workers: Worker[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private rr = 0;
  lastError: string | null = null;
  generated = 0;
  failed = 0;

  constructor(size = Math.max(1, Math.min(2, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2) - 2))) {
    if (typeof Worker === 'undefined') return;
    for (let i = 0; i < size; i++) {
      try {
        const w = new Worker(new URL('../../workers/procgen.worker.ts', import.meta.url), { type: 'module', name: `procgen-${i}` });
        w.onmessage = (ev: MessageEvent<{ id: number; tile?: NearFieldTile; error?: string }>) => {
          const p = this.pending.get(ev.data.id);
          if (!p) return;
          this.pending.delete(ev.data.id);
          if (ev.data.error || !ev.data.tile) { this.failed++; this.lastError = ev.data.error ?? 'no tile'; p.resolve(null); }
          else { this.generated++; p.resolve(ev.data.tile); }
        };
        w.onerror = (ev) => { this.lastError = ev.message; };
        this.workers.push(w);
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        break;
      }
    }
  }

  get available(): boolean { return this.workers.length > 0; }

  generate(ctx: GenerationContext): Promise<NearFieldTile | null> {
    if (this.workers.length === 0) return Promise.resolve(null);
    const id = this.nextId++;
    const w = this.workers[this.rr++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const transfer: Transferable[] = [];
      if (ctx.heightField) transfer.push(ctx.heightField.heights.buffer);
      w.postMessage({ id, ctx }, transfer);
    });
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.resolve(null);
    this.pending.clear();
  }
}
