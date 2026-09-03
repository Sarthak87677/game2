import { describe, expect, it } from 'vitest';

/** The Terrarium formula used by both the worker and the main-thread decoder. */
function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

describe('Terrarium encoding', () => {
  it('decodes sea level, Everest and the Dead Sea', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(162, 143, 0)).toBe(8847);
    expect(terrariumHeight(126, 90, 0)).toBe(-422);
  });
  it('quantisation is 1/256 m', () => {
    expect(terrariumHeight(128, 0, 128) - terrariumHeight(128, 0, 0)).toBe(0.5);
  });
});
