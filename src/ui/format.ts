export function formatMetres(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const abs = Math.abs(m);
  if (abs >= 1_000_000) return `${(m / 1_000_000).toFixed(2)} Mm`;
  if (abs >= 10_000) return `${(m / 1000).toFixed(1)} km`;
  if (abs >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(abs < 10 ? 1 : 0)} m`;
}

export function formatLatLon(lat: number, lon: number, digits = 5): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

export function compassLabel(headingDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((headingDeg % 360) + 360) % 360) / 45) % 8];
}

/** Ground scale: metres represented by 100 px at the centre of the view for a camera at heightAgl with 60° fov. */
export function scaleBarMetres(heightAgl: number, viewportWidthPx: number): number {
  const fov = Math.PI / 3;
  const widthM = 2 * Math.max(1, heightAgl) * Math.tan(fov / 2);
  const per100px = (widthM / viewportWidthPx) * 100;
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  return nice.reduce((best, n) => (Math.abs(n - per100px) < Math.abs(best - per100px) ? n : best), nice[0]);
}
