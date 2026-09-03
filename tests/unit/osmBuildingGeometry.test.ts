import { describe, expect, it } from 'vitest';
import { buildBuildingMesh, triangulateSimple } from '@/world/osm/osmBuildingGeometry';

describe('building geometry', () => {
  it('triangulates convex and concave polygons', () => {
    expect(triangulateSimple([[0, 0], [1, 0], [1, 1], [0, 1]])).toHaveLength(6);
    const l: [number, number][] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    const tri = triangulateSimple(l);
    expect(tri.length).toBe((l.length - 2) * 3);
    for (const i of tri) expect(i).toBeLessThan(l.length);
  });
  it('builds walls and roofs with metre texture coordinates', () => {
    const mesh = buildBuildingMesh(48.86, 2.35, 35, [{ id: 'a', outer: [[2.35, 48.86], [2.3502, 48.86], [2.3502, 48.8602], [2.35, 48.8602], [2.35, 48.86]], holes: [], baseM: 35, heightM: 12, colour: [200, 190, 180], windows: 0.7, seed: 0.3 }]);
    expect(mesh).not.toBeNull();
    // 4 walls × 4 vertices + 4 roof vertices
    expect(mesh!.vertexCount).toBe(20);
    const st = (mesh!.geometry.attributes as unknown as { st: { values: Float32Array } }).st.values;
    // wall v ranges 0..height
    let maxV = 0;
    for (let i = 1; i < 32; i += 2) maxV = Math.max(maxV, st[i]);
    expect(maxV).toBeCloseTo(12, 5);
    expect(mesh!.geometry.boundingSphere!.radius).toBeGreaterThan(5);
  });
});
