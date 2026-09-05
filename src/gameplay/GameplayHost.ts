import { Cartesian3, Cartographic, Math as CMath } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import { useTerraStore } from '@/state/store';
import type { GameplayContext, GameplayOverlay, GameplaySystem, Interaction, PlayerSnapshot, SpawnPoint } from './types';
import { createGameplaySystems } from './registry';

const EMBODIED = new Set(['walk', 'drive', 'passenger']);

/**
 * Runs gameplay systems every frame, resolves the nearest interaction around the player and drives the prompt/overlay
 * UI. Systems never touch each other directly: they register interactions and read the shared context.
 */
export class GameplayHost {
  readonly systems: GameplaySystem[] = [];
  private removePreUpdate: () => void;
  private lastTime: number | null = null;
  private lastScan = 0;
  private current: Interaction | null = null;
  private overlayAction: ((id: string) => void) | null = null;
  private destroyed = false;

  constructor(private readonly engine: TerraEngine) {
    this.removePreUpdate = engine.viewer.scene.preUpdate.addEventListener(() => this.tick());
    for (const s of createGameplaySystems(engine)) this.register(s);
  }

  register(system: GameplaySystem): void {
    this.systems.push(system);
  }

  player(): PlayerSnapshot {
    const modes = this.engine.modes;
    const mode = modes.getMode();
    const embodied = EMBODIED.has(mode);
    const carto = embodied && mode !== 'passenger' ? Cartographic.fromCartesian(modes.bodyPosition()) : this.engine.viewer.camera.positionCartographic;
    return { lat: CMath.toDegrees(carto.latitude), lon: CMath.toDegrees(carto.longitude), heightM: carto.height, mode, embodied };
  }

  private tick(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = this.lastTime === null ? 0.016 : Math.min(0.25, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const ctx: GameplayContext = { engine: this.engine, dt, player: this.player(), nowMs: now };
    for (const s of this.systems) {
      try { s.update?.(ctx); } catch (e) { this.report(s, e); }
    }
    if (now - this.lastScan > 150) { this.lastScan = now; this.scan(ctx); }
  }

  private report(s: GameplaySystem, e: unknown): void {
    const store = useTerraStore.getState();
    if (!store.diagnostics.some((d) => d.message.startsWith(`Gameplay ${s.id}`))) store.log('error', `Gameplay ${s.id} failed: ${String(e)}`, e);
  }

  private scan(ctx: GameplayContext): void {
    let best: Interaction | null = null;
    let bestScore = Infinity;
    const p = ctx.player;
    const mode = p.mode;
    for (const s of this.systems) {
      let list: Interaction[] = [];
      try { list = s.interactions?.(ctx) ?? []; } catch (e) { this.report(s, e); continue; }
      for (const it of list) {
        const allowed = it.modes ?? ['walk', 'drive'];
        if (!allowed.includes(mode)) continue;
        const d = distanceM(p.lat, p.lon, it.lat, it.lon);
        if (d > it.radiusM) continue;
        const score = d - (it.priority ?? 0) * 1000;
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best?.id !== this.current?.id) {
      this.current = best;
      useTerraStore.getState().setGameplay({ prompt: best ? { id: best.id, label: best.label } : null });
    }
  }

  /** Runs the highlighted interaction (E key / tap). */
  interact(): void {
    const it = this.current;
    if (!it) return;
    void Promise.resolve(it.run()).catch((e) => useTerraStore.getState().log('error', `Interaction "${it.label}" failed: ${String(e)}`, e));
  }

  showOverlay(overlay: GameplayOverlay, onAction: (id: string) => void): void {
    this.overlayAction = onAction;
    useTerraStore.getState().setGameplay({ overlay });
  }

  closeOverlay(): void {
    this.overlayAction = null;
    useTerraStore.getState().setGameplay({ overlay: null });
  }

  /** Called by the HUD when the player picks an overlay action. */
  chooseOverlayAction(id: string): void {
    const fn = this.overlayAction;
    if (!fn) return;
    try { fn(id); } catch (e) { useTerraStore.getState().log('error', `Overlay action failed: ${String(e)}`, e); }
  }

  /** Spawns the player as a walking character at a spawn point (flies there first when far away). */
  async spawn(spawn: SpawnPoint, view: 'first' | 'third' = 'third'): Promise<void> {
    const store = useTerraStore.getState();
    store.setGameplay({ player: { spawned: true, spawnName: spawn.name, spawnId: spawn.id }, overlay: null, prompt: null });
    const cam = this.engine.viewer.camera.positionCartographic;
    const far = distanceM(CMath.toDegrees(cam.latitude), CMath.toDegrees(cam.longitude), spawn.lat, spawn.lon) > 400 || cam.height > 3000;
    if (far) await this.engine.goTo({ lat: spawn.lat, lon: spawn.lon, heightM: 120, headingDeg: spawn.headingDeg, pitchDeg: -35 });
    // Wait briefly for terrain around the spawn so the body lands on the ground rather than the ellipsoid.
    const ground = await this.engine.terrainHeight(spawn.lat, spawn.lon);
    if (this.destroyed) return;
    this.engine.modes.setMode('walk');
    this.engine.modes.setBody(spawn.lat, spawn.lon, spawn.headingDeg, ground);
    this.engine.modes.setView(view);
    for (const s of this.systems) { try { s.onSpawn?.(spawn.lat, spawn.lon); } catch (e) { this.report(s, e); } }
  }

  /** Teleports the embodied player (used by fast travel, exits and respawns). */
  teleport(lat: number, lon: number, headingDeg?: number): void {
    const modes = this.engine.modes;
    if (!EMBODIED.has(modes.getMode())) modes.setMode('walk');
    modes.setBody(lat, lon, headingDeg);
  }

  stats(): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const s of this.systems) {
      const st = s.stats?.();
      if (st) for (const [k, v] of Object.entries(st)) out[`${s.label}: ${k}`] = v;
    }
    return out;
  }

  destroy(): void {
    this.destroyed = true;
    this.removePreUpdate();
    for (const s of this.systems) { try { s.destroy?.(); } catch { /* ignore */ } }
    this.systems.length = 0;
  }
}

/** Great-circle distance in metres (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = CMath.toRadians(lat2 - lat1);
  const dLon = CMath.toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(CMath.toRadians(lat1)) * Math.cos(CMath.toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ECEF point for a lat/lon at a height above the ellipsoid. */
export function ecef(lat: number, lon: number, heightM: number): Cartesian3 {
  return Cartesian3.fromDegrees(lon, lat, heightM);
}
