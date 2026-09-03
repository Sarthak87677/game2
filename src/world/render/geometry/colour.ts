/** Small colour helpers for procedural geometry (8-bit RGB triples, Cesium-free). */

/** 8-bit RGB triple, each component 0..255. */
export type RGB = [number, number, number];

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Parses `#rgb`, `#rrggbb`, `rgb(r,g,b)` or `rgba(r,g,b,a)` colour strings. Anything else (including named colours)
 * yields the fallback so a bad species entry never breaks a tile.
 */
export function parseColour(css: string | undefined, fallback: RGB = [128, 128, 128]): RGB {
  if (!css) return fallback;
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
      if ([r, g, b].every(Number.isFinite)) return [r, g, b];
    } else if (h.length === 6 || h.length === 8) {
      const v = parseInt(h.slice(0, 6), 16);
      if (Number.isFinite(v)) return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    return fallback;
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (m) return [clampByte(+m[1]), clampByte(+m[2]), clampByte(+m[3])];
  return fallback;
}

/** Linear interpolation between two colours, t in 0..1. */
export function mixColour(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [clampByte(a[0] + (b[0] - a[0]) * k), clampByte(a[1] + (b[1] - a[1]) * k), clampByte(a[2] + (b[2] - a[2]) * k)];
}

/** Multiplies a colour by a brightness factor (clamped to 0..255). */
export function scaleColour(c: RGB, k: number): RGB {
  return [clampByte(c[0] * k), clampByte(c[1] * k), clampByte(c[2] * k)];
}

/** CSS `rgb()` string for canvas drawing. */
export function cssColour(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
