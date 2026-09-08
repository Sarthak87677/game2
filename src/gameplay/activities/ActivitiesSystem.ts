/**
 * Peaceful activities: photography challenges (P), landmark collection, heritage/scenic cinematic tours, nature
 * observation (wildlife sightings), rail/road-trip checklists, boat checkpoint courses, basketball at the campus
 * court, museum info overlays and park cleanup. Progress persists in localStorage; the HUD shows a status line via
 * `gameplay.status` and the Play panel hosts an "Activities" tab. Registered as the `activities` gameplay system.
 */
import { BillboardCollection, BoundingSphere, BoxGeometry, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, CylinderGeometry, DistanceDisplayCondition, EllipsoidGeometry, GeometryInstance, HorizontalOrigin, Intersect, LabelCollection, LabelStyle, Math as CMath, Matrix4, NearFarScalar, PerInstanceColorAppearance, Primitive, ShadowMode, Transforms, VertexFormat, VerticalOrigin, type Billboard } from 'cesium';
import type { TerraEngine } from '@/engine/TerraEngine';
import type { GameplayContext, GameplaySystem, Interaction } from '@/gameplay/types';
import { distanceM } from '@/gameplay/GameplayHost';
import { useTerraStore } from '@/state/store';
import { BASKETBALL_COURT, BOAT_COURSES, CINEMATIC_TOURS, CLEANUP_PARKS, COLLECTIBLE_LANDMARKS, JOURNEY_CHECKLISTS, MUSEUMS, PHOTO_CHALLENGES, PROCEDURAL_NOTE, type BoatCourse, type CinematicTour, type CleanupPark, type PhotoChallenge } from '@/data/maharashtra/living';
import { nearbySightings, type Sighting } from '@/world/wildlife/sightings';
import { groundFallback } from '@/world/crowds/placeContext';
import { fnv1a, Rng } from '@/util/hash';
import { offsetToLonLat } from '@/util/geo';
import { loadProgress, saveProgress, clearProgress, totalPoints, type ActivityProgress } from './persistence';
import { bearingDeg, headingDiffDeg, reachedItems, scorePhoto, type PhotoResult } from './scoring';
import { ballAt, HOOP_HEIGHT_M, simulateThrow, type ThrowResult } from './basketball';

export interface PhotoOutcome extends PhotoResult { challenge: PhotoChallenge | null }
export interface CourseState { course: BoatCourse; next: number; startedAt: number }

interface Litter { id: string; lat: number; lon: number; bb: Billboard }
interface ParkBuild { park: CleanupPark; litter: Litter[] }

const STATUS_TTL = 6000;
const LITTER_ICONS = ['#8d6e63', '#42a5f5', '#ef5350', '#ffee58'];

export class ActivitiesSystem implements GameplaySystem {
  readonly id = 'activities';
  readonly label = 'Activities';
  private progress: ActivityProgress = loadProgress();
  private listeners = new Set<() => void>();
  private myStatus: string | null = null;
  private statusUntil = 0;
  private lastSlow = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private course: CourseState | null = null;
  private litterCollection: BillboardCollection;
  private parks = new Map<string, ParkBuild>();
  private litterCanvas: HTMLCanvasElement[] = [];
  private court: { primitive: Primitive; labels: LabelCollection } | null = null;
  private ball: Primitive | null = null;
  private ballFrame: Matrix4 | null = null;
  private ballStart = 0;
  private ballThrow: ThrowResult | null = null;
  private throwCount = 0;
  private lastPhoto: PhotoOutcome | null = null;
  private lastThrow: ThrowResult | null = null;
  private tourRunning: string | null = null;
  private spawnedSignal = false;
  private nearby: Sighting[] = [];
  private fallbackH = 0;

  constructor(private readonly engine: TerraEngine) {
    this.litterCollection = engine.viewer.scene.primitives.add(new BillboardCollection({ scene: engine.viewer.scene }));
    this.keyHandler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'KeyP' && !e.repeat) this.takePhoto();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // ---- observation API (UI + tests) ------------------------------------------------------------------------------

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(): void { saveProgress(this.progress); for (const l of this.listeners) l(); }
  getProgress(): ActivityProgress { return this.progress; }
  points(): number { return totalPoints(this.progress); }
  lastPhotoResult(): PhotoOutcome | null { return this.lastPhoto; }
  lastThrowResult(): ThrowResult | null { return this.lastThrow; }
  activeCourse(): CourseState | null { return this.course; }
  nearbySpecies(): Sighting[] { return this.nearby; }
  currentTour(): string | null { return this.tourRunning; }

  resetProgress(): void { clearProgress(); this.progress = loadProgress(); for (const p of this.parks.values()) this.rebuildLitter(p); this.changed(); }

  // ---- status line -------------------------------------------------------------------------------------------------

  private setStatus(text: string, ttl = STATUS_TTL): void {
    const store = useTerraStore.getState();
    const mode = this.engine.modes.getMode();
    // Journeys own the status line in passenger mode; only replace our own text there.
    if (mode === 'passenger' && store.gameplay.status && store.gameplay.status !== this.myStatus) return;
    this.myStatus = text;
    this.statusUntil = performance.now() + ttl;
    store.setGameplay({ status: text });
  }

  private clearStatusIfMine(now: number): void {
    if (this.myStatus && now > this.statusUntil) {
      const store = useTerraStore.getState();
      if (store.gameplay.status === this.myStatus) store.setGameplay({ status: null });
      this.myStatus = null;
    }
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------

  onSpawn(): void { this.spawnedSignal = true; }

  update(ctx: GameplayContext): void {
    const now = ctx.nowMs;
    this.animateBall(now);
    this.clearStatusIfMine(now);
    if (now - this.lastSlow < 700 && !this.spawnedSignal) return;
    this.lastSlow = now;
    this.spawnedSignal = false;
    const p = ctx.player;
    this.fallbackH = groundFallback(this.engine, p);
    this.nearby = nearbySightings(p.lat, p.lon, 120, now);
    if (p.embodied || p.mode === 'cinematic') {
      this.collectLandmarks(p.lat, p.lon);
      this.tickChecklists(p.lat, p.lon);
      this.tickCourse(p.lat, p.lon, now);
    }
    const agl = p.embodied ? 0 : (this.engine.altitudeAboveGround() ?? p.heightM);
    if (agl < 600) { this.syncParks(p.lat, p.lon); this.syncCourt(p.lat, p.lon); }
  }

  private collectLandmarks(lat: number, lon: number): void {
    for (const lm of COLLECTIBLE_LANDMARKS) {
      if (this.progress.landmarks[lm.id]) continue;
      if (Math.abs(lm.lat - lat) > 0.01 || Math.abs(lm.lon - lon) > 0.01) continue;
      if (distanceM(lat, lon, lm.lat, lm.lon) <= lm.radiusM) {
        this.progress.landmarks[lm.id] = new Date().toISOString();
        this.setStatus(`Landmark collected: ${lm.name} (+5) · ${Object.keys(this.progress.landmarks).length}/${COLLECTIBLE_LANDMARKS.length}`);
        this.changed();
      }
    }
  }

  private tickChecklists(lat: number, lon: number): void {
    for (const list of JOURNEY_CHECKLISTS) {
      const done = new Set(this.progress.checklists[list.id] ?? []);
      const hits = reachedItems(list.items, done, lat, lon, distanceM);
      if (!hits.length) continue;
      for (const id of hits) done.add(id);
      this.progress.checklists[list.id] = [...done];
      const label = list.items.find((i) => i.id === hits[hits.length - 1])?.label ?? hits[0];
      this.setStatus(`${list.name}: ✓ ${label} (${done.size}/${list.items.length})`);
      this.changed();
    }
  }

  // ---- photography -------------------------------------------------------------------------------------------------

  /** Scores the nearest photo challenge for the current position and view; called by the P key and tests. */
  takePhoto(): PhotoOutcome {
    const p = this.engine.gameplay.player();
    const cam = this.engine.viewer.camera;
    let best: PhotoChallenge | null = null, bestD = Infinity;
    for (const c of PHOTO_CHALLENGES) {
      if (Math.abs(c.lat - p.lat) > 0.03 || Math.abs(c.lon - p.lon) > 0.03) continue;
      const d = distanceM(p.lat, p.lon, c.lat, c.lon);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) { const r = { ok: false, score: 0, reason: 'No photo challenge nearby', golden: false, challenge: null }; this.lastPhoto = r; this.setStatus('📷 No photo challenge nearby — see the Activities tab for subjects'); return r; }
    const headingDeg = CMath.toDegrees(p.embodied && p.mode !== 'passenger' ? this.engine.modes.getHeading() : cam.heading);
    const bearing = bearingDeg(p.lat, p.lon, best.lat, best.lon);
    const diff = headingDiffDeg(headingDeg, bearing);
    let inFrustum: boolean | null = null;
    try {
      const ground = this.engine.groundHeightAt(best.lat, best.lon) ?? p.heightM;
      const sphere = new BoundingSphere(Cartesian3.fromDegrees(best.lon, best.lat, ground + 10), Math.max(25, bestD * 0.15));
      inFrustum = cam.frustum.computeCullingVolume(cam.position, cam.direction, cam.up).computeVisibility(sphere) !== Intersect.OUTSIDE;
    } catch { inFrustum = null; }
    const sun = this.engine.environment.sunElevationDeg(p.lat, p.lon);
    const res = scorePhoto({ distM: bestD, standRadiusM: best.standRadiusM, headingDiffDeg: diff, toleranceDeg: best.toleranceDeg, points: best.points, goldenHour: !!best.goldenHour, sunElevationDeg: sun, inFrustum });
    const out: PhotoOutcome = { ...res, challenge: best };
    this.lastPhoto = out;
    if (res.ok) {
      const prev = this.progress.photos[best.id];
      if (!prev || prev.score < res.score) { this.progress.photos[best.id] = { score: res.score, at: new Date().toISOString() }; this.changed(); }
      this.setStatus(`📷 ${best.title}: ${res.reason} +${res.score}${prev ? (prev.score < res.score ? ' (new best)' : ' (best ' + prev.score + ')') : ''}`);
    } else this.setStatus(`📷 ${best.title}: ${res.reason}`);
    return out;
  }

  // ---- tours ---------------------------------------------------------------------------------------------------------

  async startTour(id: string): Promise<boolean> {
    const tour = CINEMATIC_TOURS.find((t) => t.id === id);
    if (!tour) return false;
    const frames = await Promise.all(tour.keyframes.map(async (k) => ({ ...k, heightM: (await this.engine.terrainHeight(k.lat, k.lon)) + k.heightM })));
    if (!this.progress.tours.includes(id)) { this.progress.tours.push(id); this.changed(); }
    this.tourRunning = id;
    this.setStatus(`🎬 ${tour.name} — ${tour.kind} tour (Esc to stop). ${tour.dataNote}`, 12000);
    void this.engine.startTour(frames).finally(() => { if (this.tourRunning === id) this.tourRunning = null; });
    return true;
  }

  stopTour(): void { this.engine.modes.stopTour(); this.engine.modes.setMode('orbit'); this.tourRunning = null; }
  tours(): CinematicTour[] { return CINEMATIC_TOURS; }

  // ---- nature observation --------------------------------------------------------------------------------------------

  logObservation(species: string): boolean {
    const s = this.nearby.find((x) => x.species === species);
    if (!s) return false;
    const rec = this.progress.observations[species] ?? { label: s.label, count: 0, at: '' };
    rec.count++; rec.at = new Date().toISOString(); rec.label = s.label;
    this.progress.observations[species] = rec;
    this.setStatus(`🔭 Logged ${s.label} (${s.count} nearby) · ${Object.keys(this.progress.observations).length} species in the logbook`);
    this.changed();
    return true;
  }

  // ---- boat checkpoint course ---------------------------------------------------------------------------------------

  startCourse(id: string): boolean {
    const course = BOAT_COURSES.find((c) => c.id === id);
    if (!course) return false;
    this.course = { course, next: 0, startedAt: performance.now() };
    this.setStatus(`⛵ ${course.name}: head for “${course.checkpoints[0].label}” (${course.dataNote})`, 10000);
    this.changed();
    return true;
  }

  stopCourse(): void { this.course = null; this.changed(); }

  private tickCourse(lat: number, lon: number, now: number): void {
    const c = this.course;
    if (!c) return;
    const cp = c.course.checkpoints[c.next];
    if (distanceM(lat, lon, cp.lat, cp.lon) > cp.radiusM) return;
    c.next++;
    if (c.next >= c.course.checkpoints.length) {
      const ms = now - c.startedAt;
      const rec = this.progress.courses[c.course.id] ?? { completed: 0, bestMs: null };
      rec.completed++; rec.bestMs = rec.bestMs === null ? ms : Math.min(rec.bestMs, ms);
      this.progress.courses[c.course.id] = rec;
      this.setStatus(`⛵ ${c.course.name} complete in ${(ms / 1000).toFixed(0)} s (+10)`, 10000);
      this.course = null;
    } else this.setStatus(`⛵ Checkpoint ${c.next}/${c.course.checkpoints.length} · next: ${c.course.checkpoints[c.next].label}`, 8000);
    this.changed();
  }

  // ---- cleanup -----------------------------------------------------------------------------------------------------

  private litterSprite(i: number): HTMLCanvasElement {
    if (!this.litterCanvas[i]) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d')!;
      g.fillStyle = LITTER_ICONS[i % LITTER_ICONS.length];
      if (i % 4 === 0) { g.fillRect(3, 6, 10, 8); g.fillRect(5, 3, 6, 4); } // bag
      else if (i % 4 === 1) { g.fillRect(6, 2, 4, 12); g.fillRect(5, 5, 6, 8); } // bottle
      else if (i % 4 === 2) { g.beginPath(); g.moveTo(4, 4); g.lineTo(12, 3); g.lineTo(13, 11); g.lineTo(3, 12); g.closePath(); g.fill(); } // wrapper
      else { g.fillRect(5, 4, 6, 10); g.fillRect(4, 3, 8, 2); } // cup
      this.litterCanvas[i] = c;
    }
    return this.litterCanvas[i];
  }

  private syncParks(lat: number, lon: number): void {
    for (const park of CLEANUP_PARKS) {
      const d = distanceM(lat, lon, park.lat, park.lon);
      if (d < 400 && !this.parks.has(park.id)) { const build = { park, litter: [] as Litter[] }; this.parks.set(park.id, build); this.rebuildLitter(build); }
      else if (d > 900 && this.parks.has(park.id)) this.removePark(park.id);
    }
  }

  private rebuildLitter(build: ParkBuild): void {
    for (const l of build.litter) this.litterCollection.remove(l.bb);
    build.litter = [];
    const collected = new Set(this.progress.cleanup[build.park.id] ?? []);
    const rng = new Rng(fnv1a(`litter:${build.park.id}`));
    for (let i = 0; i < build.park.litterCount; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * build.park.radiusM;
      const ll = offsetToLonLat(build.park.lat, build.park.lon, Math.cos(a) * r, Math.sin(a) * r);
      const id = `${build.park.id}:${i}`;
      if (collected.has(id)) continue;
      const h = this.engine.groundHeightAt(ll.lat, ll.lon) ?? this.fallbackH;
      const bb = this.litterCollection.add({ position: Cartesian3.fromDegrees(ll.lon, ll.lat, h + 0.05), verticalOrigin: VerticalOrigin.BOTTOM, sizeInMeters: true, width: 0.3, height: 0.3, translucencyByDistance: new NearFarScalar(80, 1, 160, 0) });
      bb.setImage(`litter:${i % 4}`, this.litterSprite(i % 4));
      build.litter.push({ id, lat: ll.lat, lon: ll.lon, bb });
    }
  }

  private removePark(id: string): void {
    const b = this.parks.get(id);
    if (!b) return;
    for (const l of b.litter) this.litterCollection.remove(l.bb);
    this.parks.delete(id);
  }

  private pickUp(build: ParkBuild, litter: Litter): void {
    this.litterCollection.remove(litter.bb);
    build.litter = build.litter.filter((l) => l !== litter);
    const list = this.progress.cleanup[build.park.id] ?? [];
    list.push(litter.id);
    this.progress.cleanup[build.park.id] = list;
    const left = build.park.litterCount - list.length;
    this.setStatus(left === 0 ? `♻️ ${build.park.name} is clean! (+4)` : `♻️ Litter picked up (+4) · ${left} left in ${build.park.name}`);
    this.changed();
  }

  /** Cleanup progress per park (for the tab). */
  cleanupState(): { park: CleanupPark; collected: number }[] {
    return CLEANUP_PARKS.map((park) => ({ park, collected: (this.progress.cleanup[park.id] ?? []).length }));
  }

  // ---- basketball ----------------------------------------------------------------------------------------------------

  private hoopLatLon(): { lat: number; lon: number } {
    const c = BASKETBALL_COURT;
    const h = (c.headingDeg * Math.PI) / 180;
    return offsetToLonLat(c.lat, c.lon, Math.sin(h) * c.hoopOffsetM, Math.cos(h) * c.hoopOffsetM);
  }

  private syncCourt(lat: number, lon: number): void {
    const c = BASKETBALL_COURT;
    const d = distanceM(lat, lon, c.lat, c.lon);
    if (d < 500 && !this.court) this.buildCourt();
    else if (d > 1000 && this.court) this.removeCourt();
  }

  private buildCourt(): void {
    const c = BASKETBALL_COURT;
    const scene = this.engine.viewer.scene;
    const ground = scene.globe.getHeight(Cartographic.fromDegrees(c.lon, c.lat)) ?? this.fallbackH;
    const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(c.lon, c.lat, ground));
    const h = (c.headingDeg * Math.PI) / 180;
    const rot = new Matrix4(Math.cos(-h), -Math.sin(-h), 0, 0, Math.sin(-h), Math.cos(-h), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); // court +y axis toward the hoop
    const inst = (geom: BoxGeometry | CylinderGeometry, x: number, y: number, z: number, css: string) => new GeometryInstance({ geometry: geom, modelMatrix: Matrix4.multiply(rot, Matrix4.fromTranslation(new Cartesian3(x, y, z)), new Matrix4()), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(css)) } });
    const instances = [
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(15, 28, 0.08), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, 0, 0.04, '#2f6f4f'),
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(4.9, 5.8, 0.02), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, c.hoopOffsetM - 2.9 + 1.2, 0.09, '#b7473a'),
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(0.1, 15, 0.02), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, 0, 0.09, '#f5f5f5'),
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(15, 0.1, 0.02), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, 0, 0.09, '#f5f5f5'),
      inst(new CylinderGeometry({ length: 3.6, topRadius: 0.07, bottomRadius: 0.07, vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, c.hoopOffsetM + 1.2, 1.8, '#546e7a'),
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(1.8, 0.05, 1.05), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, c.hoopOffsetM + 0.45, HOOP_HEIGHT_M + 0.45, '#eceff1'),
      inst(new CylinderGeometry({ length: 0.03, topRadius: 0.23, bottomRadius: 0.23, vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, c.hoopOffsetM, HOOP_HEIGHT_M, '#f57c00'),
      inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(0.05, 0.4, 0.05), vertexFormat: VertexFormat.POSITION_AND_NORMAL }), 0, c.hoopOffsetM + 0.25, HOOP_HEIGHT_M, '#f57c00'),
    ];
    const primitive = scene.primitives.add(new Primitive({ geometryInstances: instances, modelMatrix: frame, appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, shadows: ShadowMode.ENABLED, allowPicking: false }));
    const labels = scene.primitives.add(new LabelCollection({ scene }));
    labels.add({ position: Matrix4.multiplyByPoint(frame, new Cartesian3(0, 0, 3), new Cartesian3()), text: `${c.name}\n${PROCEDURAL_NOTE}`, font: '13px system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK.withAlpha(0.8), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.BOTTOM, distanceDisplayCondition: new DistanceDisplayCondition(0, 220), scale: 0.85 });
    this.court = { primitive, labels };
  }

  private removeCourt(): void {
    if (!this.court) return;
    this.engine.viewer.scene.primitives.remove(this.court.primitive);
    this.engine.viewer.scene.primitives.remove(this.court.labels);
    this.court = null;
  }

  /** Teleports the player to the free-throw spot facing the hoop (the court is ~60 m from the campus spawn). */
  goToCourt(): void {
    const c = BASKETBALL_COURT;
    const h = (c.headingDeg * Math.PI) / 180;
    const spot = offsetToLonLat(c.lat, c.lon, Math.sin(h) * (c.hoopOffsetM - 4.6), Math.cos(h) * (c.hoopOffsetM - 4.6));
    this.engine.gameplay.teleport(spot.lat, spot.lon, c.headingDeg);
    this.setStatus('🏀 At the free-throw line — face the hoop and press E to shoot');
  }

  /** Throws from the player's position toward the hoop; the ball animates along the arc and the result is scored. */
  throwBasketball(): ThrowResult {
    const p = this.engine.gameplay.player();
    const hoop = this.hoopLatLon();
    const d = distanceM(p.lat, p.lon, hoop.lat, hoop.lon);
    const headingDeg = CMath.toDegrees(this.engine.modes.getHeading());
    const aimErr = headingDiffDeg(headingDeg, bearingDeg(p.lat, p.lon, hoop.lat, hoop.lon)) * (Math.sin(CMath.toRadians(headingDeg - bearingDeg(p.lat, p.lon, hoop.lat, hoop.lon))) < 0 ? -1 : 1);
    const result = simulateThrow({ distM: d, aimErrorDeg: aimErr, seed: ++this.throwCount });
    this.lastThrow = result;
    const b = this.progress.basketball;
    b.attempts++;
    if (result.made) { b.made++; b.streak++; b.best = Math.max(b.best, b.streak); } else b.streak = 0;
    this.setStatus(`🏀 ${result.reason} · ${b.made}/${b.attempts} made${b.streak > 1 ? ` · streak ${b.streak}` : ''}`);
    this.changed();
    this.launchBall(p.lat, p.lon, p.heightM, headingDeg, result);
    return result;
  }

  private launchBall(lat: number, lon: number, groundH: number, headingDeg: number, t: ThrowResult): void {
    const scene = this.engine.viewer.scene;
    if (!this.ball) {
      this.ball = scene.primitives.add(new Primitive({ geometryInstances: new GeometryInstance({ geometry: new EllipsoidGeometry({ radii: new Cartesian3(0.12, 0.12, 0.12), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#e65100')) } }), appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false, allowPicking: false }));
    }
    const ground = this.engine.groundHeightAt(lat, lon) ?? groundH ?? this.fallbackH;
    const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(lon, lat, ground));
    const h = CMath.toRadians(headingDeg);
    const rot = new Matrix4(Math.cos(-h), -Math.sin(-h), 0, 0, Math.sin(-h), Math.cos(-h), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    this.ballFrame = Matrix4.multiply(enu, rot, new Matrix4());
    this.ballThrow = t;
    this.ballStart = performance.now();
    this.ball!.show = true;
  }

  private animateBall(now: number): void {
    if (!this.ball || !this.ballFrame || !this.ballThrow) return;
    const t = (now - this.ballStart) / 1000;
    const end = this.ballThrow.flightS + (this.ballThrow.made ? 0.5 : 0.9);
    if (t > end) { this.ball.show = false; this.ballThrow = null; return; }
    const p = ballAt(this.ballThrow.speed, Math.min(t, this.ballThrow.flightS), this.ballThrow.lateralM, this.ballThrow.flightS);
    let z = p.z, y = p.x;
    if (t > this.ballThrow.flightS) { const dt = t - this.ballThrow.flightS; z = this.ballThrow.made ? Math.max(0.12, HOOP_HEIGHT_M - dt * 4) : Math.max(0.12, p.z - dt * 5); y = p.x + (this.ballThrow.made ? 0 : dt * 1.5); }
    this.ball.modelMatrix = Matrix4.multiply(this.ballFrame, Matrix4.fromTranslation(new Cartesian3(p.y, y, z)), this.ball.modelMatrix);
  }

  // ---- interactions -------------------------------------------------------------------------------------------------

  interactions(ctx: GameplayContext): Interaction[] {
    const out: Interaction[] = [];
    const p = ctx.player;
    for (const lm of COLLECTIBLE_LANDMARKS) {
      if (Math.abs(lm.lat - p.lat) > 0.01 || Math.abs(lm.lon - p.lon) > 0.01) continue;
      out.push({ id: `about:${lm.id}`, label: `Read about ${lm.name}`, lat: lm.lat, lon: lm.lon, radiusM: lm.radiusM, priority: -1, run: () => this.showAbout(lm.id) });
    }
    for (const m of MUSEUMS) {
      if (Math.abs(m.lat - p.lat) > 0.01 || Math.abs(m.lon - p.lon) > 0.01) continue;
      out.push({ id: `museum:${m.id}`, label: `Browse exhibits — ${m.name}`, lat: m.lat, lon: m.lon, radiusM: m.radiusM, priority: 1, run: () => this.showMuseum(m.id) });
    }
    const c = BASKETBALL_COURT;
    if (Math.abs(c.lat - p.lat) < 0.01 && Math.abs(c.lon - p.lon) < 0.01) {
      const dCourt = distanceM(p.lat, p.lon, c.lat, c.lon);
      if (dCourt <= 16) out.push({ id: 'basketball', label: 'Shoot a basket (face the hoop)', lat: c.lat, lon: c.lon, radiusM: 16, priority: 2, modes: ['walk'], run: () => { this.throwBasketball(); } });
      else out.push({ id: 'basketball-court', label: `Walk over to the basketball court (${Math.round(dCourt)} m)`, lat: c.lat, lon: c.lon, radiusM: 160, priority: 0, modes: ['walk'], run: () => this.goToCourt() });
    }
    for (const build of this.parks.values()) for (const l of build.litter) out.push({ id: `litter:${l.id}`, label: `Pick up litter — ${build.park.name}`, lat: l.lat, lon: l.lon, radiusM: 2.6, priority: 3, modes: ['walk'], run: () => this.pickUp(build, l) });
    for (const s of this.nearby) {
      const logged = this.progress.observations[s.species];
      if (logged && Date.now() - Date.parse(logged.at) < 120_000) continue;
      out.push({ id: `observe:${s.species}`, label: `Note ${s.label.toLowerCase()} in the nature logbook`, lat: p.lat, lon: p.lon, radiusM: 1e6, priority: -2, run: () => { this.logObservation(s.species); } });
    }
    return out;
  }

  showAbout(id: string): void {
    const lm = COLLECTIBLE_LANDMARKS.find((l) => l.id === id);
    if (!lm) return;
    this.engine.gameplay.showOverlay({ title: lm.name, lines: [lm.about, this.progress.landmarks[id] ? `Collected ${new Date(this.progress.landmarks[id]).toLocaleDateString()}.` : 'Walk up to it to collect the landmark.'], actions: [{ id: 'close', label: 'Close' }], note: `${lm.dataNote} Text is a generic summary, not a guidebook.` }, () => this.engine.gameplay.closeOverlay());
  }

  showMuseum(id: string, exhibitId?: string): void {
    const m = MUSEUMS.find((x) => x.id === id);
    if (!m) return;
    const seen = new Set(this.progress.museums[id] ?? []);
    if (exhibitId) {
      const ex = m.exhibits.find((e) => e.id === exhibitId);
      if (!ex) return;
      if (!seen.has(ex.id)) { seen.add(ex.id); this.progress.museums[id] = [...seen]; this.changed(); }
      this.engine.gameplay.showOverlay({ title: ex.title, lines: [ex.text], actions: [{ id: 'back', label: 'Back to exhibits' }], note: m.dataNote }, (a) => { if (a === 'back') this.showMuseum(id); else this.engine.gameplay.closeOverlay(); });
      return;
    }
    this.engine.gameplay.showOverlay({ title: m.name, lines: [`${seen.size}/${m.exhibits.length} exhibits read.`], actions: m.exhibits.map((e) => ({ id: e.id, label: `${seen.has(e.id) ? '✓ ' : ''}${e.title}` })), note: m.dataNote }, (a) => this.showMuseum(id, a));
  }

  stats(): Record<string, string | number> {
    const pr = this.progress;
    let litter = 0;
    for (const b of this.parks.values()) litter += b.litter.length;
    return { points: totalPoints(pr), photos: `${Object.keys(pr.photos).length}/${PHOTO_CHALLENGES.length}`, landmarks: `${Object.keys(pr.landmarks).length}/${COLLECTIBLE_LANDMARKS.length}`, species: Object.keys(pr.observations).length, nearbySpecies: this.nearby.map((s) => s.label).join(', ') || '—', litterNearby: litter, court: this.court ? 'built' : 'not in range', course: this.course ? `${this.course.course.name} ${this.course.next}/${this.course.course.checkpoints.length}` : 'none', basketball: `${pr.basketball.made}/${pr.basketball.attempts}`, tour: this.tourRunning ?? 'none' };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    for (const id of [...this.parks.keys()]) this.removePark(id);
    this.engine.viewer.scene.primitives.remove(this.litterCollection);
    this.removeCourt();
    if (this.ball) this.engine.viewer.scene.primitives.remove(this.ball);
  }
}
