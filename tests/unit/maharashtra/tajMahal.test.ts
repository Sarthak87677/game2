import { describe, expect, it } from 'vitest';
import { buildTajMahalMeshes, TAJ, TAJ_MAHAL_CENTRE, TAJ_SPOTS, tajHeightAt } from '@/world/hero/tajMahalGeometry';
import { vertexCount } from '@/world/render';

describe('Taj Mahal hero geometry', () => {
  it('builds finite, bounded meshes for every part', () => {
    const m = buildTajMahalMeshes();
    let total = 0;
    for (const [name, mesh] of Object.entries(m)) {
      const n = vertexCount(mesh);
      expect(n, name).toBeGreaterThan(50);
      expect(n, name).toBeLessThan(120_000);
      total += n;
      for (let i = 0; i < mesh.positions.length; i++) expect(Number.isFinite(mesh.positions[i]), name).toBe(true);
      for (let i = 0; i < mesh.indices.length; i++) expect(mesh.indices[i], name).toBeLessThan(n);
      expect(mesh.indices.length % 3, name).toBe(0);
    }
    expect(total).toBeLessThan(200_000);
    // The dome finial is the highest point; the gate sits ~365 m south.
    let maxZ = -Infinity, minY = Infinity;
    for (let i = 0; i < m.mausoleum.positions.length; i += 3) maxZ = Math.max(maxZ, m.mausoleum.positions[i + 2]);
    for (let i = 0; i < m.gateAndMosques.positions.length; i += 3) minY = Math.min(minY, m.gateAndMosques.positions[i + 1]);
    expect(maxZ).toBeCloseTo(TAJ.plinth + TAJ.domeTop, 0);
    expect(minY).toBeLessThan(TAJ.gateY - 10);
  });

  it('is deterministic', () => {
    const a = buildTajMahalMeshes().trees, b = buildTajMahalMeshes().trees;
    expect(Array.from(a.positions.slice(0, 90))).toEqual(Array.from(b.positions.slice(0, 90)));
  });

  it('exposes a walkable route from the gate to the central chamber', () => {
    expect(tajHeightAt(0, TAJ_SPOTS.gatePassageSouth.y)).toBe(TAJ.garden); // forecourt
    expect(tajHeightAt(0, TAJ.gateY)).toBe(TAJ.garden); // through the gate passage
    expect(tajHeightAt(15, TAJ.gateY)).toBe(TAJ.garden + TAJ.gateHeight); // gate roof blocks
    expect(tajHeightAt(0, TAJ.centreY - 40)).toBe(TAJ.garden - 0.5); // pool
    expect(tajHeightAt(6, TAJ.centreY - 40)).toBe(TAJ.garden + TAJ.pathRise); // path beside the pool
    expect(tajHeightAt(40, -100)).toBe(TAJ.garden); // lawn
    expect(tajHeightAt(0, TAJ.centreY)).toBe(TAJ.garden + 1.0); // central tank
    const ramp = tajHeightAt(0, TAJ.terraceSouth - 2)!;
    expect(ramp).toBeGreaterThan(TAJ.garden + TAJ.pathRise);
    expect(ramp).toBeLessThan(TAJ.terrace);
    expect(tajHeightAt(30, -50)).toBe(TAJ.terrace); // terrace beside the stair
    const stair = tajHeightAt(0, -TAJ.plinthHalf - 4)!;
    expect(stair).toBeGreaterThan(TAJ.terrace);
    expect(stair).toBeLessThan(TAJ.plinth);
    expect(tajHeightAt(0, TAJ_SPOTS.plinthSouthEdge.y)).toBe(TAJ.plinth);
    expect(tajHeightAt(0, TAJ_SPOTS.southDoor.y)).toBe(TAJ.plinth); // in front of the south door
    expect(tajHeightAt(0, -20)).toBe(TAJ.plinth); // passage
    expect(tajHeightAt(0, TAJ_SPOTS.chamber.y)).toBe(TAJ.plinth); // chamber floor
    expect(tajHeightAt(20, 15)).toBe(TAJ.plinth + TAJ.bodyHeight); // solid body
    expect(tajHeightAt(TAJ.minaretOffset, TAJ.minaretOffset)).toBe(TAJ.plinth + TAJ.minaretHeight);
    expect(tajHeightAt(TAJ.mosqueX, 0)).toBe(TAJ.terrace + TAJ.mosqueHeight);
    expect(tajHeightAt(149, -200)).toBe(TAJ.garden + TAJ.wallHeight);
    expect(tajHeightAt(0, 200)).toBeNull();
    expect(tajHeightAt(400, 0)).toBeNull();
  });

  it('places the complex at the real Agra position', () => {
    expect(TAJ_MAHAL_CENTRE.lat).toBeCloseTo(27.1751, 3);
    expect(TAJ_MAHAL_CENTRE.lon).toBeCloseTo(78.0421, 3);
  });
});
