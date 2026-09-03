/// <reference lib="webworker" />
/**
 * Near-field procedural generation worker: one GenerationContext in (heightField.heights as a Float32Array), one
 * NearFieldTile out. Thin wrapper over generateTile so the generator stays testable in Node.
 */
import { generateTile } from '@/world/procedural/generator';
import type { GenerationContext, NearFieldTile } from '@/world/procedural/types';

export interface ProcgenRequest { id: number; ctx: GenerationContext }
export interface ProcgenResponse { id: number; tile?: NearFieldTile; error?: string }

self.onmessage = (ev: MessageEvent<ProcgenRequest>) => {
  const { id, ctx } = ev.data;
  let msg: ProcgenResponse;
  try {
    msg = { id, tile: generateTile(ctx) };
  } catch (e) {
    msg = { id, error: e instanceof Error ? e.message : String(e) };
  }
  (self as unknown as Worker).postMessage(msg);
};
