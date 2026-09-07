import { degradationLadder, resolveQuality, type QualitySettings } from '@/engine/quality';
import type { StreamingMonitor } from '@/engine/streaming';

/** Store readout of the adaptive ladder (`useTerraStore().adaptive`). */
export interface AdaptiveReadout {
  enabled: boolean;
  /** Ladder rungs currently applied (0 = untouched preset). */
  step: number;
  maxStep: number;
  /** Label of the last rung applied, or null at step 0. */
  stepLabel: string | null;
  /** Effective renderer resolution scale after the ladder. */
  resolutionScale: number;
  /** Why the ladder last moved (or why it is idle). */
  reason: string;
  fps: number;
  minFps: number;
  targetFps: number;
}

export interface AdaptiveControllerOptions {
  minFps: number;
  targetFps: number;
  maxStep?: number;
  /** FPS must stay below minFps this long before a rung is added (default 2000 ms). */
  degradeAfterMs?: number;
  /** FPS must stay above targetFps + recoverMarginFps this long before a rung is removed (default 6000 ms). */
  recoverAfterMs?: number;
  recoverMarginFps?: number;
}

export interface AdaptiveDecision { step: number; changed: boolean; reason: string }

/**
 * Pure ladder controller (unit-tested without Cesium): steps down one rung after `degradeAfterMs` of FPS < minFps
 * and back up one rung after `recoverAfterMs` of FPS > targetFps + margin. Timers restart after every move so a
 * single bad second cannot drop several rungs at once.
 */
export class AdaptiveController {
  step = 0;
  private lowSince: number | null = null;
  private highSince: number | null = null;
  private lastReason = 'idle';
  readonly minFps: number;
  readonly targetFps: number;
  readonly maxStep: number;
  readonly degradeAfterMs: number;
  readonly recoverAfterMs: number;
  readonly recoverMarginFps: number;

  constructor(opts: AdaptiveControllerOptions) {
    this.minFps = opts.minFps;
    this.targetFps = opts.targetFps;
    this.maxStep = opts.maxStep ?? degradationLadder.length;
    this.degradeAfterMs = opts.degradeAfterMs ?? 2000;
    this.recoverAfterMs = opts.recoverAfterMs ?? 6000;
    this.recoverMarginFps = opts.recoverMarginFps ?? 8;
  }

  get reason(): string { return this.lastReason; }

  reset(): void { this.step = 0; this.lowSince = null; this.highSince = null; this.lastReason = 'reset'; }

  update(fps: number, nowMs: number): AdaptiveDecision {
    const low = this.minFps > 0 && fps < this.minFps;
    const high = fps > this.targetFps + this.recoverMarginFps;
    if (low) { if (this.lowSince === null) this.lowSince = nowMs; } else this.lowSince = null;
    if (high) { if (this.highSince === null) this.highSince = nowMs; } else this.highSince = null;
    if (low && this.lowSince !== null && nowMs - this.lowSince >= this.degradeAfterMs) {
      this.lowSince = nowMs;
      if (this.step < this.maxStep) {
        this.step++;
        this.lastReason = `${fps.toFixed(0)} fps < ${this.minFps} for ${(this.degradeAfterMs / 1000).toFixed(0)} s → ${degradationLadder[this.step - 1]?.label ?? `step ${this.step}`}`;
        return { step: this.step, changed: true, reason: this.lastReason };
      }
      this.lastReason = `${fps.toFixed(0)} fps < ${this.minFps}: ladder exhausted (nearby buildings and player are never degraded)`;
      return { step: this.step, changed: false, reason: this.lastReason };
    }
    if (high && this.highSince !== null && nowMs - this.highSince >= this.recoverAfterMs) {
      this.highSince = nowMs;
      if (this.step > 0) {
        const undone = degradationLadder[this.step - 1]?.label ?? `step ${this.step}`;
        this.step--;
        this.lastReason = `${fps.toFixed(0)} fps > ${this.targetFps + this.recoverMarginFps} for ${(this.recoverAfterMs / 1000).toFixed(0)} s → restored ${undone}`;
        return { step: this.step, changed: true, reason: this.lastReason };
      }
    }
    if (this.step === 0 && !low) this.lastReason = 'idle: frame rate within budget';
    return { step: this.step, changed: false, reason: this.lastReason };
  }
}

export interface AdaptiveQualityOptions {
  monitor: StreamingMonitor;
  preset: () => QualitySettings;
  /** Effective minFps (preset's, or the URL/software-renderer relaxation used by the boot gate). */
  minFps: () => number;
  /** "Protect frame rate" setting. */
  enabled: () => boolean;
  /** Applies resolved settings to the engine (viewer + scene systems). */
  apply: (q: QualitySettings, step: number, reason: string) => void;
  onReadout?: (r: AdaptiveReadout) => void;
  evaluateEveryMs?: number;
}

/**
 * Runs the ladder from the streaming monitor's frame stream. Inactive until `setActive(true)` (the engine activates
 * it once the boot gate reports ready, so a cold start never degrades the preset).
 */
export class AdaptiveQuality {
  private controller: AdaptiveController;
  private active = false;
  private wasEnabled: boolean;
  private lastEval = 0;
  private lastPublish = 0;
  private current: QualitySettings;
  private readonly remove: () => void;
  private readonly evaluateEveryMs: number;

  constructor(private readonly opts: AdaptiveQualityOptions) {
    const p = opts.preset();
    this.controller = new AdaptiveController({ minFps: opts.minFps(), targetFps: p.targetFps });
    this.current = p;
    this.wasEnabled = opts.enabled();
    this.evaluateEveryMs = opts.evaluateEveryMs ?? 250;
    this.remove = opts.monitor.addFrameListener((_dt, now) => this.onFrame(now));
    this.publish();
  }

  /** Effective settings after the ladder (what the scene systems should read). */
  get settings(): QualitySettings { return this.current; }
  get step(): number { return this.controller.step; }

  setActive(active: boolean): void { this.active = active; this.lastEval = 0; this.publish(); }

  /** Preset (or minFps) changed: restart from rung 0 with the new thresholds. */
  resetForPreset(): void {
    const p = this.opts.preset();
    this.controller = new AdaptiveController({ minFps: this.opts.minFps(), targetFps: p.targetFps });
    this.current = p;
    this.publish();
  }

  private onFrame(now: number): void {
    if (now - this.lastEval < this.evaluateEveryMs) return;
    this.lastEval = now;
    const enabled = this.opts.enabled();
    if (enabled !== this.wasEnabled) {
      this.wasEnabled = enabled;
      if (!enabled && this.controller.step > 0) { this.controller.reset(); this.applyStep(0, 'protect frame rate switched off'); }
      this.publish();
    }
    if (!this.active || !enabled) return;
    const fps = this.opts.monitor.currentFps(now);
    const d = this.controller.update(fps, now);
    if (d.changed) this.applyStep(d.step, d.reason);
    if (d.changed || now - this.lastPublish >= 1000) this.publish(fps, now);
  }

  private applyStep(step: number, reason: string): void {
    this.current = resolveQuality(this.opts.preset(), step);
    this.opts.apply(this.current, step, reason);
  }

  readout(fps = this.opts.monitor.currentFps()): AdaptiveReadout {
    const step = this.controller.step;
    return {
      enabled: this.opts.enabled(),
      step,
      maxStep: this.controller.maxStep,
      stepLabel: step > 0 ? degradationLadder[step - 1].label : null,
      resolutionScale: this.current.resolutionScale,
      reason: !this.opts.enabled() ? 'off (Settings → Protect frame rate)' : !this.active ? 'waiting for ready' : this.controller.reason,
      fps,
      minFps: this.controller.minFps,
      targetFps: this.controller.targetFps,
    };
  }

  private publish(fps?: number, now = performance.now()): void { this.lastPublish = now; this.opts.onReadout?.(this.readout(fps)); }

  destroy(): void { this.remove(); }
}
