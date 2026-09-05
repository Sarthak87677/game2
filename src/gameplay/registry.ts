import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplaySystem } from './types';

/**
 * Every gameplay subsystem is constructed here. Add one line per system; systems must not import each other — they
 * communicate through the engine, the store and the interaction/overlay API of the host.
 */
export function createGameplaySystems(engine: TerraEngine): GameplaySystem[] {
  void engine;
  const systems: GameplaySystem[] = [];
  return systems;
}
