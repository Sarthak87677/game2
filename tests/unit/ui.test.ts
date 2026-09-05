import { describe, expect, it } from 'vitest';
import { compassLabel, formatBytes, formatLatLon, formatMetres, scaleBarMetres } from '@/ui/format';
import { selectToasts } from '@/ui/widgets/ErrorToasts';
import { useTerraStore } from '@/state/store';

describe('format helpers', () => {
  it('formats metres across scales and handles bad input', () => {
    expect(formatMetres(null)).toBe('—');
    expect(formatMetres(NaN)).toBe('—');
    expect(formatMetres(Infinity)).toBe('—');
    expect(formatMetres(3.14)).toBe('3.1 m');
    expect(formatMetres(999)).toBe('999 m');
    expect(formatMetres(1000)).toBe('1.00 km');
    expect(formatMetres(12_345)).toBe('12.3 km');
    expect(formatMetres(24_000_000)).toBe('24.00 Mm');
    expect(formatMetres(-422)).toBe('-422 m');
  });
  it('formats coordinates and bytes', () => {
    expect(formatLatLon(40.7128, -74.006, 4)).toBe('40.7128°N, 74.0060°W');
    expect(formatLatLon(-33.8688, 151.2093, 2)).toBe('33.87°S, 151.21°E');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1048576)).toBe('5.0 MB');
    expect(formatBytes(3 * 1073741824)).toBe('3.00 GB');
  });
  it('compass labels wrap around', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(-90)).toBe('W');
    expect(compassLabel(135)).toBe('SE');
  });
  it('scale bar picks a nice number', () => {
    const m = scaleBarMetres(1000, 1280);
    expect([50, 100, 200]).toContain(m);
    expect(scaleBarMetres(0, 1280)).toBe(1);
  });
});

describe('error toasts selection', () => {
  const e = (level: 'error' | 'warn' | 'info', message: string, time = '00:00:00') => ({ level, message, time });
  it('shows newest non-info entries, deduplicated and capped', () => {
    const entries = [e('info', 'ok'), e('error', 'A', '1'), e('warn', 'B', '2'), e('error', 'A', '3'), e('error', 'C', '4'), e('warn', 'D', '5')];
    const t = selectToasts(entries, new Set());
    expect(t.map((x) => x.message)).toEqual(['D', 'C', 'A']);
  });
  it('honours dismissals', () => {
    const entries = [e('error', 'A', '1'), e('error', 'B', '2')];
    expect(selectToasts(entries, new Set(['2|B'])).map((x) => x.message)).toEqual(['A']);
  });
});

describe('store', () => {
  it('caps the diagnostics log and merges ui patches', () => {
    const s = useTerraStore.getState();
    for (let i = 0; i < 250; i++) s.log('info', `m${i}`);
    expect(useTerraStore.getState().diagnostics.length).toBeLessThanOrEqual(200);
    s.setUi({ panel: 'help' });
    expect(useTerraStore.getState().ui.panel).toBe('help');
    expect(useTerraStore.getState().ui.hidden).toBe(false);
  });
  it('persists settings', () => {
    useTerraStore.getState().setSettings({ uiScale: 1.3 });
    expect(JSON.parse(localStorage.getItem('terra-infinite.settings.v1') ?? '{}').uiScale).toBe(1.3);
  });
});
