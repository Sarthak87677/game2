import type { EngineAudioProfile } from './catalog';

interface Bus { ctx: AudioContext; gain: GainNode }

/**
 * Procedural engine, road and horn sounds for the driven vehicle (no sample assets). Built lazily from the ambient
 * audio bus, which only exists after the user enabled audio in Settings, and torn down when the player leaves.
 */
export class VehicleAudio {
  private bus: Bus | null = null;
  private engine: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private road: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private horn: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private out: GainNode | null = null;
  private hornOn = false;

  constructor(private readonly profile: EngineAudioProfile, private readonly getBus: () => Bus | null) {}

  private ensure(): boolean {
    if (this.engine) return true;
    const bus = this.getBus();
    if (!bus) return false;
    this.bus = bus;
    const ctx = bus.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus.gain);
    const p = this.profile;
    const osc = ctx.createOscillator();
    osc.type = p.kind === 'electric' ? 'sine' : p.kind === 'diesel' ? 'square' : 'sawtooth';
    osc.frequency.value = p.idleHz;
    const sub = ctx.createOscillator();
    sub.type = p.kind === 'two-stroke' ? 'square' : 'triangle';
    sub.frequency.value = p.idleHz / 2;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.kind === 'diesel' ? 500 : 900;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.18 * p.level;
    osc.connect(filter); sub.connect(filter); filter.connect(gain).connect(this.out);
    osc.start(); sub.start();
    this.engine = { osc, sub, filter, gain };
    // Road/tyre noise: looped noise through a band-pass whose level follows speed.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass'; rf.frequency.value = 350; rf.Q.value = 0.6;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    src.connect(rf).connect(rg).connect(this.out);
    src.start();
    this.road = { gain: rg, filter: rf };
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    return true;
  }

  /** Call every frame with the driving state. */
  update(speedMs: number, throttle: number, wet: boolean): void {
    if (!this.ensure() || !this.engine || !this.road || !this.bus) return;
    const t = this.bus.ctx.currentTime;
    const p = this.profile;
    const load = Math.min(1, Math.abs(speedMs) / Math.max(1, 40)) * 0.75 + throttle * 0.35;
    const hz = p.idleHz + (p.maxHz - p.idleHz) * Math.min(1, load);
    this.engine.osc.frequency.setTargetAtTime(hz, t, 0.12);
    this.engine.sub.frequency.setTargetAtTime(hz / 2, t, 0.12);
    this.engine.filter.frequency.setTargetAtTime((p.kind === 'diesel' ? 400 : 700) + hz * 3, t, 0.15);
    this.engine.gain.gain.setTargetAtTime((0.12 + 0.16 * throttle) * p.level, t, 0.1);
    const road = Math.min(1, Math.abs(speedMs) / 30);
    this.road.gain.gain.setTargetAtTime(road * (wet ? 0.28 : 0.16), t, 0.2);
    this.road.filter.frequency.setTargetAtTime(wet ? 1200 : 350 + road * 300, t, 0.3);
  }

  setHorn(on: boolean): void {
    if (on === this.hornOn) return;
    this.hornOn = on;
    if (!this.ensure() || !this.bus || !this.out) return;
    const ctx = this.bus.ctx;
    const t = ctx.currentTime;
    if (on) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.connect(this.out);
      const oscs = this.profile.hornHz.map((hz) => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = hz;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = hz * 4;
        o.connect(f).connect(gain);
        o.start();
        return o;
      });
      this.horn = { oscs, gain };
    } else if (this.horn) {
      const h = this.horn;
      this.horn = null;
      h.gain.gain.setTargetAtTime(0, t, 0.04);
      for (const o of h.oscs) o.stop(t + 0.25);
    }
  }

  destroy(): void {
    this.setHorn(false);
    if (this.out && this.bus) {
      const out = this.out;
      out.gain.setTargetAtTime(0, this.bus.ctx.currentTime, 0.2);
      window.setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, 600);
    }
    try { this.engine?.osc.stop(); this.engine?.sub.stop(); } catch { /* ignore */ }
    this.engine = null; this.road = null; this.out = null; this.bus = null;
  }
}
