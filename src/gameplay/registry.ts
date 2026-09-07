import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplaySystem } from './types';
import { RailSystem } from './rail/RailSystem';

/**
 * Every gameplay subsystem is constructed here. Add one line per system; systems must not import each other — they
 * communicate through the engine, the store and the interaction/overlay API of the host.
 */
export function createGameplaySystems(engine: TerraEngine): GameplaySystem[] {
  const systems: GameplaySystem[] = [];
  systems.push(new RailSystem(engine));
  return systems;
}
