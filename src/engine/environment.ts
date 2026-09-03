import { Cartesian3, Cartesian2, Color, JulianDate, Matrix4, ParticleSystem, SphereEmitter, Simon1994PlanetaryPositions, Transforms, Matrix3, type Particle, type Viewer, PointPrimitiveCollection, type PointPrimitive } from 'cesium';

export type WeatherCondition = 'clear' | 'partly_cloudy' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog' | 'mist' | 'dust';
export type WeatherSource = 'simulated' | 'live' | 'historical';

export interface WeatherState {
  condition: WeatherCondition;
  /** 0..1 */
  cloudCover: number;
  /** 0..1 intensity */
  precipitation: number;
  /** 0..1 */
  fogDensity: number;
  windSpeedMs: number;
  windDirDeg: number;
  temperatureC: number;
  humidity: number;
  /** 0..1 surface wetness */
  wetness: number;
  /** 0..1 lying snow */
  snowCover: number;
  source: WeatherSource;
}

export const WEATHER_PRESETS: Record<WeatherCondition, Omit<WeatherState, 'temperatureC' | 'humidity' | 'source' | 'windDirDeg'>> = {
  clear: { condition: 'clear', cloudCover: 0.05, precipitation: 0, fogDensity: 0, windSpeedMs: 3, wetness: 0, snowCover: 0 },
  partly_cloudy: { condition: 'partly_cloudy', cloudCover: 0.4, precipitation: 0, fogDensity: 0.02, windSpeedMs: 5, wetness: 0, snowCover: 0 },
  overcast: { condition: 'overcast', cloudCover: 0.95, precipitation: 0, fogDensity: 0.08, windSpeedMs: 6, wetness: 0.2, snowCover: 0 },
  rain: { condition: 'rain', cloudCover: 1, precipitation: 0.6, fogDensity: 0.18, windSpeedMs: 8, wetness: 0.9, snowCover: 0 },
  storm: { condition: 'storm', cloudCover: 1, precipitation: 1, fogDensity: 0.3, windSpeedMs: 18, wetness: 1, snowCover: 0 },
  snow: { condition: 'snow', cloudCover: 1, precipitation: 0.6, fogDensity: 0.25, windSpeedMs: 5, wetness: 0.1, snowCover: 0.9 },
  fog: { condition: 'fog', cloudCover: 0.7, precipitation: 0, fogDensity: 1, windSpeedMs: 1, wetness: 0.4, snowCover: 0 },
  mist: { condition: 'mist', cloudCover: 0.5, precipitation: 0, fogDensity: 0.45, windSpeedMs: 2, wetness: 0.5, snowCover: 0 },
  dust: { condition: 'dust', cloudCover: 0.2, precipitation: 0, fogDensity: 0.6, windSpeedMs: 14, wetness: 0, snowCover: 0 },
};

export function weatherFromPreset(condition: WeatherCondition, temperatureC = 18, windDirDeg = 240, source: WeatherSource = 'simulated'): WeatherState {
  return { ...WEATHER_PRESETS[condition], temperatureC, humidity: condition === 'clear' ? 0.4 : 0.8, windDirDeg, source };
}

/** Simulated weather inferred from the climate model at a location and date — never presented as observed. */
export function simulateWeather(monthlyTempC: number[], monthlyPrecipMm: number[], date: Date, rng01: number): WeatherState {
  const m = date.getUTCMonth();
  const t = monthlyTempC[m] ?? 15;
  const p = monthlyPrecipMm[m] ?? 50;
  const wetProb = Math.min(0.85, p / 250);
  let condition: WeatherCondition = 'clear';
  if (rng01 < wetProb * 0.7) condition = t < 1 ? 'snow' : rng01 < wetProb * 0.15 ? 'storm' : 'rain';
  else if (rng01 < wetProb) condition = 'overcast';
  else if (rng01 < wetProb + 0.25) condition = 'partly_cloudy';
  if (p < 15 && t > 28 && rng01 > 0.85) condition = 'dust';
  const w = weatherFromPreset(condition, Math.round(t + (rng01 - 0.5) * 6), Math.round(rng01 * 360));
  w.snowCover = t < -1 ? Math.min(1, (1 - t) / 8) : condition === 'snow' ? 0.6 : 0;
  return w;
}

export interface EnvironmentUniforms { wetness: number; snowCover: number; fogDensity: number; windSpeedMs: number; windDirDeg: number; cloudCover: number }

function makeDropTexture(kind: 'rain' | 'snow'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = kind === 'rain' ? 48 : 16;
  const ctx = c.getContext('2d')!;
  if (kind === 'rain') {
    const g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(200,220,255,0)');
    g.addColorStop(0.5, 'rgba(200,220,255,0.7)');
    g.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, 0, 3, 48);
  } else {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  }
  return c;
}

/**
 * Controls simulated time, sun/moon, atmosphere mood, fog, precipitation particles and the night-light layer.
 * Sun position is computed by Cesium from the clock, so the day/night terminator follows the selected UTC time.
 */
export class EnvironmentController {
  private weather: WeatherState = weatherFromPreset('clear');
  private particles: ParticleSystem | null = null;
  private particleKind: 'rain' | 'snow' | null = null;
  private nightLights: PointPrimitiveCollection | null = null;
  private nightLightNormals: { point: PointPrimitive; normal: Cartesian3; base: number }[] = [];
  private lastNightUpdate = 0;
  private removeListeners: (() => void)[] = [];
  private scratchMatrix = new Matrix4();
  private timeScale = 1;
  onWeatherApplied?: (u: EnvironmentUniforms) => void;
  particleBudget = 800;

  constructor(private viewer: Viewer) {
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;
    this.removeListeners.push(viewer.scene.preUpdate.addEventListener(() => this.tick()));
  }

  /** Simulated date/time (UTC). */
  getDate(): Date {
    return JulianDate.toDate(this.viewer.clock.currentTime);
  }

  setDate(date: Date): void {
    this.viewer.clock.currentTime = JulianDate.fromDate(date);
  }

  setPlaying(playing: boolean): void {
    this.viewer.clock.shouldAnimate = playing;
    this.viewer.clock.multiplier = playing ? this.timeScale : 0;
  }

  setTimeScale(multiplier: number): void {
    this.timeScale = multiplier;
    if (this.viewer.clock.shouldAnimate) this.viewer.clock.multiplier = multiplier;
  }

  getWeather(): WeatherState {
    return this.weather;
  }

  /** Sun direction in Earth-fixed frame (unit vector) for the current clock time. */
  sunDirectionFixed(): Cartesian3 {
    const time = this.viewer.clock.currentTime;
    const inertial = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time);
    const rot = Transforms.computeIcrfToFixedMatrix(time) ?? Transforms.computeTemeToPseudoFixedMatrix(time);
    const fixed = Matrix3.multiplyByVector(rot, inertial, new Cartesian3());
    return Cartesian3.normalize(fixed, fixed);
  }

  /** Sun elevation (degrees) above the horizon at a surface position. */
  sunElevationDeg(lat: number, lon: number): number {
    const n = Cartesian3.normalize(Cartesian3.fromDegrees(lon, lat), new Cartesian3());
    const s = this.sunDirectionFixed();
    return (Math.asin(Math.max(-1, Math.min(1, Cartesian3.dot(n, s)))) * 180) / Math.PI;
  }

  setWeather(w: WeatherState): void {
    this.weather = w;
    const scene = this.viewer.scene;
    this.surfaceFog = { density: 0.0004 + w.fogDensity * 0.02 + w.precipitation * 0.002, brightness: 0.03 + w.fogDensity * 0.3 };
    if (!this.underwater) {
      scene.fog.density = this.surfaceFog.density;
      scene.fog.minimumBrightness = this.surfaceFog.brightness;
    }
    const atmosphere = scene.atmosphere;
    atmosphere.brightnessShift = -0.35 * w.cloudCover - 0.2 * w.fogDensity;
    atmosphere.saturationShift = -0.45 * w.cloudCover - 0.3 * w.fogDensity + (w.condition === 'dust' ? -0.2 : 0);
    atmosphere.hueShift = w.condition === 'dust' ? 0.05 : 0;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.brightnessShift = atmosphere.brightnessShift;
      scene.skyAtmosphere.saturationShift = atmosphere.saturationShift;
      scene.skyAtmosphere.hueShift = atmosphere.hueShift;
    }
    scene.shadowMap.darkness = 0.35 + 0.45 * w.cloudCover;
    const kind: 'rain' | 'snow' | null = w.precipitation > 0.05 ? (w.condition === 'snow' || w.temperatureC < 1 ? 'snow' : 'rain') : null;
    this.ensureParticles(kind, w.precipitation);
    this.onWeatherApplied?.({ wetness: w.wetness, snowCover: w.snowCover, fogDensity: w.fogDensity, windSpeedMs: w.windSpeedMs, windDirDeg: w.windDirDeg, cloudCover: w.cloudCover });
  }

  private ensureParticles(kind: 'rain' | 'snow' | null, intensity: number): void {
    const scene = this.viewer.scene;
    if (kind !== this.particleKind) {
      if (this.particles) { scene.primitives.remove(this.particles); this.particles = null; }
      this.particleKind = kind;
      if (!kind) return;
      const isSnow = kind === 'snow';
      const gravity = isSnow ? 2.5 : 25;
      const wind = this.weather.windSpeedMs;
      const windDir = (this.weather.windDirDeg * Math.PI) / 180;
      const viewer = this.viewer;
      const scratch = new Cartesian3();
      this.particles = scene.primitives.add(new ParticleSystem({
        modelMatrix: new Matrix4(),
        minimumSpeed: -1,
        maximumSpeed: 0,
        lifetime: isSnow ? 12 : 4,
        emitter: new SphereEmitter(isSnow ? 40 : 30),
        startScale: 1,
        endScale: 1,
        image: makeDropTexture(kind),
        emissionRate: Math.round(this.particleBudget * intensity * (isSnow ? 0.6 : 1.5)),
        startColor: Color.WHITE.withAlpha(isSnow ? 0.9 : 0.55),
        endColor: Color.WHITE.withAlpha(isSnow ? 0.7 : 0.3),
        imageSize: isSnow ? new Cartesian2(0.35, 0.35) : new Cartesian2(0.03, 0.25),
        updateCallback: (particle: Particle, dt: number) => {
          // Gravity toward Earth centre and wind in the local horizontal plane.
          const down = Cartesian3.normalize(particle.position, scratch);
          Cartesian3.multiplyByScalar(down, -gravity * dt, down);
          Cartesian3.add(particle.velocity, down, particle.velocity);
          if (wind > 0.5) {
            const enu = Transforms.eastNorthUpToFixedFrame(viewer.camera.position);
            const east = Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_X, new Cartesian3());
            const north = Matrix4.multiplyByPointAsVector(enu, Cartesian3.UNIT_Y, new Cartesian3());
            const w = Cartesian3.add(Cartesian3.multiplyByScalar(east, Math.sin(windDir) * wind * dt * 0.4, new Cartesian3()), Cartesian3.multiplyByScalar(north, Math.cos(windDir) * wind * dt * 0.4, new Cartesian3()), new Cartesian3());
            Cartesian3.add(particle.velocity, w, particle.velocity);
          }
          if (isSnow) Cartesian3.multiplyByScalar(particle.velocity, 0.985, particle.velocity);
        },
      }));
    } else if (this.particles) {
      this.particles.emissionRate = Math.round(this.particleBudget * intensity * (kind === 'snow' ? 0.6 : 1.5));
    }
  }

  /** Adds population-scaled night lights; visible only on the night side. */
  setNightLights(places: { lat: number; lon: number; pop: number }[]): void {
    const scene = this.viewer.scene;
    if (this.nightLights) scene.primitives.remove(this.nightLights);
    const collection = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    this.nightLights = collection;
    this.nightLightNormals = [];
    for (const p of places) {
      if (p.pop < 20000) continue;
      const size = 1.2 + Math.log10(Math.max(1, p.pop)) * 0.9;
      const position = Cartesian3.fromDegrees(p.lon, p.lat, 50);
      const normal = Cartesian3.normalize(position, new Cartesian3());
      const point = collection.add({
        position,
        pixelSize: size,
        color: Color.fromBytes(255, 210, 140, 0),
        outlineWidth: 0,
        scaleByDistance: undefined,
        translucencyByDistance: undefined,
        show: true,
      });
      this.nightLightNormals.push({ point, normal, base: size });
    }
    this.lastNightUpdate = 0;
  }

  private underwater = false;
  private surfaceFog = { density: 0.0004, brightness: 0.03 };

  private applyUnderwater(camHeight: number): void {
    const scene = this.viewer.scene;
    const under = camHeight < -0.5;
    if (under === this.underwater) return;
    this.underwater = under;
    if (under) {
      scene.fog.density = 0.02;
      scene.fog.minimumBrightness = 0.02;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      scene.globe.showGroundAtmosphere = false;
      scene.backgroundColor = Color.fromCssColorString('#04213a');
      scene.globe.baseColor = Color.fromCssColorString('#0a2e4a');
    } else {
      scene.fog.density = this.surfaceFog.density;
      scene.fog.minimumBrightness = this.surfaceFog.brightness;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
      scene.globe.showGroundAtmosphere = true;
      scene.backgroundColor = Color.BLACK;
      scene.globe.baseColor = Color.fromCssColorString('#20344f');
    }
  }

  private tick(): void {
    const now = performance.now();
    this.applyUnderwater(this.viewer.camera.positionCartographic.height);
    if (this.particles) {
      const camera = this.viewer.camera;
      const agl = camera.positionCartographic.height - (this.viewer.scene.globe.getHeight(camera.positionCartographic) ?? 0);
      this.particles.show = agl < 4000;
      Transforms.eastNorthUpToFixedFrame(camera.position, undefined, this.scratchMatrix);
      Matrix4.clone(this.scratchMatrix, this.particles.modelMatrix);
    }
    if (this.nightLights && now - this.lastNightUpdate > 400) {
      this.lastNightUpdate = now;
      const sun = this.sunDirectionFixed();
      const height = this.viewer.camera.positionCartographic.height;
      const visible = height > 30_000;
      for (const nl of this.nightLightNormals) {
        const d = Cartesian3.dot(nl.normal, sun);
        const night = Math.max(0, Math.min(1, (-d + 0.02) / 0.12));
        nl.point.show = visible && night > 0.01;
        nl.point.color = Color.fromBytes(255, 210, 140, Math.round(night * 235));
        nl.point.pixelSize = nl.base * (height > 3_000_000 ? 1 : 1.6);
      }
    }
  }

  destroy(): void {
    for (const r of this.removeListeners) r();
    if (this.particles) this.viewer.scene.primitives.remove(this.particles);
    if (this.nightLights) this.viewer.scene.primitives.remove(this.nightLights);
  }
}
