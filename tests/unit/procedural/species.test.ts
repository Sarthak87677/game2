import { describe, expect, it } from 'vitest';
import { BIOME_INFO, type Biome } from '@/world/climate/biome';
import { SPECIES, VEGETATED_BIOMES, cropsForBiome, pickWeighted, speciesById, speciesForBiome, weightedSpeciesForBiome } from '@/world/procedural/species';
import { Rng } from '@/util/hash';

const HEX = /^#[0-9a-f]{6}$/i;
const POLAR: Biome[] = ['tundra', 'alpine', 'ice_sheet'];

describe('species library', () => {
  it('has at least 45 entries with unique ids and valid fields', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(45);
    const ids = new Set<string>();
    for (const s of SPECIES) {
      expect(ids.has(s.id), `duplicate id ${s.id}`).toBe(false);
      ids.add(s.id);
      expect(s.heightM[0]).toBeGreaterThan(0);
      expect(s.heightM[1]).toBeGreaterThanOrEqual(s.heightM[0]);
      expect(s.spread).toBeGreaterThan(0);
      expect(s.trunkColour).toMatch(HEX);
      expect(s.leafColour).toMatch(HEX);
      if (s.autumnColour) expect(s.autumnColour).toMatch(HEX);
      const biomes = Object.entries(s.biomes);
      expect(biomes.length, `${s.id} lists no biome`).toBeGreaterThan(0);
      for (const [b, w] of biomes) {
        expect(BIOME_INFO[b as Biome], `${s.id} lists unknown biome ${b}`).toBeDefined();
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(1);
      }
      if (s.elevationM) expect(s.elevationM[1]).toBeGreaterThan(s.elevationM[0]);
      if (s.maxSlope !== undefined) expect(s.maxSlope).toBeGreaterThanOrEqual(0);
      if (s.waterAffinity !== undefined) expect(s.waterAffinity).toBeLessThanOrEqual(1);
    }
  });

  it('covers every non-water, non-ice biome with at least three wild species', () => {
    for (const b of VEGETATED_BIOMES) expect(speciesForBiome(b).length, `biome ${b}`).toBeGreaterThanOrEqual(3);
    expect(VEGETATED_BIOMES).not.toContain('ocean');
    expect(VEGETATED_BIOMES).not.toContain('lake');
    expect(speciesForBiome('ocean')).toHaveLength(0);
    expect(speciesForBiome('lake')).toHaveLength(0);
    expect(speciesForBiome('ice_sheet').every((s) => s.kind === 'rock')).toBe(true);
  });

  it('fruit and flower rules use valid hemisphere-relative months', () => {
    for (const s of SPECIES) {
      for (const rule of [s.fruit, s.flowers]) {
        if (!rule) continue;
        expect(rule.months.length).toBeGreaterThan(0);
        expect(new Set(rule.months).size).toBe(rule.months.length);
        for (const m of rule.months) {
          expect(Number.isInteger(m)).toBe(true);
          expect(m).toBeGreaterThanOrEqual(1);
          expect(m).toBeLessThanOrEqual(12);
        }
        expect(rule.colour).toMatch(HEX);
      }
      if (s.fruit) {
        expect(s.fruit.sizeM).toBeGreaterThan(0);
        expect(s.fruit.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('never places fruit-bearing species in polar biomes', () => {
    for (const s of SPECIES) {
      if (!s.fruit) continue;
      for (const b of POLAR) expect(s.biomes[b], `${s.id} fruits in ${b}`).toBeUndefined();
    }
  });

  it('keeps tropical fruit and dense rainforest trees out of deserts and cold biomes', () => {
    const tropicalFruit = ['banana', 'mango', 'papaya', 'coconut_palm'];
    for (const id of tropicalFruit) {
      const s = speciesById(id)!;
      for (const b of ['hot_desert', 'cold_desert', 'boreal_forest', 'tundra', 'alpine', 'temperate_deciduous_forest'] as Biome[]) expect(s.biomes[b]).toBeUndefined();
    }
    expect(speciesById('kapok')!.biomes.hot_desert).toBeUndefined();
    expect(speciesById('date_palm')!.waterAffinity).toBe(1);
  });

  it('exposes cultivated crops per biome with rice restricted to wet/monsoon biomes', () => {
    for (const b of VEGETATED_BIOMES) for (const c of cropsForBiome(b)) expect(c.cultivated).toBe(true);
    expect(cropsForBiome('temperate_deciduous_forest').map((c) => c.id)).toContain('crop_wheat');
    expect(cropsForBiome('tropical_seasonal_forest').map((c) => c.id)).toContain('crop_rice');
    for (const b of ['temperate_deciduous_forest', 'temperate_grassland', 'mediterranean', 'steppe', 'boreal_forest', 'hot_desert'] as Biome[]) expect(cropsForBiome(b).map((c) => c.id)).not.toContain('crop_rice');
    expect(cropsForBiome('tundra')).toHaveLength(0);
    expect(cropsForBiome('alpine')).toHaveLength(0);
  });

  it('weighted picks are deterministic and honour weights', () => {
    const entries = weightedSpeciesForBiome('temperate_deciduous_forest', ['tree']);
    expect(entries.length).toBeGreaterThan(3);
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(pickWeighted(a, entries)!.id).toBe(pickWeighted(b, entries)!.id);
    const counts = new Map<string, number>();
    const rng = new Rng(7);
    for (let i = 0; i < 4000; i++) {
      const id = pickWeighted(rng, entries)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get('oak')!).toBeGreaterThan(counts.get('apple')!);
    expect(pickWeighted(rng, [])).toBeNull();
  });
});
