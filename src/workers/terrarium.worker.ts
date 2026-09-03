/// <reference lib="webworker" />
/**
 * Decodes Terrarium-encoded PNG elevation tiles (height = R*256 + G + B/256 - 32768) into Float32 height grids.
 * Runs off the main thread; one message in, one transferable Float32Array out.
 */
export interface TerrariumDecodeRequest { id: number; png: ArrayBuffer; width: number; height: number }
export interface TerrariumDecodeResponse { id: number; heights?: Float32Array; min?: number; max?: number; error?: string }

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (ev: MessageEvent<TerrariumDecodeRequest>) => {
  const { id, png, width, height } = ev.data;
  try {
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
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
    const msg: TerrariumDecodeResponse = { id, heights, min, max };
    (self as unknown as Worker).postMessage(msg, [heights.buffer]);
  } catch (e) {
    const msg: TerrariumDecodeResponse = { id, error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(msg);
  }
};
