import { describe, expect, it } from 'vitest';
import { CONTACT_DISTANCE_M, interactionScore } from '@/gameplay/selection';

const ferry = { radiusM: 220, priority: 2 };
const enterBus = { radiusM: 8.2, priority: 0 };
const readAbout = { radiusM: 160, priority: -1 };
const court = { radiusM: 160, priority: 0 };
const litter = { radiusM: 2.6, priority: 3 };

describe('interaction prompt selection', () => {
  it('returns null outside the radius', () => {
    expect(interactionScore(9, enterBus)).toBeNull();
    expect(interactionScore(221, ferry)).toBeNull();
  });
  it('a vehicle the player stands at beats an area prompt with a higher priority', () => {
    const bus = interactionScore(3, enterBus)!;
    const jetty = interactionScore(30, ferry)!;
    expect(bus).toBeLessThan(jetty);
  });
  it('the area prompt wins again once the player walks away from the vehicle', () => {
    expect(interactionScore(7, enterBus)).toBeLessThan(0 + 7 + 1); // still in range…
    const bus = interactionScore(7, enterBus)!; // …but beyond contact distance: plain tier
    const jetty = interactionScore(30, ferry)!;
    expect(jetty).toBeLessThan(bus);
    expect(CONTACT_DISTANCE_M).toBeLessThan(7);
  });
  it('within a tier priority decides, then distance', () => {
    expect(interactionScore(40, court)!).toBeLessThan(interactionScore(0, readAbout)!);
    expect(interactionScore(5, readAbout)!).toBeLessThan(interactionScore(50, readAbout)!);
  });
  it('two contact interactions: priority then distance', () => {
    expect(interactionScore(2, litter)!).toBeLessThan(interactionScore(1, enterBus)!);
    expect(interactionScore(1, enterBus)!).toBeLessThan(interactionScore(2, { radiusM: 8, priority: 0 })!);
  });
});
