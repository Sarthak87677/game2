/**
 * Applies the Maharashtra seasonal preset (`monsoon.ts`) through the existing weather/ground hooks: when the player
 * is inside the region and the current weather is simulated (not live/historical), the 6-hour block condition is
 * pushed through `engine.setWeather` and the dry-season browning through the ground material's `seasonTint`.
 * Registered as the `monsoon` gameplay system; can be disabled from the Activities tab (persisted).
 */
import type { TerraEngine } from '@/engine/TerraEngine';
import { weatherFromPreset } from '@/engine/environment';
import type { GameplayContext, GameplaySystem } from '@/gameplay/types';
import { useTerraStore } from '@/state/store';
import { pickSeasonWeather, seasonPreset, type SeasonPreset } from './monsoon';

const KEY = 'terra-infinite.monsoon-preset.v1';

export class MonsoonSystem implements GameplaySystem {
  readonly id = 'monsoon';
  readonly label = 'Season';
  private enabled = true;
  private lastCheck = 0;
  private appliedKey: string | null = null;
  private appliedWeather: unknown = null;
  private current: SeasonPreset | null = null;
  private lastCondition: string | null = null;

  constructor(private readonly engine: TerraEngine) {
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* ignore */ }
  }

  isEnabled(): boolean { return this.enabled; }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) { this.engine.ground?.setUniform('seasonTint', 0); this.appliedKey = null; this.current = null; }
    else this.apply(true);
  }

  /** Current preset for the player/camera position (null outside Maharashtra). */
  preset(): SeasonPreset | null { return this.current; }

  onSpawn(): void { this.apply(true); }

  update(ctx: GameplayContext): void {
    if (ctx.nowMs - this.lastCheck < 2000) return;
    this.lastCheck = ctx.nowMs;
    this.apply(false);
  }

  /**
   * Applies the preset. `force` re-pushes the weather even if the block key is unchanged (spawn, toggle). Otherwise the
   * weather is only pushed when the 6-hour block changes, or when the engine re-simulated the weather after a flight
   * (the store weather object is not ours) — manual presets chosen by the user in the same block are respected because
   * they are only replaced at the next block boundary.
   */
  apply(force: boolean): void {
    if (!this.enabled) return;
    const cam = this.engine.cameraDegrees();
    const p = this.engine.gameplay.player();
    const lat = p.embodied ? p.lat : cam.lat, lon = p.embodied ? p.lon : cam.lon;
    const date = this.engine.environment.getDate();
    const preset = seasonPreset(date, lat, lon);
    this.current = preset;
    if (!preset) { if (this.appliedKey) { this.engine.ground?.setUniform('seasonTint', 0); this.appliedKey = null; } return; }
    const store = useTerraStore.getState();
    const weather = store.weather;
    if (weather && weather.source !== 'simulated') return;
    const elevation = this.engine.worldMap?.sample(lat, lon).elevationM ?? 0;
    const pick = pickSeasonWeather(preset, date, lat, lon, elevation);
    const reSimulated = weather !== null && this.appliedWeather !== null && weather !== this.appliedWeather && this.appliedKey === pick.blockKey && !this.userChangedWeather(weather);
    if (!force && pick.blockKey === this.appliedKey && !reSimulated) return;
    const sample = this.engine.worldMap?.sample(lat, lon);
    const temp = sample ? Math.round(sample.monthlyTempC[date.getUTCMonth()] - (pick.condition === 'rain' || pick.condition === 'storm' ? 3 : 0)) : 27;
    const w = weatherFromPreset(pick.condition, temp, 240, 'simulated');
    w.windSpeedMs = Math.round(pick.windMs * 10) / 10;
    w.humidity = preset.phase === 'monsoon' ? 0.92 : preset.phase === 'dry' ? 0.35 : 0.6;
    this.engine.setWeather(w);
    this.engine.ground?.setUniform('seasonTint', preset.browning);
    this.appliedKey = pick.blockKey;
    this.appliedWeather = useTerraStore.getState().weather;
    this.lastCondition = pick.condition;
  }

  /** Heuristic: a manual preset differs from the engine's flight re-simulation by carrying the exact preset humidity. */
  private userChangedWeather(w: { humidity: number; condition: string }): boolean {
    return (w.humidity === 0.4 || w.humidity === 0.8) && w.condition !== this.lastCondition;
  }

  stats(): Record<string, string | number> {
    return { preset: this.enabled ? (this.current ? `${this.current.phase} (${this.lastCondition ?? '—'})` : 'outside Maharashtra') : 'disabled', browning: this.current?.browning ?? 0 };
  }

  destroy(): void {
    this.engine.ground?.setUniform('seasonTint', 0);
  }
}
