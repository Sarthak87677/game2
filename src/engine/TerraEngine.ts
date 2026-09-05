import { Cartographic, ImageryLayer, Math as CMath, type Viewer } from 'cesium';
import { createViewer } from './createViewer';
import { applyQuality, detectQualityPreset, QUALITY_PRESETS, type QualityPresetId } from './quality';
import { EnvironmentController, simulateWeather, weatherFromPreset, type WeatherCondition, type WeatherState } from './environment';
import { installGroundMaterial, type GroundMaterialHandle } from './groundMaterial';
import { OceanSurface } from './oceanSurface';
import { StreamingMonitor } from './streaming';
import { cameraState, descendTo, flyTo, groundHeight, resolveTargetHeight, type CameraTarget } from './camera';
import { ModeController, type ModeId, type TourKeyframe } from '@/modes/ModeController';
import { AdapterRegistry } from '@/data/adapters/registry';
import { readAdapterEnv } from '@/data/adapters/types';
import { NaturalEarth } from '@/data/naturalEarth';
import { sharedTileCache } from '@/data/cache/tileCache';
import { buildWorldMap } from '@/world/worldMapBuilder';
import type { WorldMap } from '@/world/worldMap';
import { BIOME_INFO, type Biome } from '@/world/climate/biome';
import { seasonFor } from '@/world/climate/season';
import { OfflineGazetteer } from '@/data/geocoding/offlineIndex';
import { parseCoordinates } from '@/data/geocoding/parseCoordinates';
import type { GeocodeResult } from '@/data/geocoding/types';
import { useTerraStore, type LocationReadout } from '@/state/store';
import { hash2 } from '@/util/hash';
import { TERRARIUM_DEFAULT_URL } from '@/data/adapters/terrain';
import { WORLD_HIGHLIGHTS } from '@/data/bookmarks/highlights';
import { OverpassAdapter } from '@/data/adapters/features/overpass';
import { OsmLayer } from '@/world/osm/OsmLayer';
import { NominatimAdapter } from '@/data/adapters/geocoding/nominatim';
import { OpenMeteoAdapter } from '@/data/adapters/weather/openMeteo';
import { AmbientAudio } from './audio';
import { CloudSystem } from './clouds';
import { TrafficLayer } from '@/world/traffic/TrafficLayer';
import { dayOfYear } from '@/world/climate/season';
import { HeightFieldSource } from '@/world/nearField/heightField';
import { buildGenerationContext } from '@/world/nearField/contextBuilder';
import { ProcgenClient } from '@/world/nearField/procgenClient';
import type { NearFieldTile } from '@/world/procedural/types';
import { NearFieldWorld, type NearFieldStats } from '@/world/render';
import { speciesById } from '@/world/procedural/species';
import { LandmarkLayer } from '@/world/landmarks/LandmarkLayer';
import type { GeocodingAdapter } from '@/data/geocoding/types';

declare global {
  interface Window { __terra?: { ready: boolean; engine?: TerraEngine; state: () => unknown; goTo: (lat: number, lon: number, h: number, headingDeg?: number, pitchDeg?: number) => Promise<boolean>; setMode: (m: ModeId) => void } }
}

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

/** Orchestrates viewer, data adapters, environment, modes and store updates. */
export class TerraEngine {
  readonly viewer: Viewer;
  readonly registry: AdapterRegistry;
  readonly environment: EnvironmentController;
  readonly modes: ModeController;
  readonly streaming: StreamingMonitor;
  readonly ground: GroundMaterialHandle | null;
  readonly ocean: OceanSurface;
  readonly osm: OsmLayer | null;
  readonly overpass: OverpassAdapter | null;
  readonly geocoders: GeocodingAdapter[] = [];
  readonly weatherAdapter: OpenMeteoAdapter | null;
  readonly audio = new AmbientAudio();
  readonly clouds: CloudSystem;
  readonly traffic: TrafficLayer | null;
  readonly heightFields = new HeightFieldSource({ cache: sharedTileCache() });
  readonly procgen = new ProcgenClient();
  readonly nearField: NearFieldWorld | null;
  readonly landmarks: LandmarkLayer;
  naturalEarth: NaturalEarth | null = null;
  worldMap: WorldMap | null = null;
  gazetteer: OfflineGazetteer | null = null;
  private lastReverse = { lat: NaN, lon: NaN, t: 0, name: null as string | null };
  private liveWeatherWanted = false;
  private quality: QualityPresetId;
  private imageryLayer: ImageryLayer | null = null;
  private readoutTimer: number | null = null;
  private lastReadout = { lat: NaN, lon: NaN, t: 0 };
  private destroyed = false;
  osmStatus: { loaded: number; loading: number; failed: number; online: boolean | null; lastError: string | null } = { loaded: 0, loading: 0, failed: 0, online: null, lastError: null };
  nearFieldStats: NearFieldStats | null = null;

  private constructor(container: HTMLElement) {
    const store = useTerraStore.getState();
    const env = readAdapterEnv();
    this.viewer = createViewer({ container, ionToken: env.cesiumIonToken });
    this.streaming = new StreamingMonitor(this.viewer);
    this.registry = new AdapterRegistry(env, {
      naturalEarth: () => this.naturalEarth,
      worldMap: () => this.worldMap,
      terrariumOptions: { cache: sharedTileCache(), onTile: (ev) => this.streaming.onTerrainTile(ev) },
    });
    this.environment = new EnvironmentController(this.viewer);
    this.modes = new ModeController(this.viewer, (code) => this.onCommand(code));
    this.modes.onChange = (s) => useTerraStore.setState({ mode: s });
    let ground: GroundMaterialHandle | null = null;
    try { ground = installGroundMaterial(this.viewer); } catch (e) {
      store.log('warn', `Ground material unavailable: ${String(e)}`);
      // Fall back to Cesium's built-in day/night shading at every distance.
      this.viewer.scene.globe.enableLighting = true;
      this.viewer.scene.globe.lightingFadeOutDistance = 1;
      this.viewer.scene.globe.lightingFadeInDistance = 2;
    }
    this.ground = ground;
    this.ocean = new OceanSurface(this.viewer);
    this.environment.onWeatherApplied = (u) => {
      this.ground?.setUniform('wetness', u.wetness);
      this.ground?.setUniform('snowCover', u.snowCover);
      this.ground?.setUniform('cloudCover', u.cloudCover);
      this.nearField?.setWind(u.windSpeedMs, (u.windDirDeg * Math.PI) / 180);
    };
    this.quality = store.quality;
    void sharedTileCache().setBudget(store.settings.cacheMb * 1024 * 1024);
    const disabled = env.disabledAdapters ?? new Set<string>();
    if (!disabled.has('osm') && env.overpassUrl) {
      this.overpass = new OverpassAdapter({ url: env.overpassUrl, cache: sharedTileCache() });
      this.osm = new OsmLayer(this.viewer, {
        adapter: this.overpass,
        onStatus: (st) => {
          const flags = useTerraStore.getState().dataFlags;
          if (flags.osmOnline !== st.online) useTerraStore.setState({ dataFlags: { ...flags, osmOnline: st.online } });
          this.osmStatus = st;
        },
      });
      this.modes.extraHeightSampler = (lat, lon) => this.osm?.heightAt(lat, lon) ?? this.nearField?.heightAt(lat, lon) ?? null;
    } else {
      this.overpass = null;
      this.osm = null;
    }
    this.traffic = this.osm ? new TrafficLayer(this.viewer, this.osm, this.environment) : null;
    this.nearField = this.procgen.available
      ? new NearFieldWorld(this.viewer, {
          generate: (z, x, y) => this.generateNearFieldTile(z, x, y),
          quality: () => QUALITY_PRESETS[this.quality],
          species: (id) => speciesById(id),
          onStats: (s) => { this.nearFieldStats = s; },
        })
      : null;
    this.clouds = new CloudSystem(this.viewer, () => this.worldMap, () => dayOfYear(this.environment.getDate()));
    this.landmarks = new LandmarkLayer(this.viewer, { quality: () => QUALITY_PRESETS[this.quality] });
    if (!disabled.has('nominatim') && env.nominatimUrl) this.geocoders.push(new NominatimAdapter({ url: env.nominatimUrl }));
    this.weatherAdapter = env.enableLiveWeather && !disabled.has('open-meteo') ? new OpenMeteoAdapter() : null;
    useTerraStore.setState({ sources: this.registry.listSources() });
    this.viewer.scene.renderError.addEventListener((_s: unknown, err: Error) => {
      useTerraStore.getState().log('error', `Render error: ${err?.message ?? err}`);
      useTerraStore.setState({ boot: { ...useTerraStore.getState().boot, phase: 'error', error: `Rendering failed: ${err?.message ?? err}` } });
    });
  }

  /** Creates the engine, shows the globe immediately and streams data in the background. */
  static async create(container: HTMLElement): Promise<TerraEngine> {
    const store = useTerraStore.getState();
    store.patch({ boot: { phase: 'viewer', progress: 0.1, message: 'Creating WebGL2 globe…', error: null, details: [] } });
    const engine = new TerraEngine(container);
    const saved = (() => { try { return localStorage.getItem('terra-infinite.quality') as QualityPresetId | null; } catch { return null; } })();
    // ?terraQuality=low|medium|high|ultra overrides the preset (used by tests and software-rendered CI).
    const forced = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('terraQuality') : null) as QualityPresetId | null;
    engine.setQuality(forced && forced in QUALITY_PRESETS ? forced : saved && saved in QUALITY_PRESETS ? saved : detectQualityPreset());
    store.patch({ boot: { phase: 'terrain', progress: 0.25, message: 'Connecting terrain and imagery…', error: null, details: [] } });
    await engine.setTerrain(engine.registry.defaultTerrainId());
    await engine.setImagery(engine.registry.defaultImageryId());
    engine.environment.setWeather(weatherFromPreset('clear'));
    engine.startReadouts();
    window.__terra = {
      ready: false,
      engine,
      state: () => ({ boot: useTerraStore.getState().boot, camera: cameraState(engine.viewer), streaming: useTerraStore.getState().streaming, location: useTerraStore.getState().location, dataFlags: useTerraStore.getState().dataFlags, diagnostics: useTerraStore.getState().diagnostics }),
      goTo: (lat, lon, h, headingDeg, pitchDeg) => engine.goTo({ lat, lon, heightM: h, headingDeg, pitchDeg }),
      setMode: (m) => engine.modes.setMode(m),
    };
    void engine.loadDataInBackground();
    return engine;
  }

  private async loadDataInBackground(): Promise<void> {
    const store = useTerraStore.getState();
    const setBoot = (progress: number, message: string, phase: 'data' | 'ready' = 'data') => useTerraStore.setState((s) => ({ boot: { ...s.boot, phase, progress, message } }));
    try {
      setBoot(0.35, 'Loading Natural Earth coastlines, rivers and countries…');
      this.naturalEarth = await NaturalEarth.load(fetchJson, '/data/ne', (l, t) => setBoot(0.35 + 0.2 * (l / t), `Loading reference vectors (${l}/${t})…`));
      useTerraStore.setState((s) => ({ dataFlags: { ...s.dataFlags, naturalEarth: true } }));
      this.refreshImagery();
    } catch (e) {
      store.log('error', `Natural Earth failed: ${String(e)}`);
    }
    try {
      setBoot(0.58, 'Loading place index…');
      this.gazetteer = await OfflineGazetteer.load(fetchJson, '/data/ne');
      useTerraStore.setState((s) => ({ dataFlags: { ...s.dataFlags, gazetteer: true } }));
      const places = (await fetchJson('/data/ne/places_50m.json')) as { rows: [string, string, string, number, number, number, number, number][] };
      this.environment.setNightLights(places.rows.map((r) => ({ lat: r[3], lon: r[4], pop: r[5] })));
    } catch (e) {
      store.log('error', `Gazetteer failed: ${String(e)}`);
    }
    if (this.naturalEarth) {
      try {
        setBoot(0.65, 'Building climate & biome atlas…');
        const terrainAvailable = this.registry.terrain.get('terrarium')?.isAvailable().available ?? false;
        this.worldMap = await buildWorldMap(this.naturalEarth, terrainAvailable ? TERRARIUM_DEFAULT_URL : null, (m) => setBoot(0.7, `Climate atlas: ${m}…`));
        useTerraStore.setState((s) => ({ dataFlags: { ...s.dataFlags, worldMap: true, worldMapElevation: this.worldMap?.data.hasElevation ?? false } }));
        this.ground?.setWorldMap(this.worldMap);
        this.refreshImagery();
        store.log('info', `Climate atlas built in ${this.worldMap.data.buildMs.toFixed(0)} ms (elevation ${this.worldMap.data.hasElevation ? 'measured' : 'unavailable → sea level assumed'})`);
        this.applySimulatedWeatherForCamera();
      } catch (e) {
        store.log('error', `World map failed: ${String(e)}`);
      }
    }
    setBoot(1, 'Ready', 'ready');
    if (window.__terra) window.__terra.ready = true;
  }

  private refreshImagery(): void {
    if (useTerraStore.getState().imageryId !== 'procedural') return;
    void this.setImagery('procedural');
  }

  async setTerrain(id: string): Promise<void> {
    const adapter = this.registry.terrain.get(id);
    if (!adapter) throw new Error(`Unknown terrain adapter ${id}`);
    const avail = adapter.isAvailable();
    if (!avail.available) { useTerraStore.getState().log('warn', `Terrain ${id} unavailable: ${avail.reason}`); return; }
    try {
      const provider = await adapter.createProvider();
      this.viewer.terrainProvider = provider;
      useTerraStore.setState({ terrainId: id });
    } catch (e) {
      useTerraStore.getState().log('error', `Terrain ${id} failed: ${String(e)}`);
      if (id !== 'ellipsoid') await this.setTerrain('ellipsoid');
    }
  }

  async setImagery(id: string): Promise<void> {
    const adapter = this.registry.imagery.get(id);
    if (!adapter) throw new Error(`Unknown imagery adapter ${id}`);
    const avail = adapter.isAvailable();
    if (!avail.available) { useTerraStore.getState().log('warn', `Imagery ${id} unavailable: ${avail.reason}`); return; }
    try {
      const provider = await adapter.createProvider();
      const layers = this.viewer.imageryLayers;
      const layer = new ImageryLayer(provider);
      layers.add(layer, 0);
      if (this.clouds) this.clouds.refresh();
      if (this.imageryLayer) layers.remove(this.imageryLayer, true);
      this.imageryLayer = layer;
      useTerraStore.setState({ imageryId: id });
      if (id === 'procedural') this.streaming.imageryTilesRendered = () => (provider as { tilesRendered?: number }).tilesRendered ?? 0;
      // Real imagery keeps its detail visible under the procedural overlay; the inferred atlas is fully replaced.
      this.ground?.setUniform('detailStrength', id === 'procedural' ? 1 : 0.55);
    } catch (e) {
      useTerraStore.getState().log('error', `Imagery ${id} failed: ${String(e)}`);
      if (id !== 'procedural') await this.setImagery('procedural');
    }
  }

  setQuality(id: QualityPresetId): void {
    this.quality = id;
    const q = QUALITY_PRESETS[id];
    applyQuality(this.viewer, q);
    this.environment.particleBudget = q.precipitationParticles;
    this.clouds.nearCloudsEnabled = q.clouds;
    this.ground?.setUniform('fadeNear', q.nearFieldRadiusM * 4);
    this.ground?.setUniform('fadeFar', q.nearFieldRadiusM * 40);
    useTerraStore.setState({ quality: id });
    try { localStorage.setItem('terra-infinite.quality', id); } catch { /* ignore */ }
  }

  getQuality(): QualityPresetId { return this.quality; }

  /** Flies to a target. `heightM` is metres above ground for targets below 50 km (above the ellipsoid otherwise). */
  async goTo(target: CameraTarget, opts: { descend?: boolean; absolute?: boolean } = {}): Promise<boolean> {
    if (this.modes.getMode() !== 'orbit') this.modes.setMode('orbit');
    const resolved = opts.absolute ? target : await resolveTargetHeight(this.viewer, target, (lat, lon) => this.worldMap?.sample(lat, lon).elevationM ?? null);
    const ok = opts.descend === false ? await flyTo(this.viewer, resolved) : await descendTo(this.viewer, resolved);
    if (this.liveWeatherWanted) void this.useLiveWeather(true);
    else this.applySimulatedWeatherForCamera();
    return ok;
  }

  /** Searches coordinates, bookmarks and the offline gazetteer (network geocoders are optional add-ons). */
  async search(query: string, limit = 12): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (!q) return [];
    const coords = parseCoordinates(q);
    const results: GeocodeResult[] = [];
    if (coords) results.push({ id: `coords:${coords.lat},${coords.lon}`, name: `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`, displayName: 'Go to coordinates', kind: 'physical', lat: coords.lat, lon: coords.lon, heightM: 3000, source: 'terra-bookmarks', score: 100 });
    if (this.gazetteer) results.push(...this.gazetteer.search(q, limit));
    else results.push(...WORLD_HIGHLIGHTS.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit).map((b) => ({ id: b.id, name: b.name, displayName: `${b.name} · ${b.country ?? b.continent}`, kind: 'bookmark' as const, lat: b.lat, lon: b.lon, heightM: b.camera.heightM, source: 'terra-bookmarks' as const, score: 50 })));
    // Street-level and obscure places come from the optional network geocoder; used only when the offline index is thin.
    if (q.length >= 3 && results.length < 4 && this.geocoders.length > 0 && navigator.onLine !== false) {
      const seen = new Set(results.map((r) => `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`));
      for (const g of this.geocoders) {
        const extra = await g.search(q, limit);
        for (const r of extra) { const k = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`; if (!seen.has(k)) { seen.add(k); results.push(r); } }
      }
    }
    return results.slice(0, limit);
  }

  /** Reverse-geocodes the camera position through the network geocoder (rate-limited, only near the ground). */
  private async maybeReverseGeocode(lat: number, lon: number, aglM: number | null): Promise<string | null> {
    const g = this.geocoders.find((x) => x.reverse);
    if (!g?.reverse || aglM === null || aglM > 4000 || navigator.onLine === false) return null;
    const now = performance.now();
    const moved = Number.isNaN(this.lastReverse.lat) || Math.abs(lat - this.lastReverse.lat) > 0.003 || Math.abs(lon - this.lastReverse.lon) > 0.003;
    if (!moved) return this.lastReverse.name;
    if (now - this.lastReverse.t < 3000) return this.lastReverse.name;
    this.lastReverse = { lat, lon, t: now, name: this.lastReverse.name };
    const name = await g.reverse(lat, lon);
    if (name) { this.lastReverse.name = name; useTerraStore.setState((s) => (s.location ? { location: { ...s.location, place: name, provenance: { ...s.location.provenance, place: 'measured (OpenStreetMap)' } } } : {})); }
    return name;
  }

  /** Switches weather to live observations (Open-Meteo) for the camera position; falls back to simulation when unreachable. */
  async useLiveWeather(enabled: boolean): Promise<boolean> {
    this.liveWeatherWanted = enabled;
    if (!enabled || !this.weatherAdapter) { this.applySimulatedWeatherForCamera(); return false; }
    const cam = cameraState(this.viewer);
    const w = await this.weatherAdapter.current(cam.lat, cam.lon);
    useTerraStore.setState((s) => ({ dataFlags: { ...s.dataFlags, weatherOnline: this.weatherAdapter?.online ?? null } }));
    if (!w) { useTerraStore.getState().log('warn', `Live weather unavailable: ${this.weatherAdapter.lastError ?? 'no data'} — using simulation`); this.applySimulatedWeatherForCamera(); return false; }
    this.setWeather(w);
    return true;
  }

  /** Historical daily weather for the simulated date (Open-Meteo archive), labelled "historical". */
  async useHistoricalWeather(): Promise<boolean> {
    if (!this.weatherAdapter) return false;
    const cam = cameraState(this.viewer);
    const w = await this.weatherAdapter.historical(cam.lat, cam.lon, this.environment.getDate());
    useTerraStore.setState((s) => ({ dataFlags: { ...s.dataFlags, weatherOnline: this.weatherAdapter?.online ?? null } }));
    if (!w) { useTerraStore.getState().log('warn', `Historical weather unavailable: ${this.weatherAdapter.lastError ?? 'no data'}`); return false; }
    this.setWeather(w);
    return true;
  }

  private startReadouts(): void {
    this.readoutTimer = window.setInterval(() => this.updateReadouts(), 250);
  }

  private updateReadouts(): void {
    if (this.destroyed) return;
    const cam = cameraState(this.viewer);
    const streaming = this.streaming.snapshot();
    const patch: Partial<ReturnType<typeof useTerraStore.getState>> = { camera: cam, streaming, time: { ...useTerraStore.getState().time, iso: this.environment.getDate().toISOString() } };
    const now = performance.now();
    const moved = Math.abs(cam.lat - this.lastReadout.lat) > 0.002 || Math.abs(cam.lon - this.lastReadout.lon) > 0.002;
    if (moved || now - this.lastReadout.t > 2000) {
      this.lastReadout = { lat: cam.lat, lon: cam.lon, t: now };
      patch.location = this.describe(cam.lat, cam.lon);
      const sample = this.worldMap?.sample(cam.lat, cam.lon, this.naturalEarth?.isLand(cam.lat, cam.lon) ?? false);
      this.audio.update({ biome: sample?.biome ?? 'ocean', weather: useTerraStore.getState().weather, altitudeAglM: cam.altitudeAglM ?? cam.heightM, sunElevationDeg: patch.location.sunElevationDeg ?? 0, nearWater: (sample?.distCoastKm ?? 999) < 2 || sample?.surface !== 'land', urban: this.osm ? Math.min(1, this.osmStatus.loaded / 12) : 0 });
      if (this.lastReverse.name && !moved) patch.location.place = this.lastReverse.name;
      void this.maybeReverseGeocode(cam.lat, cam.lon, cam.altitudeAglM);
    }
    useTerraStore.setState(patch);
  }

  /** Human-readable description of a point, with provenance. */
  describe(lat: number, lon: number): LocationReadout {
    const date = this.environment.getDate();
    const surfaceInfo = this.naturalEarth?.surfaceAt(lat, lon) ?? null;
    const sample = this.worldMap?.sample(lat, lon, surfaceInfo ? surfaceInfo.kind !== 'ocean' : false) ?? null;
    const place = this.gazetteer?.describeLocation(lat, lon) ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    const season = seasonFor(date, lat);
    const vectorKind = surfaceInfo?.kind;
    // Natural Earth's glaciated areas include valley glaciers around inhabited alpine valleys; only polar ice is an ice sheet.
    const biome: Biome = vectorKind === 'ocean' ? 'ocean' : vectorKind === 'lake' ? 'lake' : vectorKind === 'glacier' ? (Math.abs(lat) >= 60 ? 'ice_sheet' : 'alpine') : sample?.biome ?? 'ocean';
    const month = date.getUTCMonth();
    const sunEl = this.environment.sunElevationDeg(lat, lon);
    const localHours = ((date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24;
    const lh = Math.floor(localHours);
    const lm = Math.floor((localHours - lh) * 60);
    return {
      place,
      country: surfaceInfo?.country?.name ?? null,
      region: surfaceInfo?.region?.name ?? surfaceInfo?.marine?.name ?? null,
      surface: surfaceInfo?.kind ?? sample?.surface ?? 'unknown',
      biome,
      biomeLabel: BIOME_INFO[biome]?.label ?? biome,
      koppen: sample?.koppen ?? '—',
      annualTempC: sample?.annualTempC ?? null,
      annualPrecipMm: sample?.annualPrecipMm ?? null,
      season: season.season,
      monthTempC: sample ? Math.round(sample.monthlyTempC[month]) : null,
      sunElevationDeg: sunEl,
      localTime: `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')} local (solar)`,
      provenance: {
        terrain: useTerraStore.getState().terrainId === 'ellipsoid' ? 'none' : 'measured',
        biome: 'inferred',
        place: this.gazetteer ? 'measured (Natural Earth)' : 'unavailable',
        buildings: 'procedural',
      },
    };
  }

  /** Derives plausible weather from the climate atlas for the camera position and date (labelled simulated). */
  applySimulatedWeatherForCamera(): void {
    const cam = cameraState(this.viewer);
    const sample = this.worldMap?.sample(cam.lat, cam.lon, this.naturalEarth?.isLand(cam.lat, cam.lon) ?? false);
    if (!sample) return;
    const date = this.environment.getDate();
    const r = hash2(Math.round(cam.lat * 2), Math.round(cam.lon * 2), Math.floor(date.getTime() / 3_600_000 / 6));
    const w = simulateWeather(sample.monthlyTempC, sample.monthlyPrecipMm, date, r);
    this.setWeather(w);
  }

  setWeather(w: WeatherState): void {
    this.environment.setWeather(w);
    this.clouds.setCloudCover(w.cloudCover);
    useTerraStore.setState({ weather: w });
  }

  setWeatherPreset(c: WeatherCondition): void {
    const cam = useTerraStore.getState().camera;
    const sample = cam ? this.worldMap?.sample(cam.lat, cam.lon) : null;
    const t = sample ? sample.monthlyTempC[this.environment.getDate().getUTCMonth()] : 18;
    this.setWeather(weatherFromPreset(c, Math.round(t)));
  }

  setDate(date: Date): void {
    this.environment.setDate(date);
    this.clouds.refresh();
    this.nearField?.setDate(date);
    useTerraStore.setState((s) => ({ time: { ...s.time, iso: date.toISOString() } }));
    const s = seasonFor(date, useTerraStore.getState().camera?.lat ?? 0);
    this.ground?.setUniform('seasonTint', s.season === 'autumn' ? 0.6 : 0);
  }

  setTimePlaying(playing: boolean): void {
    this.environment.setPlaying(playing);
    useTerraStore.setState((s) => ({ time: { ...s.time, playing } }));
  }

  setTimeSpeed(speed: number): void {
    this.environment.setTimeScale(speed);
    useTerraStore.setState((s) => ({ time: { ...s.time, speed } }));
  }

  async startTour(keyframes: TourKeyframe[] | null): Promise<void> {
    await this.modes.startTour(keyframes);
  }

  /**
   * Generates a procedural near-field tile (vegetation, rocks, crops, settlements) for slippy tile z/x/y using the
   * climate atlas, terrain height field, OSM features and the simulated date. Returns null until data is ready.
   */
  async generateNearFieldTile(z: number, x: number, y: number): Promise<NearFieldTile | null> {
    if (!this.worldMap || !this.procgen.available) return null;
    const ctx = await buildGenerationContext({
      worldMap: () => this.worldMap,
      naturalEarth: () => this.naturalEarth,
      osm: () => this.osm,
      gazetteer: () => this.gazetteer,
      heightFields: this.heightFields,
      date: () => this.environment.getDate(),
      density: () => QUALITY_PRESETS[this.quality].vegetationDensity,
    }, z, x, y);
    if (!ctx) return null;
    return this.procgen.generate(ctx);
  }

  /** Captures the current frame as a PNG data URL. */
  screenshot(): string {
    this.viewer.render();
    return this.viewer.canvas.toDataURL('image/png');
  }

  groundHeightAt(lat: number, lon: number): number | null {
    return groundHeight(this.viewer, lat, lon);
  }

  /** Height of the terrain under the camera; also demonstrates the sampling API used by walking mode. */
  altitudeAboveGround(): number | null {
    const c = this.viewer.camera.positionCartographic;
    const h = this.viewer.scene.globe.getHeight(new Cartographic(c.longitude, c.latitude));
    return h === undefined ? null : c.height - h;
  }

  private onCommand(code: string): void {
    const ui = useTerraStore.getState();
    switch (code) {
      case 'Digit1': this.modes.setMode('orbit'); break;
      case 'Digit2': this.modes.setMode('fly'); break;
      case 'Digit3': this.modes.setMode('walk'); break;
      case 'Digit4': this.modes.setMode('drive'); break;
      case 'Digit5': void this.startTour(null); break;
      case 'KeyV': this.modes.setView(this.modes.getState().view === 'first' ? 'third' : 'first'); break;
      case 'KeyH': ui.setUi({ hidden: !ui.ui.hidden }); break;
      case 'BracketRight': this.modes.setSpeed(this.modes.getSpeed() * 1.5); break;
      case 'BracketLeft': this.modes.setSpeed(this.modes.getSpeed() / 1.5); break;
      case 'Escape': if (this.modes.getMode() === 'cinematic') this.modes.setMode('orbit'); ui.setUi({ panel: 'none', searchOpen: false }); break;
      case 'Slash': case 'KeyF': ui.setUi({ searchOpen: true }); break;
      default: break;
    }
  }

  cameraDegrees(): { lat: number; lon: number; heightM: number } {
    const c = this.viewer.camera.positionCartographic;
    return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), heightM: c.height };
  }

  destroy(): void {
    this.destroyed = true;
    if (this.readoutTimer !== null) window.clearInterval(this.readoutTimer);
    this.modes.destroy();
    this.nearField?.destroy();
    this.landmarks.destroy();
    this.procgen.destroy();
    this.audio.destroy();
    this.traffic?.destroy();
    this.clouds.destroy();
    this.osm?.destroy();
    this.environment.destroy();
    this.ocean.destroy();
    this.ground?.destroy();
    this.streaming.destroy();
    this.viewer.destroy();
    if (window.__terra?.engine === this) delete window.__terra;
  }
}
