/**
 * Region-specific procedural ambience layered on top of the engine's biome audio: crowd murmur, station chimes and
 * rumble, temple bells, crows, village goats/cattle lowing, coast gulls, hill wind and monsoon thunder. Everything is
 * synthesised (filtered noise and oscillators) — no recorded samples. Runs only when the engine audio is enabled by
 * the user (Settings → audio), on its own AudioContext so it never touches engine files.
 */
import type { AmbienceKind } from '@/data/maharashtra/living';

export interface AmbienceScene {
  kind: AmbienceKind;
  /** 0..1 crowd size near the listener. */
  crowd: number;
  storm: boolean;
  rain: boolean;
  night: boolean;
  templeNear: boolean;
  altitudeAglM: number;
}

export interface AmbienceMix { murmur: number; station: number; hillWind: number; forestBirds: number; village: number; coast: number }

/** Pure mixing rule (unit-tested). */
export function mixFor(s: AmbienceScene): AmbienceMix {
  const fade = 1 - Math.min(1, Math.max(0, (s.altitudeAglM - 150) / 800));
  const nightK = s.night ? 0.5 : 1;
  return {
    murmur: Math.min(0.35, s.crowd * 0.35) * fade * nightK,
    station: (s.kind === 'station' ? 0.25 : 0) * fade,
    hillWind: (s.kind === 'hills' ? 0.2 : 0) * fade,
    forestBirds: (s.kind === 'forest' && !s.night ? 0.2 : 0) * fade,
    village: (s.kind === 'village' && !s.night ? 0.12 : 0) * fade,
    coast: (s.kind === 'coast' ? 0.15 : 0) * fade,
  };
}

export class LivingAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = new Map<keyof AmbienceMix, GainNode>();
  private timers: number[] = [];
  private scene: AmbienceScene | null = null;
  private active = false;
  private lastThunder = 0;
  private lastEvent = 0;
  private eventCount = 0;

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.05 * w; d[i] = (b + w * 0.08) * 0.6; }
    const layer = (name: keyof AmbienceMix, type: BiquadFilterType, freq: number, q: number, lfoHz: number, lfoDepth: number) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master!);
      if (lfoDepth > 0) { const lfo = ctx.createOscillator(); lfo.frequency.value = lfoHz; const lg = ctx.createGain(); lg.gain.value = lfoDepth; lfo.connect(lg).connect(f.frequency); lfo.start(); }
      src.start();
      this.layers.set(name, g);
    };
    layer('murmur', 'bandpass', 600, 1.1, 0.35, 180);   // many voices blurred together
    layer('station', 'lowpass', 160, 0.8, 0.07, 40);    // concourse rumble
    layer('hillWind', 'bandpass', 900, 0.6, 0.12, 400); // thin wind over a plateau
    layer('coast', 'lowpass', 500, 0.7, 0.15, 200);     // extra surf body
    layer('village', 'bandpass', 2400, 2, 0.5, 300);    // dry-country insects
    layer('forestBirds', 'highpass', 3000, 0.5, 0, 0);  // light canopy hiss (chirps are events)
    return true;
  }

  /** Called every few hundred ms with the current scene; `enabled` mirrors the engine audio toggle. */
  update(scene: AmbienceScene, enabled: boolean, nowMs: number): void {
    this.scene = scene;
    if (!enabled) { if (this.active) this.stop(); return; }
    if (!this.active) {
      if (!this.ensure()) return;
      this.active = true;
      if (this.ctx!.state === 'suspended') void this.ctx!.resume().catch(() => undefined);
      this.master!.gain.setTargetAtTime(0.5, this.ctx!.currentTime, 0.6);
    }
    const mix = mixFor(scene);
    const t = this.ctx!.currentTime;
    for (const [name, g] of this.layers) g.gain.setTargetAtTime(mix[name], t, 1.2);
    // One-shot events: bells, chimes, crows, gulls, thunder.
    if (nowMs - this.lastEvent > 2500) {
      this.lastEvent = nowMs;
      this.eventCount++;
      const r = Math.random();
      if (scene.storm && nowMs - this.lastThunder > 9000 && r < 0.5) { this.thunder(); this.lastThunder = nowMs; }
      else if (scene.templeNear && r < 0.25) this.bell();
      else if (scene.kind === 'station' && r < 0.2) this.chime();
      else if ((scene.kind === 'city' || scene.kind === 'village') && !scene.night && r < 0.35) this.crow();
      else if (scene.kind === 'coast' && !scene.night && r < 0.3) this.gull();
      else if (scene.kind === 'forest' && !scene.night && r < 0.6) this.chirp();
      else if (scene.kind === 'village' && !scene.night && r < 0.15) this.low();
    }
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType, sweepTo?: number): void {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur * 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.layers.size ? (this.noiseBuffer ??= this.makeNoise()) : null;
    if (!src.buffer) return;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!); src.start(t); src.stop(t + dur + 0.05);
  }

  private noiseBuffer: AudioBuffer | null = null;
  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private bell(): void { this.tone(880, 2.5, 0.08, 'sine'); this.tone(1320, 1.6, 0.03, 'sine'); }
  private chime(): void { this.tone(659, 0.5, 0.05, 'triangle'); window.setTimeout(() => this.ctx && this.tone(523, 0.7, 0.05, 'triangle'), 350); }
  private crow(): void { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) window.setTimeout(() => this.ctx && this.burst(1100, 6, 0.22, 0.09), i * 320); }
  private gull(): void { this.tone(1500, 0.5, 0.04, 'sawtooth', 900); }
  private chirp(): void { const base = 2000 + Math.random() * 2000; this.tone(base, 0.2, 0.04, 'sine', base * 1.4); }
  private low(): void { this.tone(140, 1.2, 0.05, 'sawtooth', 110); }
  private thunder(): void { this.burst(90, 0.5, 3.5, 0.35, 'lowpass'); window.setTimeout(() => this.ctx && this.burst(60, 0.6, 5, 0.25, 'lowpass'), 600); }

  stats(): Record<string, string | number> {
    return { ambience: this.active && this.scene ? `${this.scene.kind} (crowd ${this.scene.crowd.toFixed(2)}, events ${this.eventCount})` : this.scene ? `${this.scene.kind} (audio off)` : 'idle' };
  }

  private stop(): void {
    this.active = false;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    void this.ctx?.close();
    this.ctx = null;
    this.layers.clear();
    this.active = false;
  }
}
