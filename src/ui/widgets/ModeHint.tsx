import { useEffect, useState } from 'react';
import { useTerraStore } from '@/state/store';

const HINTS: Record<string, string[]> = {
  fly: ['Click the world to look around (Esc releases the mouse)', 'W A S D move · Q / E down / up · Shift boost', '[ ] speed · 1 back to orbit'],
  walk: ['Click the world to look around (Esc releases the mouse)', 'W A S D walk · Shift run · Space jump', 'V third person · [ ] speed · 1 back to orbit'],
  drive: ['Click the world to look around (Esc releases the mouse)', 'W accelerate · S brake / reverse · A D steer · Space handbrake', 'V third person · 1 back to orbit'],
  cinematic: ['Cinematic tour running', 'Esc or 1 to stop'],
};

/** Shows the controls for a few seconds whenever an exploration mode is entered. */
export function ModeHint() {
  const mode = useTerraStore((s) => s.mode.mode);
  const hidden = useTerraStore((s) => s.ui.hidden);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (mode === 'orbit') { setVisible(false); return; }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 9000);
    return () => window.clearTimeout(t);
  }, [mode]);
  if (!visible || hidden || !HINTS[mode]) return null;
  return (
    <div className="terra-mode-hint" role="status">
      <div className="terra-mode-hint-title">{mode.charAt(0).toUpperCase() + mode.slice(1)} mode</div>
      {HINTS[mode].map((line) => <div key={line}>{line}</div>)}
    </div>
  );
}
