import { describe, expect, it } from 'vitest';
import { LANDMARK_MODELS } from '@/data/bookmarks/landmarkModels';
import { MAHARASHTRA_LANDMARK_MODELS } from '@/data/bookmarks/maharashtraLandmarks';
import { WORLD_HIGHLIGHTS } from '@/data/bookmarks/highlights';
import { insideMaharashtra } from '@/data/maharashtra/defineDestination';
import { buildLandmark, LANDMARK_BUILDERS, type LandmarkArchetype } from '@/world/landmarks/landmarkShapes';

const NEW_ARCHETYPES: LandmarkArchetype[] = ['stationHall', 'cableStayedBridge', 'fortWall', 'rockCutTemple', 'caveArc', 'shikhara', 'stadiumRing', 'causeway'];

describe('Maharashtra landmark stand-ins', () => {
  it('are all inside Maharashtra, labelled procedural and linked to highlight bookmarks', () => {
    const ids = new Set(WORLD_HIGHLIGHTS.map((b) => b.id));
    expect(MAHARASHTRA_LANDMARK_MODELS.length).toBeGreaterThanOrEqual(18);
    for (const m of MAHARASHTRA_LANDMARK_MODELS) {
      expect(insideMaharashtra(m.lat, m.lon), m.name).toBe(true);
      expect(m.note, m.name).toMatch(/procedural interpretation at the real position/i);
      expect(m.bookmarkId && ids.has(m.bookmarkId), `${m.name} → ${m.bookmarkId}`).toBe(true);
      expect(LANDMARK_BUILDERS[m.archetype], m.name).toBeTypeOf('function');
    }
    const by = (n: string) => MAHARASHTRA_LANDMARK_MODELS.find((m) => m.name.startsWith(n))!;
    expect(by('Gateway of India').archetype).toBe('archMonument');
    expect(by('Gateway of India').heightM).toBe(26);
    expect(by('Chhatrapati Shivaji Maharaj Terminus').archetype).toBe('stationHall');
    expect(by('Bandra').archetype).toBe('cableStayedBridge');
    expect(by('Bandra').footprintM).toBe(5600);
    expect(by('Bandra').headingDeg).toBe(20);
    for (const n of ['Shaniwar Wada', 'Raigad', 'Sinhagad', 'Pratapgad', 'Panhala']) expect(by(n).archetype, n).toBe('fortWall');
    expect(by('Ellora').archetype).toBe('rockCutTemple');
    expect(by('Ajanta').archetype).toBe('caveArc');
    expect(by('Mahalaxmi').archetype).toBe('shikhara');
    expect(by('Wankhede').archetype).toBe('stadiumRing');
    expect(by('Deekshabhoomi').archetype).toBe('stupaTemple');
    expect(by('Bibi Ka Maqbara').archetype).toBe('domedBuilding');
    expect(by('Haji Ali Dargah').archetype).toBe('domedBuilding');
    expect(by('Haji Ali causeway').archetype).toBe('causeway');
    expect(by('Elephanta').archetype).toBe('caveArc');
  });

  it('are part of LANDMARK_MODELS and the Taj Mahal stand-in defers to the hero system', () => {
    const names = new Set(LANDMARK_MODELS.map((m) => m.name));
    for (const m of MAHARASHTRA_LANDMARK_MODELS) expect(names.has(m.name), m.name).toBe(true);
    const taj = LANDMARK_MODELS.find((m) => m.name === 'Taj Mahal');
    expect(taj?.hero).toBe('taj-mahal');
    expect(LANDMARK_MODELS.filter((m) => m.hero).length).toBe(1);
  });

  it('new archetypes build finite, bounded geometry at realistic sizes', () => {
    const sizes: Record<string, [number, number]> = { stationHall: [45, 170], cableStayedBridge: [126, 5600], fortWall: [9, 190], rockCutTemple: [33, 90], caveArc: [40, 520], shikhara: [25, 30], stadiumRing: [35, 190], causeway: [1.5, 420] };
    for (const a of NEW_ARCHETYPES) {
      const [h, f] = sizes[a];
      const m = buildLandmark(a, h, f, '#a0a0a0', 11);
      const n = m.positions.length / 3;
      expect(n, a).toBeGreaterThan(20);
      expect(n, a).toBeLessThan(40_000);
      let maxZ = -Infinity, maxR = 0;
      for (let i = 0; i < m.positions.length; i += 3) {
        expect(Number.isFinite(m.positions[i]) && Number.isFinite(m.positions[i + 1]) && Number.isFinite(m.positions[i + 2]), a).toBe(true);
        maxZ = Math.max(maxZ, m.positions[i + 2]);
        maxR = Math.max(maxR, Math.hypot(m.positions[i], m.positions[i + 1]));
      }
      expect(maxZ, a).toBeGreaterThanOrEqual(h * 0.95);
      expect(maxZ, a).toBeLessThanOrEqual(h * 1.45);
      expect(maxR, a).toBeLessThanOrEqual(f * 0.8 + 10);
      for (let i = 0; i < m.indices.length; i++) expect(m.indices[i]).toBeLessThan(n);
    }
  });
});
