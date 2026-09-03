/**
 * Coordinate text parsing and formatting. Pure, deterministic, no dependencies.
 *
 * Accepted input forms (case-insensitive, flexible whitespace/commas):
 *  - decimal degrees: `40.7128, -74.0060`, `40.7128 -74.0060`, `-33.8688,151.2093`
 *  - labelled: `lat 40.7 lon -74`, `lon -74 lat 40.7`, `latitude: 40.7, longitude: -74`
 *  - hemisphere letters as prefix or suffix: `40.7N 74.0W`, `S33.8688 E151.2093`, `N 40.7 W 74`
 *  - degrees/minutes/seconds: `40°42'46"N 74°00'22"W`, `40°42.77'N, 74°0.36'W`, `40d 42m 46s N`
 *
 * The order is latitude, longitude unless labels or hemisphere letters say
 * otherwise (`lon -74 lat 40.7` and `74°W 40°N` are accepted; a bare
 * `-74, 40.7` is interpreted as lat −74, lon 40.7 and NOT swapped).
 */

/** A parsed latitude/longitude pair in decimal degrees. */
export interface ParsedCoordinates {
  lat: number;
  lon: number;
}

type Axis = 'lat' | 'lon';
type Hemisphere = 'n' | 's' | 'e' | 'w';
type Unit = 'deg' | 'min' | 'sec' | 'none';

interface NumToken {
  type: 'num';
  /** Absolute value of the number. */
  magnitude: number;
  negative: boolean;
  integer: boolean;
  unit: Unit;
}
type Token = { type: 'label'; axis: Axis } | { type: 'hemi'; hemi: Hemisphere } | NumToken;

interface Group {
  label?: Axis;
  hemi?: Hemisphere;
  deg?: NumToken;
  min?: NumToken;
  sec?: NumToken;
  /** Set once a suffix hemisphere letter has been attached: no more minutes/seconds may follow. */
  closed?: boolean;
}

const SEPARATOR_RE = /^[\s,;/&|()[\]]+/;
const LABEL_RE = /^(latitude|lat|longitude|long|lng|lon)(?![a-z])\s*[:=]?\s*/;
const NUMBER_RE = /^([+-]?)(\d+(?:\.\d+)?)(?:\s*(°|"|'|(?:degrees?|deg|d|minutes?|min|m|seconds?|sec|s)(?![a-z])))?/;
const HEMI_RE = /^([nsew])(?![a-z])/;

function normaliseInput(text: string): string {
  return text
    .replace(/[º˚⁰]/g, '°')
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/''/g, '"')
    .replace(/[−‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function unitOf(raw: string | undefined): Unit {
  if (raw === undefined) return 'none';
  if (raw === '°' || raw.startsWith('deg') || raw === 'd') return 'deg';
  if (raw === "'" || raw.startsWith('min') || raw === 'm') return 'min';
  return 'sec';
}

function tokenise(input: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = input;
  while (rest.length > 0) {
    const sep = SEPARATOR_RE.exec(rest);
    if (sep) {
      rest = rest.slice(sep[0].length);
      continue;
    }
    const label = LABEL_RE.exec(rest);
    if (label) {
      tokens.push({ type: 'label', axis: label[1].startsWith('la') ? 'lat' : 'lon' });
      rest = rest.slice(label[0].length);
      continue;
    }
    const num = NUMBER_RE.exec(rest);
    if (num) {
      const rawUnit = num[3];
      let unit = unitOf(rawUnit);
      let consumed = num[0].length;
      // A bare "s" after a number is the hemisphere South unless it follows a minutes value.
      if (rawUnit === 's') {
        const prev = tokens[tokens.length - 1];
        if (!(prev && prev.type === 'num' && prev.unit === 'min')) {
          unit = 'none';
          consumed -= num[0].length - num[0].lastIndexOf('s');
        }
      }
      tokens.push({
        type: 'num',
        magnitude: Number.parseFloat(num[2]),
        negative: num[1] === '-',
        integer: !num[2].includes('.'),
        unit,
      });
      rest = rest.slice(consumed);
      continue;
    }
    const hemi = HEMI_RE.exec(rest);
    if (hemi) {
      tokens.push({ type: 'hemi', hemi: hemi[1] as Hemisphere });
      rest = rest.slice(hemi[0].length);
      continue;
    }
    return null; // garbage
  }
  return tokens;
}

function groupTokens(tokens: Token[]): Group[] | null {
  const firstHemi = tokens.findIndex((t) => t.type === 'hemi');
  const firstNum = tokens.findIndex((t) => t.type === 'num');
  const prefixMode = firstHemi >= 0 && (firstNum < 0 || firstHemi < firstNum);
  const groups: Group[] = [];
  let cur: Group | null = null;
  const open = (g: Group): Group => {
    groups.push(g);
    return g;
  };
  for (const tok of tokens) {
    if (tok.type === 'label') {
      cur = open({ label: tok.axis });
    } else if (tok.type === 'hemi') {
      if (prefixMode) {
        if (cur && cur.deg === undefined && cur.hemi === undefined) cur.hemi = tok.hemi;
        else cur = open({ hemi: tok.hemi });
      } else {
        if (cur && cur.deg !== undefined && cur.hemi === undefined) {
          cur.hemi = tok.hemi;
          cur.closed = true;
        } else return null;
      }
    } else if (tok.unit === 'min' || tok.unit === 'sec') {
      if (!cur || cur.deg === undefined || cur.closed || cur.sec !== undefined) return null;
      if (tok.unit === 'min') {
        if (cur.min !== undefined) return null;
        cur.min = tok;
      } else {
        if (cur.min === undefined) return null;
        cur.sec = tok;
      }
    } else if (cur && cur.deg === undefined) {
      cur.deg = tok;
    } else {
      cur = open({ deg: tok });
    }
  }
  // A trailing hemisphere-only group ("N40.7 74.0W") attaches to the previous group.
  const last = groups[groups.length - 1];
  const prev = groups[groups.length - 2];
  if (last && last.deg === undefined && last.hemi !== undefined && last.label === undefined && prev && prev.hemi === undefined) {
    prev.hemi = last.hemi;
    groups.pop();
  }
  return groups;
}

function axisOfHemisphere(h: Hemisphere): Axis {
  return h === 'n' || h === 's' ? 'lat' : 'lon';
}

/** Returns the signed decimal value of a group, or null when it is malformed. */
function groupValue(g: Group): number | null {
  const { deg, min, sec } = g;
  if (deg === undefined) return null;
  if (deg.negative && g.hemi !== undefined) return null;
  if (g.label !== undefined && g.hemi !== undefined && axisOfHemisphere(g.hemi) !== g.label) return null;
  let value = deg.magnitude;
  if (min !== undefined) {
    if (!deg.integer || min.negative || min.magnitude >= 60) return null;
    value += min.magnitude / 60;
    if (sec !== undefined) {
      if (!min.integer || sec.negative || sec.magnitude >= 60) return null;
      value += sec.magnitude / 3600;
    }
  }
  if (deg.negative) value = -value;
  if (g.hemi === 's' || g.hemi === 'w') value = -value;
  return value;
}

function round6(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Parses free text into a latitude/longitude pair, or returns null when the
 * text is not a coordinate pair or is out of range (|lat| ≤ 90, |lon| ≤ 180).
 * See the module documentation for the accepted forms.
 */
export function parseCoordinates(text: string): ParsedCoordinates | null {
  if (typeof text !== 'string') return null;
  const input = normaliseInput(text);
  if (input.length === 0) return null;
  const tokens = tokenise(input);
  if (!tokens) return null;
  const groups = groupTokens(tokens);
  if (!groups || groups.length !== 2) return null;
  const [a, b] = groups;
  const va = groupValue(a);
  const vb = groupValue(b);
  if (va === null || vb === null) return null;

  const explicitAxis = (g: Group): Axis | undefined => g.label ?? (g.hemi !== undefined ? axisOfHemisphere(g.hemi) : undefined);
  let axisA = explicitAxis(a);
  let axisB = explicitAxis(b);
  if (axisA !== undefined && axisB !== undefined) {
    if (axisA === axisB) return null;
  } else if (axisA !== undefined) {
    axisB = axisA === 'lat' ? 'lon' : 'lat';
  } else if (axisB !== undefined) {
    axisA = axisB === 'lat' ? 'lon' : 'lat';
  } else {
    axisA = 'lat';
    axisB = 'lon';
  }
  const lat = axisA === 'lat' ? va : vb;
  const lon = axisA === 'lat' ? vb : va;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: round6(lat), lon: round6(lon) };
}

/** Options for {@link formatCoordinates}. */
export interface FormatCoordinatesOptions {
  /** Format as degrees, minutes and seconds instead of decimal degrees. */
  dms?: boolean;
  /** Decimal places for decimal degrees (default 4). */
  decimals?: number;
  /** Decimal places for the seconds in DMS mode (default 0). */
  secondsDecimals?: number;
}

function wrapLongitude(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  const w = (((lon + 180) % 360) + 360) % 360 - 180;
  return w;
}

function toDms(abs: number, secondsDecimals: number): string {
  const scale = 10 ** secondsDecimals;
  const totalSeconds = Math.round(abs * 3600 * scale) / scale;
  const deg = Math.floor(totalSeconds / 3600);
  const min = Math.floor((totalSeconds - deg * 3600) / 60);
  const sec = totalSeconds - deg * 3600 - min * 60;
  const secText = sec.toFixed(secondsDecimals).padStart(secondsDecimals > 0 ? 3 + secondsDecimals : 2, '0');
  return `${deg}°${String(min).padStart(2, '0')}'${secText}"`;
}

/**
 * Formats a coordinate pair as `40.7128°N, 74.0060°W` or, with `dms`, as
 * `40°42'46"N, 74°00'22"W`. Latitude is clamped to ±90 and longitude wrapped
 * into [−180, 180]. Throws a RangeError for non-finite input.
 */
export function formatCoordinates(lat: number, lon: number, opts: FormatCoordinatesOptions = {}): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new RangeError('formatCoordinates: lat and lon must be finite numbers');
  }
  const la = Math.max(-90, Math.min(90, lat));
  const lo = wrapLongitude(lon);
  const latHemi = la < 0 ? 'S' : 'N';
  const lonHemi = lo < 0 ? 'W' : 'E';
  if (opts.dms) {
    const sd = Math.max(0, Math.floor(opts.secondsDecimals ?? 0));
    return `${toDms(Math.abs(la), sd)}${latHemi}, ${toDms(Math.abs(lo), sd)}${lonHemi}`;
  }
  const decimals = Math.max(0, Math.min(12, Math.floor(opts.decimals ?? 4)));
  return `${Math.abs(la).toFixed(decimals)}°${latHemi}, ${Math.abs(lo).toFixed(decimals)}°${lonHemi}`;
}
