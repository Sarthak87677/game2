import { describe, expect, it } from 'vitest';
import { fbm2, fnv1a, hash2, mixSeed, Rng, valueNoise2 } from '@/util/hash';
import { cellSeed, tileRng, tileSeed, WORLD_GEN_VERSION } from '@/world/seed';

describe('deterministic hashing', () => {
  it('fnv1a is stable', () => {
    expect(fnv1a('terra')).toBe(fnv1a('terra'));
    expect(fnv1a('terra')).not.toBe(fnv1a('terrb'));
  });
  it('mixSeed depends on order and values', () => {
    expect(mixSeed(1, 2, 3)).toBe(mixSeed(1, 2, 3));
    expect(mixSeed(1, 2, 3)).not.toBe(mixSeed(3, 2, 1));
  });
  it('Rng sequences are reproducible and uniform-ish', () => {
    const a = new Rng(42), b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += r.next();
    expect(sum / 10000).toBeGreaterThan(0.47);
    expect(sum / 10000).toBeLessThan(0.53);
  });
  it('noise is continuous and bounded', () => {
    for (let i = 0; i < 200; i++) {
      const v = valueNoise2(i * 0.37, i * 0.11, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const d = Math.abs(fbm2(10.0, 5.0) - fbm2(10.001, 5.0));
    expect(d).toBeLessThan(0.02);
    expect(hash2(3, 4)).toBe(hash2(3, 4));
  });
  it('tile seeds are stable across calls and differ per tile/layer/version', () => {
    expect(tileSeed(1, 2, 3)).toBe(tileSeed(1, 2, 3));
    expect(tileSeed(1, 2, 3)).not.toBe(tileSeed(2, 1, 3));
    expect(tileSeed(1, 2, 3, 'trees')).not.toBe(tileSeed(1, 2, 3, 'rocks'));
    expect(tileRng(5, 5, 12).next()).toBe(tileRng(5, 5, 12).next());
    expect(cellSeed(10.123, 20.456, 0.01)).toBe(cellSeed(10.126, 20.459, 0.01));
    expect(WORLD_GEN_VERSION).toBeGreaterThanOrEqual(1);
  });
});
