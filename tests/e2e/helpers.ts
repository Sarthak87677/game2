import { expect, type Page } from '@playwright/test';

export interface TerraState {
  boot: { phase: string; progress: number; message: string; error: string | null };
  camera: { lat: number; lon: number; heightM: number; altitudeAglM: number | null; groundM: number | null } | null;
  streaming: { queuedTiles: number; tilesLoaded: boolean; fps: number; terrainTilesLoaded: number; terrainTileErrors: number; jsHeapMb: number | null } | null;
  location: { place: string; biome: string; koppen: string; surface: string } | null;
  dataFlags: { naturalEarth: boolean; worldMap: boolean; worldMapElevation: boolean; gazetteer: boolean };
  diagnostics: { level: string; message: string }[];
}

export const BENIGN_CONSOLE = [/favicon/i, /ERR_CONNECTION_RESET|ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/i, /net::ERR/i, /has been blocked by CORS/i, /third-party cookie/i];

export function collectErrors(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 500)); });
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 500)));
  return { errors, pageErrors };
}

export async function state(page: Page): Promise<TerraState> {
  return page.evaluate(() => (window as unknown as { __terra?: { state: () => TerraState } }).__terra?.state() as TerraState);
}

export async function waitForReady(page: Page, timeout = 180_000): Promise<TerraState> {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as unknown as { __terra?: { ready: boolean } }).__terra?.ready === true, null, { timeout });
  const s = await state(page);
  expect(s.boot.phase).toBe('ready');
  return s;
}

export async function goTo(page: Page, lat: number, lon: number, heightM: number): Promise<void> {
  await page.evaluate(([la, lo, h]) => (window as unknown as { __terra: { goTo: (a: number, b: number, c: number) => Promise<boolean> } }).__terra.goTo(la, lo, h), [lat, lon, heightM]);
}

/** Waits until terrain streaming settles (or the timeout passes — SwiftShader can be slow). */
export async function waitForTiles(page: Page, timeout = 90_000): Promise<void> {
  await page.waitForFunction(() => {
    const s = (window as unknown as { __terra?: { state: () => TerraState } }).__terra?.state();
    return !!s?.streaming && s.streaming.queuedTiles === 0 && s.streaming.tilesLoaded;
  }, null, { timeout }).catch(() => undefined);
  await page.waitForTimeout(1500);
}
