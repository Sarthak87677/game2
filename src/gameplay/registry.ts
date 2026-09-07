import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplaySystem } from './types';
import { VehicleSystem } from './vehicles/VehicleSystem';
import { ShowroomSystem } from './showroom/ShowroomSystem';

/**
 * Every gameplay subsystem is constructed here. Add one line per system; systems must not import each other — they
 * communicate through the engine, the store and the interaction/overlay API of the host.
 */
export function createGameplaySystems(engine: TerraEngine): GameplaySystem[] {
  const systems: GameplaySystem[] = [];
  systems.push(new VehicleSystem(engine));
  systems.push(new ShowroomSystem(engine));
  return systems;
}
