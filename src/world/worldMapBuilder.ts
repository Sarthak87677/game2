import type { NaturalEarth } from '@/data/naturalEarth';
import type { WorldMapBuildRequest, WorldMapBuildResponse } from '@/workers/worldMap.worker';
import { WorldMap } from './worldMap';

/** Builds the WorldMap in a worker. Resolves with the map; rejects if the worker fails. */
export function buildWorldMap(ne: NaturalEarth, terrariumUrl: string | null, onProgress?: (msg: string) => void): Promise<WorldMap> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/worldMap.worker.ts', import.meta.url), { type: 'module', name: 'worldmap' });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    worker.onmessage = (ev: MessageEvent<WorldMapBuildResponse>) => {
      const msg = ev.data;
      if (msg.progress) onProgress?.(msg.progress);
      if (msg.error) { worker.terminate(); reject(new Error(msg.error)); }
      if (msg.data) { worker.terminate(); resolve(new WorldMap(msg.data)); }
    };
    worker.onerror = (ev) => { worker.terminate(); reject(new Error(ev.message || 'worldmap worker error')); };
    const req: WorldMapBuildRequest = { ...ne.toWorkerBundle(), terrariumUrl };
    worker.postMessage(req);
  });
}
