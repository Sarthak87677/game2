/**
 * Activity progress persisted in localStorage (pure; storage injectable for tests). Everything here is in-game
 * progress — no real money, tickets or accounts.
 */
export interface ActivityProgress {
  version: 1;
  /** Photo challenge id → best score and when it was taken (ISO). */
  photos: Record<string, { score: number; at: string }>;
  /** Landmark id → ISO time of first visit. */
  landmarks: Record<string, string>;
  /** Species id → sightings logged. */
  observations: Record<string, { label: string; count: number; at: string }>;
  /** Checklist id → ticked item ids. */
  checklists: Record<string, string[]>;
  /** Boat course id → completions and best time (ms). */
  courses: Record<string, { completed: number; bestMs: number | null }>;
  /** Cleanup park id → collected litter ids. */
  cleanup: Record<string, string[]>;
  basketball: { attempts: number; made: number; best: number; streak: number };
  /** Tour ids that were started. */
  tours: string[];
  museums: Record<string, string[]>;
}

export const STORAGE_KEY = 'terra-infinite.activities.v1';

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function emptyProgress(): ActivityProgress {
  return { version: 1, photos: {}, landmarks: {}, observations: {}, checklists: {}, courses: {}, cleanup: {}, basketball: { attempts: 0, made: 0, best: 0, streak: 0 }, tours: [], museums: {} };
}

function storage(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadProgress(store: StorageLike | null = storage()): ActivityProgress {
  const base = emptyProgress();
  if (!store) return base;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ActivityProgress>;
    if (parsed.version !== 1) return base;
    return { ...base, ...parsed, basketball: { ...base.basketball, ...(parsed.basketball ?? {}) } };
  } catch { return base; }
}

export function saveProgress(p: ActivityProgress, store: StorageLike | null = storage()): boolean {
  if (!store) return false;
  try { store.setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export function clearProgress(store: StorageLike | null = storage()): void {
  try { store?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Total points across activities (photos score, 5 per landmark, 3 per species, 2 per checklist item, 4 per litter, 2 per basket, 10 per course). */
export function totalPoints(p: ActivityProgress): number {
  let pts = 0;
  for (const ph of Object.values(p.photos)) pts += ph.score;
  pts += Object.keys(p.landmarks).length * 5;
  pts += Object.keys(p.observations).length * 3;
  for (const items of Object.values(p.checklists)) pts += items.length * 2;
  for (const items of Object.values(p.cleanup)) pts += items.length * 4;
  pts += p.basketball.made * 2;
  for (const c of Object.values(p.courses)) pts += c.completed * 10;
  return pts;
}
