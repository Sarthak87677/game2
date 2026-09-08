import type { TerraEngine } from '@/engine/TerraEngine';

/**
 * Ground height lookup for placed objects: the synchronous loaded-tile sampler when it can answer, otherwise a
 * memoised asynchronous terrain sample (provider level 12 → loaded tiles → climate atlas → 0 on the ellipsoid), so
 * parked vehicles, gates and showrooms still land on the ground when terrain has not streamed (or is unavailable).
 */
export class GroundResolver {
  private pending = new Map<string, number | null>();

  constructor(private readonly engine: TerraEngine) {}

  /** Height above the ellipsoid, or null while the asynchronous sample is still in flight. */
  get(key: string, lat: number, lon: number): number | null {
    const sync = this.engine.groundHeightAt(lat, lon);
    if (sync !== null) { this.pending.set(key, sync); return sync; }
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    this.pending.set(key, null);
    void this.engine.terrainHeight(lat, lon).then((h) => { if (this.pending.get(key) === null) this.pending.set(key, h); }).catch(() => { this.pending.set(key, 0); });
    return null;
  }

  forget(key: string): void { this.pending.delete(key); }
}
