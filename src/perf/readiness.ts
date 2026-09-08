/**
 * Boot readiness gate. Pure state machine: the engine feeds it layer statuses and frame-rate samples, it answers
 * which boot phase to show. "ready" requires terrain active with tiles loaded at least once, every required data
 * layer loaded (or explicitly degraded with a listed reason), an imagery layer, and FPS ≥ minFps sustained for 3 s.
 * A failed required layer is a hard error — the pill must never say "ready" then.
 */

export type LayerStatus =
  | { state: 'pending' }
  | { state: 'loaded' }
  | { state: 'degraded'; reason: string }
  | { state: 'failed'; reason: string };

export type LayerId = 'naturalEarth' | 'gazetteer' | 'climate';

export interface ReadinessInput {
  terrainActive: boolean;
  /** Reason the terrain is degraded (e.g. flat ellipsoid because the host is unreachable), or null when measured. */
  terrainDegraded: string | null;
  tilesLoadedOnce: boolean;
  imageryPresent: boolean;
  layers: Record<LayerId, LayerStatus>;
  fps: number;
  nowMs: number;
}

export type ReadinessPhase = 'data' | 'ready' | 'error';

export interface ReadinessDecision {
  phase: ReadinessPhase;
  /** Short message for the top-right pill while not ready. */
  message: string;
  /** Hard failure reason when phase = 'error'. */
  error: string | null;
  /** Items still blocking readiness (empty when ready). */
  blocking: string[];
  /** Layers that loaded in a degraded form, with reasons (listed in Diagnostics even when ready). */
  degraded: string[];
  /** How long the FPS gate has been satisfied continuously (ms). */
  fpsSustainedMs: number;
  fpsGatePassed: boolean;
  minFps: number;
}

export interface ReadinessGateOptions {
  /** Frame rate that must be sustained (per preset; can be overridden for software renderers / tests). */
  minFps: number;
  /** Sustain requirement (default 3000 ms). */
  sustainMs?: number;
  /** Human-readable reason when minFps was relaxed, shown in the readout. */
  minFpsNote?: string | null;
}

export const REQUIRED_LAYERS: LayerId[] = ['naturalEarth', 'gazetteer', 'climate'];
const LAYER_LABEL: Record<LayerId, string> = { naturalEarth: 'Natural Earth vectors', gazetteer: 'Place index', climate: 'Climate atlas' };

export class ReadinessGate {
  private fpsOkSince: number | null = null;
  private lastDecision: ReadinessDecision | null = null;
  private latched = false;
  readonly minFps: number;
  readonly sustainMs: number;
  readonly minFpsNote: string | null;

  constructor(opts: ReadinessGateOptions) {
    this.minFps = Math.max(0, opts.minFps);
    this.sustainMs = opts.sustainMs ?? 3000;
    this.minFpsNote = opts.minFpsNote ?? null;
  }

  /** Last decision (null before the first update). */
  get decision(): ReadinessDecision | null { return this.lastDecision; }

  update(input: ReadinessInput): ReadinessDecision {
    const blocking: string[] = [];
    const degraded: string[] = [];
    let error: string | null = null;

    for (const id of REQUIRED_LAYERS) {
      const st = input.layers[id];
      if (st.state === 'failed') error = error ?? `${LAYER_LABEL[id]} failed: ${st.reason}`;
      else if (st.state === 'pending') blocking.push(`${LAYER_LABEL[id]} loading`);
      else if (st.state === 'degraded') degraded.push(`${LAYER_LABEL[id]}: ${st.reason}`);
    }
    if (input.terrainDegraded) degraded.push(`Terrain: ${input.terrainDegraded}`);
    if (this.minFpsNote) degraded.push(this.minFpsNote);
    if (!input.terrainActive) blocking.push('Terrain provider not active');
    if (!input.tilesLoadedOnce) blocking.push('Streaming globe tiles');
    if (!input.imageryPresent) blocking.push('Imagery layer missing');

    // FPS gate: sustained for `sustainMs`; the timer resets whenever a sample falls below the threshold.
    const fpsOk = this.minFps <= 0 || input.fps >= this.minFps;
    if (fpsOk) { if (this.fpsOkSince === null) this.fpsOkSince = input.nowMs; } else this.fpsOkSince = null;
    const fpsSustainedMs = this.fpsOkSince === null ? 0 : input.nowMs - this.fpsOkSince;
    const fpsGatePassed = this.latched || this.minFps <= 0 || (fpsOk && fpsSustainedMs >= this.sustainMs);
    if (!fpsGatePassed) blocking.push(`Warming up (${input.fps.toFixed(input.fps < 10 ? 1 : 0)} fps, need ${this.minFps} for ${(this.sustainMs / 1000).toFixed(0)} s)`);

    let phase: ReadinessPhase;
    let message: string;
    if (error) { phase = 'error'; message = error; }
    else if (blocking.length === 0) { phase = 'ready'; message = 'Ready'; this.latched = true; }
    else {
      phase = 'data';
      const streaming = blocking.filter((b) => /loading|Streaming|provider|Imagery/.test(b));
      const warm = `Warming up (${input.fps.toFixed(input.fps < 10 ? 1 : 0)} fps)`;
      message = streaming.length && !fpsGatePassed ? `Streaming… / ${warm}` : streaming.length ? `Streaming… ${streaming[0]}` : warm;
    }
    this.lastDecision = { phase, message, error, blocking, degraded, fpsSustainedMs, fpsGatePassed, minFps: this.minFps };
    return this.lastDecision;
  }
}

/** Parses `?terraMinFps=` (0 disables the gate); returns null when absent or invalid. */
export function parseMinFpsOverride(search: string): number | null {
  try {
    const v = new URLSearchParams(search).get('terraMinFps');
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

/**
 * Effective minFps for the gate: an explicit URL override wins; otherwise a software rasteriser (no GPU) relaxes the
 * gate to 1 fps with a visible note, because 30/60 fps is physically unreachable there and the gate would otherwise
 * never open. Real GPUs use the preset's minFps unchanged.
 */
export function effectiveMinFps(presetMinFps: number, softwareRenderer: boolean, override: number | null): { minFps: number; note: string | null } {
  if (override !== null) return { minFps: override, note: `FPS gate overridden to ${override} fps (?terraMinFps)` };
  if (softwareRenderer) return { minFps: Math.min(1, presetMinFps), note: `FPS gate relaxed to 1 fps: software renderer, not a GPU` };
  return { minFps: presetMinFps, note: null };
}
