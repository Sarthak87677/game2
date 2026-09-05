import { useEffect } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';

/** Modal choice card driven by gameplay systems (ticket counters, seats, showroom cameras…). */
export function GameplayOverlayCard() {
  const engine = useEngine();
  const overlay = useTerraStore((s) => s.gameplay.overlay);
  useEffect(() => {
    if (!overlay || !engine) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') engine.gameplay.closeOverlay();
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < overlay.actions.length && !overlay.actions[idx].disabled) engine.gameplay.chooseOverlayAction(overlay.actions[idx].id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [overlay, engine]);
  if (!overlay) return null;
  return (
    <div className="terra-overlay-card" role="dialog" aria-label={overlay.title}>
      <h3>{overlay.title}</h3>
      {overlay.lines.map((l, i) => <p key={i}>{l}</p>)}
      <div className="terra-overlay-actions">
        {overlay.actions.map((a, i) => (
          <button key={a.id} disabled={a.disabled} onClick={() => engine?.gameplay.chooseOverlayAction(a.id)}><kbd>{i + 1}</kbd> {a.label}</button>
        ))}
        <button className="terra-overlay-close" onClick={() => engine?.gameplay.closeOverlay()}><kbd>Esc</kbd> Close</button>
      </div>
      {overlay.note && <div className="terra-overlay-note">{overlay.note}</div>}
    </div>
  );
}
