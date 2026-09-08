import { describe, expect, it } from 'vitest';
import { BOARDING_SPOT, CRUISE_ROOMS, DECK_Z, placeName, POOL, roomWalls, sampleDeck } from '@/gameplay/marine/cruiseDecks';

describe('cruise deck sampler', () => {
  it('returns the promenade deck at the boarding spot and null outside the hull', () => {
    expect(sampleDeck(BOARDING_SPOT.x, BOARDING_SPOT.y, DECK_Z[0])).toBe(DECK_Z[0]);
    expect(sampleDeck(200, 0, DECK_Z[0])).toBeNull();
    expect(sampleDeck(0, 40, DECK_Z[0])).toBeNull();
  });
  it('keeps a walker on their own deck (the upper decks are not reachable by stepping up)', () => {
    expect(sampleDeck(-40, 11, DECK_Z[0])).toBe(DECK_Z[0]);
    expect(sampleDeck(-40, 11, DECK_Z[1])).toBe(DECK_Z[1]);
    expect(sampleDeck(-40, 11, DECK_Z[2])).toBe(DECK_Z[2]);
  });
  it('ramps climb monotonically from one deck to the next', () => {
    let z = DECK_Z[0];
    for (let x = -4; x <= 14; x += 0.5) { const h = sampleDeck(x, 0, z)!; expect(h).toBeGreaterThanOrEqual(z - 1e-9); z = h; }
    expect(z).toBeCloseTo(DECK_Z[1], 6);
    z = DECK_Z[1];
    for (let x = -30; x <= -12; x += 0.5) { const h = sampleDeck(x, 0, z)!; expect(h).toBeGreaterThanOrEqual(z - 1e-9); z = h; }
    expect(z).toBeCloseTo(DECK_Z[2], 6);
  });
  it('blocks walls but leaves doorways open', () => {
    const restaurant = CRUISE_ROOMS.find((r) => r.name.includes('Restaurant'))!;
    const z = DECK_Z[0];
    // Aft wall of the restaurant at x0, away from the door (door centred at y=0, width 3).
    expect(sampleDeck(restaurant.x0, 5, z)).toBeGreaterThan(z + 2);
    expect(sampleDeck(restaurant.x0, 0, z)).toBe(z);
    // Inside the room is walkable.
    expect(sampleDeck((restaurant.x0 + restaurant.x1) / 2, 0, z)).toBe(z);
    expect(roomWalls(restaurant).length).toBeGreaterThanOrEqual(4);
  });
  it('lets the walker step down into the pool and names rooms', () => {
    const z = DECK_Z[1];
    expect(sampleDeck((POOL.x0 + POOL.x1) / 2, 0, z)).toBeCloseTo(z - POOL.depth, 6);
    expect(placeName(40, 0, DECK_Z[0])).toContain('Restaurant');
    expect(placeName(-40, 0, DECK_Z[0])).toContain('Theatre');
    expect(placeName(-40, 10, DECK_Z[2])).toContain('Sky');
  });
});
