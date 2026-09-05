import type { ModeId } from '@/modes/ModeController';
import type { TerraEngine } from '@/engine/TerraEngine';

/** Something the player can do when close enough: enter a door, board a train, inspect a car… */
export interface Interaction {
  id: string;
  /** Verb phrase shown in the prompt, e.g. "Enter Library" or "Board train to Pune". */
  label: string;
  lat: number;
  lon: number;
  /** Activation radius in metres from the player's body. */
  radiusM: number;
  /** Higher wins when several interactions overlap (default 0). */
  priority?: number;
  /** Modes in which this interaction is offered (default: walk and drive). */
  modes?: ModeId[];
  run: () => void | Promise<void>;
}

/** A modal card with choices (ticket counter, seat selection, showroom inspection…). Rendered by the HUD. */
export interface GameplayOverlay {
  title: string;
  lines: string[];
  actions: { id: string; label: string; disabled?: boolean }[];
  /** Small-print provenance line, e.g. "Fictional in-game ticket — no real money." */
  note?: string;
}

export interface PlayerSnapshot {
  lat: number;
  lon: number;
  heightM: number;
  mode: ModeId;
  /** True while the player has spawned as a character (walk/drive/passenger), false in orbit/fly/tour. */
  embodied: boolean;
}

export interface GameplayContext {
  engine: TerraEngine;
  /** Seconds since the previous frame (clamped). */
  dt: number;
  player: PlayerSnapshot;
  nowMs: number;
}

/** A gameplay subsystem (interiors, vehicles, rail, air, marine, activities…). Registered in `registry.ts`. */
export interface GameplaySystem {
  id: string;
  label: string;
  /** Per-frame hook (runs before Cesium's scene update). Keep it cheap; heavy work goes to workers/timers. */
  update?(ctx: GameplayContext): void;
  /** Interactions currently offered near the player. Called at most a few times per second. */
  interactions?(ctx: GameplayContext): Interaction[];
  /** Key/value lines for the Diagnostics panel. */
  stats?(): Record<string, string | number>;
  /** Called when the player spawns/teleports (systems can pre-stream content around the spawn). */
  onSpawn?(lat: number, lon: number): void;
  destroy?(): void;
}

/** A named place where the player can spawn as a character. */
export interface SpawnPoint {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  headingDeg: number;
  description: string;
  /** What is real vs generated here (always shown in the UI). */
  dataNote: string;
  /** Approximate coordinates flag — every spawn point written from public reference values is approximate. */
  approximate: boolean;
}
