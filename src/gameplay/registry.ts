import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplaySystem } from './types';
import { CrowdSystem } from '@/world/crowds/CrowdSystem';
import { WildlifeSystem } from '@/world/wildlife/WildlifeSystem';
import { MonsoonSystem } from '@/world/climate/MonsoonSystem';
import { ActivitiesSystem } from '@/gameplay/activities/ActivitiesSystem';

/**
 * Every gameplay subsystem is constructed here. Add one line per system; systems must not import each other — they
 * communicate through the engine, the store and the interaction/overlay API of the host.
 */
export function createGameplaySystems(engine: TerraEngine): GameplaySystem[] {
  const systems: GameplaySystem[] = [];
  systems.push(new CrowdSystem(engine));
  systems.push(new WildlifeSystem(engine));
  systems.push(new MonsoonSystem(engine));
  systems.push(new ActivitiesSystem(engine));
  return systems;
}
