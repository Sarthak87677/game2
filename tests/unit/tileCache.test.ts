import { describe, expect, it } from 'vitest';
import { TileCache } from '@/data/cache/tileCache';

describe('TileCache (IndexedDB via fake-indexeddb)', () => {
  it('stores and retrieves buffers and strings', async () => {
    const cache = new TileCache({ name: `t-${Math.random()}`, maxBytes: 1024 * 1024 });
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    await cache.put('a', buf);
    await cache.put('b', 'hello');
    const a = await cache.get('a');
    expect(a).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(a as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(await cache.get('b')).toBe('hello');
    expect(await cache.get('missing')).toBeNull();
    expect(cache.hits).toBe(2);
    expect(cache.misses).toBe(1);
  });
  it('evicts least-recently-used entries when over budget', async () => {
    const cache = new TileCache({ name: `t-${Math.random()}`, maxBytes: 10_000 });
    for (let i = 0; i < 20; i++) await cache.put(`k${i}`, new ArrayBuffer(1000));
    expect(cache.bytesUsed).toBeLessThanOrEqual(10_000);
    expect(await cache.get('k0')).toBeNull();
    expect(await cache.get('k19')).not.toBeNull();
  });
  it('clear empties the store', async () => {
    const cache = new TileCache({ name: `t-${Math.random()}` });
    await cache.put('x', 'y');
    await cache.clear();
    expect(await cache.get('x')).toBeNull();
    expect(cache.bytesUsed).toBe(0);
  });
});
