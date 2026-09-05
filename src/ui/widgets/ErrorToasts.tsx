import { useEffect, useState } from 'react';
import { useTerraStore, type DiagnosticEntry } from '@/state/store';

const MAX_VISIBLE = 3;

/** Pure helper: the newest error/warn entries not yet dismissed, capped for display. */
export function selectToasts(entries: DiagnosticEntry[], dismissed: Set<string>, max = MAX_VISIBLE): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length < max; i--) {
    const e = entries[i];
    if (e.level === 'info') continue;
    const key = `${e.time}|${e.message}`;
    if (dismissed.has(key)) continue;
    if (out.some((o) => o.message === e.message)) continue;
    out.push(e);
  }
  return out;
}

/** Non-blocking notices for recoverable problems (a data source failed, a worker is unavailable). */
export function ErrorToasts() {
  const diagnostics = useTerraStore((s) => s.diagnostics);
  const setUi = useTerraStore((s) => s.setUi);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const toasts = selectToasts(diagnostics, dismissed);
  // Auto-dismiss warnings after a while; errors stay until dismissed.
  useEffect(() => {
    const warn = toasts.filter((t) => t.level === 'warn');
    if (warn.length === 0) return;
    const timer = window.setTimeout(() => setDismissed((d) => { const n = new Set(d); for (const w of warn) n.add(`${w.time}|${w.message}`); return n; }), 12_000);
    return () => window.clearTimeout(timer);
  }, [toasts]);
  if (toasts.length === 0) return null;
  return (
    <div className="terra-toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={`${t.time}|${t.message}`} className={`terra-toast terra-toast-${t.level}`} role={t.level === 'error' ? 'alert' : 'status'}>
          <span className="terra-toast-text">{t.message}</span>
          <button onClick={() => setUi({ panel: 'diagnostics' })}>Diagnostics</button>
          <button aria-label="Dismiss notification" onClick={() => setDismissed((d) => new Set(d).add(`${t.time}|${t.message}`))}>×</button>
        </div>
      ))}
    </div>
  );
}
