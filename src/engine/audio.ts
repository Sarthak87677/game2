import type { Biome } from '@/world/climate/biome';
import type { WeatherState } from './environment';

export interface AudioSceneInput {
  biome: Biome;
  weather: WeatherState | null;
  altitudeAglM: number;
  sunElevationDeg: number;
  nearWater: boolean;
  /** 0..1 */
  urban: number;
}

/**
 * Procedural environmental audio (no sample assets): filtered-noise wind, rain, surf, forest birds/insects and
 * distant city hum, mixed by biome, weather, time of day and altitude. Starts only after a user gesture and only
 * when enabled in Settings.
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = new Map<string, { gain: GainNode; target: number }>();
  private birdTimer: number | null = null;
  private lastInput: AudioSceneInput | null = null;
  private enabled = false;

  get isEnabled(): boolean { return this.enabled; }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const noise = this.noiseBuffer(ctx, 4);
    const layer = (name: string, filterType: BiquadFilterType, freq: number, q = 0.7, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      this.layers.set(name, { gain, target: 0 });
      return { filter, gain };
    };
    const wind = layer('wind', 'lowpass', 400, 0.5);
    // Slow wind gusts via an LFO on the filter frequency.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(wind.filter.frequency);
    lfo.start();
    layer('rain', 'highpass', 1800, 0.3, 1.2);
    const surf = layer('surf', 'lowpass', 700, 0.8, 0.6);
    const surfLfo = ctx.createOscillator();
    surfLfo.frequency.value = 0.12;
    const surfLfoGain = ctx.createGain();
    surfLfoGain.gain.value = 0.35;
    surfLfo.connect(surfLfoGain).connect(surf.gain.gain);
    surfLfo.start();
    layer('city', 'bandpass', 180, 1.2, 0.5);
    layer('insects', 'bandpass', 4200, 8, 1);
    return true;
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise (Paul Kellet approximation, cheap 3-pole).
      b0 = 0.997 * b0 + 0.029591 * white;
      b1 = 0.985 * b1 + 0.032534 * white;
      b2 = 0.95 * b2 + 0.048056 * white;
      d[i] = (b0 + b1 + b2 + white * 0.05) * 0.25;
    }
    return buf;
  }

  /** Enable/disable; must be called from a user gesture the first time. */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (!enabled) {
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      if (this.birdTimer !== null) { window.clearTimeout(this.birdTimer); this.birdTimer = null; }
      return;
    }
    if (!this.ensure()) return;
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();
    this.master!.gain.setTargetAtTime(0.5, this.ctx!.currentTime, 0.5);
    if (this.lastInput) this.update(this.lastInput);
    this.scheduleBird();
  }

  private scheduleBird(): void {
    if (!this.enabled || !this.ctx) return;
    const input = this.lastInput;
    const forest = input && /forest|rainforest|savanna|wetland|mangrove|mediterranean/.test(input.biome) && input.altitudeAglM < 400 && input.sunElevationDeg > -3;
    const delay = forest ? 1500 + Math.random() * 5000 : 8000;
    this.birdTimer = window.setTimeout(() => { if (forest) this.chirp(); this.scheduleBird(); }, delay);
  }

  private chirp(): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = 1800 + Math.random() * 2200;
    const t = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.18);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Re-mixes layers for the current scene; cheap, call a few times per second. */
  update(input: AudioSceneInput): void {
    this.lastInput = input;
    if (!this.enabled || !this.ctx) return;
    const w = input.weather;
    const altitudeFade = 1 - Math.min(1, Math.max(0, (input.altitudeAglM - 300) / 3000));
    const windSpeed = w?.windSpeedMs ?? 3;
    const set = (name: string, v: number) => {
      const l = this.layers.get(name);
      if (!l) return;
      l.target = v;
      l.gain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.8);
    };
    const highAltitudeWind = Math.min(0.5, Math.max(0, (input.altitudeAglM - 300) / 4000)) * 0.4;
    set('wind', Math.min(0.9, 0.08 + windSpeed / 25) * altitudeFade + highAltitudeWind);
    set('rain', (w?.precipitation ?? 0) * (w?.condition === 'snow' ? 0.15 : 0.9) * altitudeFade);
    set('surf', input.nearWater && input.biome !== 'lake' ? 0.5 * altitudeFade : 0);
    set('city', input.urban * 0.35 * altitudeFade * (input.sunElevationDeg > -6 ? 1 : 0.6));
    const tropicalNight = /tropical|savanna|mangrove/.test(input.biome) && input.sunElevationDeg < 0;
    set('insects', tropicalNight ? 0.12 * altitudeFade : 0);
  }

  destroy(): void {
    if (this.birdTimer !== null) window.clearTimeout(this.birdTimer);
    void this.ctx?.close();
    this.ctx = null;
    this.layers.clear();
  }
}
