import type { NaturalEarth } from '@/data/naturalEarth';
import type { WorldMap } from '@/world/worldMap';
import { createEsriImageryAdapter, createGibsImageryAdapter, createIonImageryAdapter, createMapTilerImageryAdapter, createOsmImageryAdapter, createProceduralImageryAdapter } from './imagery';
import { createEllipsoidTerrainAdapter, createIonTerrainAdapter, createTerrariumTerrainAdapter } from './terrain';
import type { TerrariumTerrainProviderOptions } from './terrain/terrariumTerrainProvider';
import type { AdapterEnv, DataSourceInfo, ImageryAdapter, TerrainAdapter } from './types';

export interface RegistryDeps {
  naturalEarth: () => NaturalEarth | null;
  worldMap: () => WorldMap | null;
  terrariumOptions?: TerrariumTerrainProviderOptions;
}

/** Central registry of data adapters; the UI lists sources and provenance from here. */
export class AdapterRegistry {
  readonly terrain = new Map<string, TerrainAdapter>();
  readonly imagery = new Map<string, ImageryAdapter>();

  constructor(readonly env: AdapterEnv, deps: RegistryDeps) {
    for (const a of [createTerrariumTerrainAdapter(env, deps.terrariumOptions), createIonTerrainAdapter(env), createEllipsoidTerrainAdapter()]) this.terrain.set(a.info.id, a);
    for (const a of [createProceduralImageryAdapter({ naturalEarth: deps.naturalEarth, worldMap: deps.worldMap }), createGibsImageryAdapter(env), createEsriImageryAdapter(env), createOsmImageryAdapter(env), createMapTilerImageryAdapter(env), createIonImageryAdapter(env)]) this.imagery.set(a.info.id, a);
  }

  defaultTerrainId(): string {
    const pref = (import.meta.env.VITE_DEFAULT_TERRAIN as string | undefined)?.trim();
    if (pref && this.terrain.get(pref)?.isAvailable().available) return pref;
    if (this.env.cesiumIonToken) return 'ion';
    return 'terrarium';
  }

  defaultImageryId(): string {
    const pref = (import.meta.env.VITE_DEFAULT_IMAGERY as string | undefined)?.trim();
    if (pref && this.imagery.get(pref)?.isAvailable().available) return pref;
    if (this.env.cesiumIonToken) return 'ion';
    if (this.env.maptilerKey) return 'maptiler';
    return 'procedural';
  }

  listSources(): DataSourceInfo[] {
    return [...this.terrain.values(), ...this.imagery.values()].map((a) => a.info);
  }
}
