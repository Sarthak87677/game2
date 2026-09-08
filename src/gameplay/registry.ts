import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplaySystem } from './types';
import { CrowdSystem } from '@/world/crowds/CrowdSystem';
import { WildlifeSystem } from '@/world/wildlife/WildlifeSystem';
import { MonsoonSystem } from '@/world/climate/MonsoonSystem';
import { ActivitiesSystem } from '@/gameplay/activities/ActivitiesSystem';
import { VehicleSystem } from './vehicles/VehicleSystem';
import { ShowroomSystem } from './showroom/ShowroomSystem';
import { TajMahalSystem } from '@/world/hero/TajMahal';
import { RailSystem } from './rail/RailSystem';
import { AirSystem } from './air/AirSystem';
import { MarineSystem } from './marine/MarineSystem';
import { InteriorSystem } from './interiors/InteriorSystem';

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
  systems.push(new VehicleSystem(engine));
  systems.push(new ShowroomSystem(engine));
  systems.push(new TajMahalSystem(engine)); // maharashtra-data: Taj Mahal hero destination
  systems.push(new RailSystem(engine));
  systems.push(new AirSystem(engine));
  systems.push(new MarineSystem(engine));
  systems.push(new InteriorSystem(engine));
  return systems;
}
