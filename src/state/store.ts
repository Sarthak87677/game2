import { create } from 'zustand';
import type { CameraState } from '@/engine/camera';
import type { QualityPresetId } from '@/engine/quality';
import type { StreamingSnapshot } from '@/engine/streaming';
import type { WeatherState } from '@/engine/environment';
import type { ModeState } from '@/modes/ModeController';
import type { DataSourceInfo } from '@/data/adapters/types';
import type { GeocodeResult } from '@/data/geocoding/types';

export type BootPhase = 'init' | 'viewer' | 'terrain' | 'data' | 'ready' | 'error';
export type PanelId = 'none' | 'highlights' | 'settings' | 'sources' | 'diagnostics' | 'help' | 'timeweather';

export interface BootState { phase: BootPhase; progress: number; message: string; error: string | null; details: string[] }

export interface LocationReadout {
  place: string;
  country: string | null;
  region: string | null;
  surface: string;
  biome: string;
  biomeLabel: string;
  koppen: string;
  annualTempC: number | null;
  annualPrecipMm: number | null;
  season: string;
  monthTempC: number | null;
  sunElevationDeg: number | null;
  localTime: string;
  /** Provenance labels for the HUD. */
  provenance: { terrain: string; biome: string; place: string; buildings: string };
}

export interface DiagnosticEntry { time: string; level: 'error' | 'warn' | 'info'; message: string }

export interface Settings {
  locationAccess: boolean;
  reduceMotion: boolean;
  uiScale: number;
  highContrast: boolean;
  audio: boolean;
  cacheMb: number;
  showAttribution: boolean;
  invertLook: boolean;
}

export const DEFAULT_SETTINGS: Settings = { locationAccess: false, reduceMotion: false, uiScale: 1, highContrast: false, audio: false, cacheMb: 256, showAttribution: true, invertLook: false };

export interface TerraState {
  boot: BootState;
  camera: CameraState | null;
  location: LocationReadout | null;
  time: { iso: string; playing: boolean; speed: number };
  weather: WeatherState | null;
  quality: QualityPresetId;
  mode: ModeState;
  terrainId: string;
  imageryId: string;
  sources: DataSourceInfo[];
  streaming: StreamingSnapshot | null;
  ui: { hidden: boolean; panel: PanelId; searchOpen: boolean; touch: boolean };
  diagnostics: DiagnosticEntry[];
  settings: Settings;
  searchResults: GeocodeResult[];
  searchBusy: boolean;
  dataFlags: { naturalEarth: boolean; worldMap: boolean; worldMapElevation: boolean; gazetteer: boolean; osmOnline: boolean | null; weatherOnline: boolean | null };
  patch: (p: Partial<TerraState>) => void;
  setUi: (p: Partial<TerraState['ui']>) => void;
  setSettings: (p: Partial<Settings>) => void;
  log: (level: DiagnosticEntry['level'], message: string) => void;
}

const SETTINGS_KEY = 'terra-infinite.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export const useTerraStore = create<TerraState>()((set) => ({
  boot: { phase: 'init', progress: 0, message: 'Starting Terra Infinite…', error: null, details: [] },
  camera: null,
  location: null,
  time: { iso: new Date().toISOString(), playing: true, speed: 1 },
  weather: null,
  quality: 'medium',
  mode: { mode: 'orbit', view: 'first', speed: 1, groundSpeedMs: 0, onGround: false },
  terrainId: 'terrarium',
  imageryId: 'procedural',
  sources: [],
  streaming: null,
  ui: { hidden: false, panel: 'none', searchOpen: false, touch: typeof window !== 'undefined' && 'ontouchstart' in window && navigator.maxTouchPoints > 0 },
  diagnostics: [],
  settings: typeof localStorage !== 'undefined' ? loadSettings() : DEFAULT_SETTINGS,
  searchResults: [],
  searchBusy: false,
  dataFlags: { naturalEarth: false, worldMap: false, worldMapElevation: false, gazetteer: false, osmOnline: null, weatherOnline: null },
  patch: (p) => set(p),
  setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
  setSettings: (p) => set((s) => {
    const settings = { ...s.settings, ...p };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    return { settings };
  }),
  log: (level, message) => set((s) => ({ diagnostics: [...s.diagnostics.slice(-199), { time: new Date().toISOString().slice(11, 19), level, message }] })),
}));
