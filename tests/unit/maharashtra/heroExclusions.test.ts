import { describe, expect, it } from 'vitest';
import { applyHeroExclusions, HERO_EXCLUSION_ZONES } from '@/world/hero/heroExclusions';
import { TAJ_MAHAL_CENTRE } from '@/world/hero/tajMahalGeometry';
import type { NearFieldTile } from '@/world/procedural/types';

function tile(anchorLat: number, anchorLon: number): NearFieldTile {
  const placement = (x: number, y: number) => ({ species: 'oak', x, y, z: 0, scale: 1, rotation: 0, variant: 0, leafOn: 1, flowering: 0, fruiting: 0 });
  const building = (x: number, y: number, source: 'osm' | 'procedural') => ({ id: `${x},${y}`, footprint: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]] as [number, number][], heightM: 12, baseZ: 0, style: 'urban' as const, source, roof: 'flat' as const, colour: '#888' });
  return {
    key: 't', z: 14, x: 0, y: 0, anchorLat, anchorLon, anchorHeightM: 0, biome: 'savanna' as NearFieldTile['biome'], canopyColour: '#0f0', groundColour: '#880',
    placements: [placement(0, -100), placement(0, -900), placement(1000, 0)],
    buildings: [building(20, -200, 'procedural'), building(20, -200, 'osm'), building(600, 600, 'procedural')],
    fields: [{ id: 'f', polygon: [[0, -150], [30, -150], [30, -120]], crop: 'wheat', rowAngle: 0, colour: '#cc0' }],
    seed: 1, generatedMs: 1, counts: { tree: 3, shrub: 0, grass: 0, flower: 0, crop: 0, rock: 0, cactus: 0, palm: 0, reed: 0 },
  };
}

describe('hero exclusions', () => {
  it('drops procedural placements, buildings and fields inside the Taj Mahal footprint only', () => {
    const t = applyHeroExclusions(tile(TAJ_MAHAL_CENTRE.lat, TAJ_MAHAL_CENTRE.lon))!;
    expect(t.placements.map((p) => [p.x, p.y])).toEqual([[0, -900], [1000, 0]]); // 900 m south and 1 km east are outside
    expect(t.buildings.map((b) => b.source + b.id)).toEqual(['osm20,-200', 'procedural600,600']);
    expect(t.fields).toEqual([]);
  });
  it('leaves far-away tiles untouched and tolerates null', () => {
    const t = tile(19.0, 72.8);
    const before = JSON.stringify(t);
    expect(JSON.stringify(applyHeroExclusions(t))).toBe(before);
    expect(applyHeroExclusions(null)).toBeNull();
    expect(HERO_EXCLUSION_ZONES[0].id).toBe('taj-mahal');
  });
});
