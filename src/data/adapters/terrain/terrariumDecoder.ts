import type { TerrariumDecodeRequest, TerrariumDecodeResponse } from '@/workers/terrarium.worker';

export interface DecodedHeightmap { heights: Float32Array; min: number; max: number }

/** Decodes a Terrarium PNG on the main thread (fallback when workers/OffscreenCanvas are unavailable). */
export async function decodeTerrariumMainThread(png: ArrayBuffer, width = 256, height = 256): Promise<DecodedHeightmap> {
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  const heights = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0, p = 0; i < heights.length; i++, p += 4) {
    const h = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
    heights[i] = h;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { heights, min, max };
}

/** Pool of decode workers with promise-based request/response matching. */
export class TerrariumDecoderPool {
  private workers: Worker[] = [];
  private pending = new Map<number, { resolve: (v: DecodedHeightmap) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private rr = 0;
  private readonly supportsWorkers: boolean;

  constructor(size = Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2) - 1))) {
    this.supportsWorkers = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    if (!this.supportsWorkers) return;
    for (let i = 0; i < size; i++) {
      try {
        const w = new Worker(new URL('../../../workers/terrarium.worker.ts', import.meta.url), { type: 'module', name: `terrarium-${i}` });
        w.onmessage = (ev: MessageEvent<TerrariumDecodeResponse>) => this.onMessage(ev.data);
        w.onerror = (ev) => console.warn('[terrarium worker]', ev.message);
        this.workers.push(w);
      } catch (e) {
        console.warn('[terrarium] worker creation failed, falling back to main thread', e);
        break;
      }
    }
  }

  get size(): number {
    return this.workers.length;
  }

  private onMessage(msg: TerrariumDecodeResponse) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error || !msg.heights) p.reject(new Error(msg.error ?? 'decode failed'));
    else p.resolve({ heights: msg.heights, min: msg.min ?? 0, max: msg.max ?? 0 });
  }

  decode(png: ArrayBuffer, width = 256, height = 256): Promise<DecodedHeightmap> {
    if (this.workers.length === 0) return decodeTerrariumMainThread(png, width, height);
    const id = this.nextId++;
    const worker = this.workers[this.rr++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const req: TerrariumDecodeRequest = { id, png, width, height };
      worker.postMessage(req, [png]);
    });
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('decoder destroyed'));
    this.pending.clear();
  }
}

let shared: TerrariumDecoderPool | null = null;
export function sharedTerrariumDecoder(): TerrariumDecoderPool {
  if (!shared) shared = new TerrariumDecoderPool();
  return shared;
}
