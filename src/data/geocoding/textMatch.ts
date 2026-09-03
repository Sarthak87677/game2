/**
 * Text normalisation and fuzzy matching helpers for the offline gazetteer.
 * Pure functions, no dependencies.
 */

const LATIN_FOLD: Readonly<Record<string, string>> = {
  ø: 'o', Ø: 'o', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  ı: 'i', þ: 'th', Þ: 'th', ð: 'd', Ð: 'd', ħ: 'h', Ħ: 'h', ŧ: 't', Ŧ: 't',
};

/**
 * Normalises text for matching: NFD, strip combining marks, fold a few
 * non-decomposable Latin letters, lowercase, drop apostrophes, replace every
 * other non-alphanumeric run with a single space, trim.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øØłŁđĐßæÆœŒıþÞðÐħĦŧŦ]/g, (ch) => LATIN_FOLD[ch] ?? ch)
    .toLowerCase()
    .replace(/[’'‘`´ʻʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Splits normalised text into words (empty input gives an empty array). */
export function tokenizeSearchText(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** Converts a normalised name into a kebab-case slug (`sao paulo` → `sao-paulo`). */
export function slugify(text: string): string {
  const slug = normalizeSearchText(text).replace(/ /g, '-');
  return slug.length > 0 ? slug : 'unnamed';
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'da', 'do', 'del', 'la', 'le', 'du', 'des', 'di', 'y', 'e']);

/**
 * Title-cases names that are written entirely in capitals (Natural Earth
 * region labels such as `SAHARA` or `CAUCASUS MTS.`); other names are returned
 * unchanged.
 */
export function titleCaseIfUpper(name: string): string {
  if (name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  const words = name.toLowerCase().split(' ');
  return words
    .map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/(^|[-(/])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

/**
 * Optimal-string-alignment (restricted Damerau–Levenshtein) distance with an
 * upper bound: returns the distance when it is ≤ `max`, otherwise `max + 1`.
 * Counts insertions, deletions, substitutions and adjacent transpositions.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev2: number[] | null = null;
  let prev: number[] = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array<number>(lb + 1);
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] > max ? max + 1 : prev[lb];
}
