import { describe, expect, it } from 'vitest';
import { buildInteriorPlan, INTERIOR_CATEGORIES, stairSurfaceZ, inscribedRect, seedForFootprint, type InteriorRequest, type InteriorPlan, type Rect } from '@/world/interiors/grammar';
import { crossesWall, filterMove, nearestSurface, surfaceCandidates, wallPieces, wallSolidAt, floorIndexForZ } from '@/world/interiors/collision';
import { lonLatToPlan, planToLonLat } from '@/world/interiors/frame';

/** Rectangular footprint (lon/lat) ~30 × 14 m near Kolhapur, rotated 20° so the frame logic is exercised. */
function footprint(lat = 16.7335, lon = 74.4015, w = 30, d = 14, rotDeg = 20): [number, number][] {
  const mLat = 111_132, mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const r = (rotDeg * Math.PI) / 180;
  const pts: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  return pts.map(([x, y]) => { const e = x * Math.cos(r) - y * Math.sin(r), n = x * Math.sin(r) + y * Math.cos(r); return [lon + e / mLon, lat + n / mLat] as [number, number]; });
}

const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function checkInvariants(plan: InteriorPlan): void {
  expect(plan.floors.length).toBeGreaterThan(0);
  const storeys = plan.floors.filter((f) => f.kind === 'floor');
  for (const f of plan.floors) {
    const spaces = new Set<string>(['outside', 'elevator']);
    for (const r of f.rooms) spaces.add(r.id);
    for (const c of f.corridors) spaces.add(c.id);
    // Every door links two known spaces or is decorative.
    for (const d of f.doors) {
      if (d.decorative) { expect(d.links).toBeNull(); continue; }
      expect(d.links, `${d.id} has links`).not.toBeNull();
      for (const s of d.links!) expect(spaces.has(s), `${d.id} → ${s} exists on floor ${f.index}`).toBe(true);
      expect(d.links![0]).not.toBe(d.links![1]);
    }
    // Rooms and corridors never overlap each other, the stair cores or the elevator shaft.
    const blocks: { id: string; rect: Rect }[] = [...f.rooms.map((r) => ({ id: r.id, rect: r.rect })), ...f.corridors.map((c) => ({ id: c.id, rect: c.rect })), ...f.stairs.map((s) => ({ id: s.id, rect: s.core })), ...f.elevators.map((e) => ({ id: e.id, rect: e.shaft }))];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      expect(overlapArea(blocks[i].rect, blocks[j].rect), `${blocks[i].id} overlaps ${blocks[j].id} on floor ${f.index}`).toBeLessThan(0.01);
    }
    for (const r of f.rooms) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.rect.x0).toBeGreaterThanOrEqual(plan.usable.x0 - 1e-6);
      expect(r.rect.x1).toBeLessThanOrEqual(plan.usable.x1 + 1e-6);
      expect(r.rect.y0).toBeGreaterThanOrEqual(plan.usable.y0 - 1e-6);
      expect(r.rect.y1).toBeLessThanOrEqual(plan.usable.y1 + 1e-6);
    }
    // Every room with a door has it on its own boundary.
    for (const d of f.doors) {
      if (!d.links) continue;
      const room = f.rooms.find((r) => r.id === d.links![0]) ?? f.rooms.find((r) => r.id === d.links![1]);
      if (!room) continue;
      const onEdge = Math.abs(d.y - room.rect.y0) < 0.05 || Math.abs(d.y - room.rect.y1) < 0.05 || Math.abs(d.x - room.rect.x0) < 0.05 || Math.abs(d.x - room.rect.x1) < 0.05;
      expect(onEdge, `${d.id} lies on ${room.id}`).toBe(true);
    }
    if (f.kind === 'floor') expect(f.rooms.length + f.corridors.length).toBeGreaterThan(0);
    // Furniture stays inside its room and never overlaps other furniture in the same room.
    for (const fu of f.furniture) {
      const room = f.rooms.find((r) => r.id === fu.roomId)!;
      expect(overlapArea(fu.rect, room.rect)).toBeCloseTo((fu.rect.x1 - fu.rect.x0) * (fu.rect.y1 - fu.rect.y0), 3);
      for (const other of f.furniture) if (other !== fu && other.roomId === fu.roomId) expect(overlapArea(fu.rect, other.rect)).toBeLessThan(1e-6);
    }
  }
  // Stairs connect consecutive floors: for each storey below the top, a stair rises exactly one floor and its ramp
  // reaches the floor above at the corridor mouth.
  for (let i = 0; i < plan.floors.length - 1; i++) {
    const f = plan.floors[i];
    expect(f.stairs.length, `floor ${i} has stairs`).toBeGreaterThan(0);
    for (const st of f.stairs) {
      expect(st.fromFloor).toBe(i);
      expect(st.toFloor).toBe(i + 1);
      const yA = (st.laneA.y0 + st.laneA.y1) / 2, yB = (st.laneB.y0 + st.laneB.y1) / 2;
      expect(stairSurfaceZ(st, f.z, plan.floorHeightM, st.nearX, yA)!).toBeCloseTo(f.z, 6);
      expect(stairSurfaceZ(st, f.z, plan.floorHeightM, st.farX, yA)!).toBeCloseTo(f.z + plan.floorHeightM / 2, 6);
      expect(stairSurfaceZ(st, f.z, plan.floorHeightM, st.nearX, yB)!).toBeCloseTo(plan.floors[i + 1].z, 6);
    }
  }
  // Ground floor has at least one exterior door and matching exit.
  expect(plan.floors[0].doors.some((d) => d.exterior)).toBe(true);
  expect(plan.floors[0].exits.length).toBeGreaterThan(0);
  expect(storeys.length).toBeGreaterThan(0);
}

describe('interior grammar', () => {
  const base: InteriorRequest = { footprint: footprint(), heightM: 10.5, floors: 3, category: 'school' };

  it('is deterministic for the same footprint and differs for another building', () => {
    const a = buildInteriorPlan(base);
    const b = buildInteriorPlan({ ...base, footprint: footprint().map((p) => [p[0], p[1]]) });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const c = buildInteriorPlan({ ...base, footprint: footprint(16.74, 74.41) });
    expect(c.seed).not.toBe(a.seed);
    expect(seedForFootprint(base.footprint, 'lonlat', 'school')).toBe(a.seed);
  });

  it('produces a valid plan for every category, a 1-floor shed and a 20-floor tower', () => {
    for (const category of INTERIOR_CATEGORIES) {
      const plan = buildInteriorPlan({ footprint: footprint(), heightM: 14, floors: 4, category });
      checkInvariants(plan);
      expect(plan.note).toMatch(/fictional/);
      expect(plan.category).toBe(category);
    }
    checkInvariants(buildInteriorPlan({ footprint: footprint(16.7, 74.4, 9, 6, 0), heightM: 3.2, floors: 1, category: 'residential' }));
    const tower = buildInteriorPlan({ footprint: footprint(18.9, 72.8, 40, 24, 45), heightM: 70, floors: 20, category: 'office' });
    checkInvariants(tower);
    expect(tower.floors.filter((f) => f.kind === 'floor').length).toBe(20);
    expect(tower.floors[0].elevators.length).toBe(1);
    expect(tower.floors.some((f) => f.kind === 'terrace')).toBe(true);
  });

  it('aligns the building frame to the footprint rotation and maps back to lon/lat', () => {
    const plan = buildInteriorPlan(base);
    expect(plan.usable.x1 - plan.usable.x0).toBeGreaterThan(plan.usable.y1 - plan.usable.y0);
    expect(plan.usable.x1 - plan.usable.x0).toBeGreaterThan(28);
    expect(plan.usable.y1 - plan.usable.y0).toBeGreaterThan(13);
    const frame = { origin: plan.origin!, rotationRad: plan.rotationRad };
    const p = planToLonLat(frame, 5, -3);
    const back = lonLatToPlan(frame, p.lat, p.lon);
    expect(back.x).toBeCloseTo(5, 3);
    expect(back.y).toBeCloseTo(-3, 3);
  });

  it('places hero programmes in order and halls as single spaces', () => {
    const plan = buildInteriorPlan({
      footprint: footprint(16.7335, 74.4015, 44, 16, 0), heightM: 11, category: 'school', name: 'Academic block', seed: 7,
      layout: { elevator: true, entrance: 'south', floors: [
        { name: 'Ground floor', rooms: [{ label: 'Reception', kind: 'reception', widthM: 6, side: 'south' }, { label: 'Classroom 1A', kind: 'classroom', widthM: 8, side: 'north' }, { label: 'Classroom 1B', kind: 'classroom', widthM: 8, side: 'north', decorativeDoor: true }] },
        { name: 'First floor', rooms: [{ label: 'Science lab', kind: 'science-lab', widthM: 10 }, { label: 'Computer lab', kind: 'computer-lab', widthM: 9 }] },
        { name: 'Second floor', hall: { label: 'Library', kind: 'library' } },
      ] },
    });
    checkInvariants(plan);
    expect(plan.hero).toBe(true);
    const labels0 = plan.floors[0].rooms.map((r) => r.label);
    expect(labels0).toContain('Reception');
    expect(labels0.indexOf('Classroom 1A')).toBeLessThan(labels0.indexOf('Classroom 1B'));
    expect(plan.floors[0].doors.some((d) => d.decorative)).toBe(true);
    expect(plan.floors[2].rooms[0].label).toBe('Library');
    expect(plan.floors[2].corridors.length).toBe(0);
    expect(plan.floors[0].elevators.length).toBe(1);
    expect(plan.floors[plan.floors.length - 1].kind).toBe('terrace');
    expect(plan.floors[plan.floors.length - 1].walls.every((w) => w.railing)).toBe(true);
  });

  it('accepts local-metre footprints and irregular polygons', () => {
    const L: [number, number][] = [[0, 0], [30, 0], [30, 10], [12, 10], [12, 20], [0, 20]];
    const plan = buildInteriorPlan({ footprint: L, footprintUnits: 'metres', heightM: 7, floors: 2, category: 'hotel' });
    checkInvariants(plan);
    const r = inscribedRect(L);
    expect(r.x1 - r.x0).toBeGreaterThan(5);
    expect(plan.origin).toBeNull();
  });
});

describe('interior collision', () => {
  const plan = buildInteriorPlan({ footprint: footprint(16.7335, 74.4015, 36, 16, 0), heightM: 10.2, floors: 3, category: 'office', seed: 42 });
  const floor0 = plan.floors[0];

  it('walls block movement except through door openings', () => {
    const room = floor0.rooms.find((r) => floor0.doors.some((d) => d.links?.[0] === r.id && d.links[1] === floor0.corridors[0].id))!;
    const door = floor0.doors.find((d) => d.links?.[0] === room.id && !d.exterior)!;
    const corr = floor0.corridors[0].rect;
    const insideY = door.y === room.rect.y0 ? room.rect.y0 + 0.8 : room.rect.y1 - 0.8;
    const corrY = door.y === room.rect.y0 ? corr.y1 - 0.5 : corr.y0 + 0.5;
    // Through the door: allowed.
    expect(crossesWall(floor0, door.x, corrY, door.x, insideY)).toBe(false);
    expect(filterMove(plan, 0, { x: door.x, y: corrY }, { x: door.x, y: insideY })).toEqual({ x: door.x, y: insideY });
    // Through the wall 1.5 m to the side of the door (or the other side when near the room edge): blocked.
    const wx = door.x + 1.5 <= room.rect.x1 - 0.5 ? door.x + 1.5 : door.x - 1.5;
    expect(crossesWall(floor0, wx, corrY, wx, insideY)).toBe(true);
    const slid = filterMove(plan, 0, { x: wx, y: corrY }, { x: wx + 0.3, y: insideY });
    expect(slid === null || Math.abs(slid.y - corrY) < 1e-9).toBe(true);
  });

  it('decorative doors and windows do not open the wall', () => {
    const plan2 = buildInteriorPlan({ footprint: footprint(16.7335, 74.4015, 36, 16, 0), heightM: 10.2, floors: 3, category: 'hotel', seed: 5 });
    const f = plan2.floors[0];
    const deco = f.doors.find((d) => d.decorative);
    if (deco) expect(crossesWall(f, deco.x, deco.y - 0.5, deco.x, deco.y + 0.5)).toBe(true);
    const win = f.windows.find((w) => w.axis === 'x')!;
    expect(crossesWall(f, win.x, win.y - 0.5, win.x, win.y + 0.5)).toBe(true);
    const boxes = wallPieces(f, plan2.floorHeightM);
    expect(wallSolidAt(boxes, win.x, win.y, 1.5)).toBe(false); // glass opening
    expect(wallSolidAt(boxes, win.x, win.y, 0.4)).toBe(true); // sill
    expect(wallSolidAt(boxes, win.x, win.y, plan2.floorHeightM - 0.1)).toBe(true); // head
  });

  it('door openings are cut from the rendered walls with a lintel above', () => {
    const door = floor0.doors.find((d) => !d.decorative && !d.exterior && d.axis === 'x')!;
    const boxes = wallPieces(floor0, plan.floorHeightM);
    expect(wallSolidAt(boxes, door.x, door.y, 1.0)).toBe(false);
    expect(wallSolidAt(boxes, door.x, door.y, 2.5)).toBe(true);
    expect(wallSolidAt(boxes, door.x + door.widthM / 2 + 0.3, door.y, 1.0)).toBe(true);
  });

  it('nearest-surface sampling follows a stair from floor 0 to floor 1', () => {
    const st = floor0.stairs[0];
    const yA = (st.laneA.y0 + st.laneA.y1) / 2, yB = (st.laneB.y0 + st.laneB.y1) / 2;
    const dir = Math.sign(st.farX - st.nearX);
    let z = 0;
    let x = st.nearX;
    // Walk up lane A to the landing.
    while (Math.abs(x - st.farX) > 0.05) { x += dir * 0.05; const g = nearestSurface(plan, x, yA, z)!; expect(Math.abs(g - z)).toBeLessThan(0.1); z = g; }
    expect(z).toBeCloseTo(plan.floorHeightM / 2, 1);
    // Cross the landing into lane B and walk back to the corridor mouth.
    const lx = (st.landing.x0 + st.landing.x1) / 2;
    z = nearestSurface(plan, lx, yB, z)!;
    expect(z).toBeCloseTo(plan.floorHeightM / 2, 6);
    x = st.farX;
    while (Math.abs(x - st.nearX) > 0.05) { x -= dir * 0.05; const g = nearestSurface(plan, x, yB, z)!; expect(Math.abs(g - z)).toBeLessThan(0.1); z = g; }
    expect(z).toBeCloseTo(plan.floors[1].z, 1);
    expect(floorIndexForZ(plan, z)).toBe(1);
    // In the corridor at floor-1 height we stay on floor 1, not the ground slab.
    const corr = plan.floors[1].corridors[0].rect;
    expect(nearestSurface(plan, (corr.x0 + corr.x1) / 2, (corr.y0 + corr.y1) / 2, z)).toBeCloseTo(plan.floors[1].z, 6);
    expect(surfaceCandidates(plan, plan.usable.x1 + 5, 0).length).toBe(0);
    expect(nearestSurface(plan, plan.usable.x1 + 5, 0, 0)).toBeNull();
  });
});
