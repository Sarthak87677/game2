/**
 * Frame-time statistics over a rolling window. Pure functions over a ring buffer so they can be unit-tested and
 * reused by the streaming monitor, the benchmark and the perf script.
 */

export interface FrameStats {
  /** Frames rendered in the last ~1 s (falls back to 1000/last frame time when fewer than two frames landed). */
  currentFps: number;
  /** Frames in the window divided by the window span. */
  avgFps: number;
  /** "1 % low": 1000 / 99th-percentile frame time. */
  onePercentLowFps: number;
  /** Mean frame time (ms) over the window. */
  frameMs: number;
  /** 99th-percentile frame time (ms) over the window. */
  p99Ms: number;
  /** Frames considered. */
  frames: number;
}

export const EMPTY_FRAME_STATS: FrameStats = { currentFps: 0, avgFps: 0, onePercentLowFps: 0, frameMs: 0, p99Ms: 0, frames: 0 };

/**
 * Percentile (0..1) of a sorted ascending array: the value at index floor(p·n), clamped. For p = 0.99 this is the
 * slowest of the worst 1 % of frames (with fewer than 100 frames it is simply the slowest frame).
 */
export function percentileSorted(sorted: ArrayLike<number>, count: number, p: number): number {
  if (count <= 0) return 0;
  const rank = Math.min(count - 1, Math.max(0, Math.floor(p * count)));
  return sorted[rank];
}

/**
 * Fixed-capacity ring buffer of frame times (ms) with their end timestamps. No allocation after construction;
 * `stats()` sorts into a scratch buffer.
 */
export class FrameWindow {
  private readonly times: Float64Array;
  private readonly ends: Float64Array;
  private readonly scratch: Float64Array;
  private head = 0;
  private size = 0;

  constructor(private readonly capacity = 2048, private readonly windowMs = 10_000) {
    this.times = new Float64Array(capacity);
    this.ends = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  push(frameMs: number, endMs: number): void {
    if (!(frameMs > 0) || !Number.isFinite(frameMs)) return;
    this.times[this.head] = frameMs;
    this.ends[this.head] = endMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  clear(): void { this.head = 0; this.size = 0; }

  get length(): number { return this.size; }

  /** Statistics over the frames whose end time lies within `windowMs` of `nowMs`. */
  stats(nowMs: number): FrameStats {
    const cutoff = nowMs - this.windowMs;
    const oneSecond = nowMs - 1000;
    let n = 0, sum = 0, recent = 0, recentSum = 0, first = Infinity, last = -Infinity, lastFrame = 0, oldestFrame = 0;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity; // newest first
      const end = this.ends[idx];
      if (end < cutoff) break;
      const t = this.times[idx];
      this.scratch[n++] = t;
      sum += t;
      if (i === 0) lastFrame = t;
      oldestFrame = t;
      if (end >= oneSecond) { recent++; recentSum += t; }
      if (end < first) first = end;
      if (end > last) last = end;
    }
    if (n === 0) return EMPTY_FRAME_STATS;
    const sorted = this.scratch.subarray(0, n).sort();
    const span = Math.max(sum, last - first + oldestFrame);
    const p99Ms = percentileSorted(sorted, n, 0.99);
    const currentFps = recent >= 2 ? (recent * 1000) / recentSum : 1000 / lastFrame;
    return {
      currentFps,
      avgFps: (n * 1000) / span,
      onePercentLowFps: p99Ms > 0 ? 1000 / p99Ms : 0,
      frameMs: sum / n,
      p99Ms,
      frames: n,
    };
  }
}

/** Statistics over a plain list of frame times (used by the benchmark and the perf script). */
export function frameStatsOf(frameTimesMs: readonly number[]): FrameStats {
  const n = frameTimesMs.length;
  if (n === 0) return EMPTY_FRAME_STATS;
  const sorted = Float64Array.from(frameTimesMs).sort();
  let sum = 0;
  for (const t of frameTimesMs) sum += t;
  const p99Ms = percentileSorted(sorted, n, 0.99);
  const recent = frameTimesMs.slice(-Math.max(2, Math.min(n, 60)));
  const recentSum = recent.reduce((a, b) => a + b, 0);
  return { currentFps: (recent.length * 1000) / recentSum, avgFps: (n * 1000) / sum, onePercentLowFps: p99Ms > 0 ? 1000 / p99Ms : 0, frameMs: sum / n, p99Ms, frames: n };
}
