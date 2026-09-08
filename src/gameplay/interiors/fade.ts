/** Full-screen fade used by elevator rides, exits and fall respawns. One shared DOM element, no per-frame work. */

let el: HTMLDivElement | null = null;
let pending: Promise<void> | null = null;

function element(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (el && document.body.contains(el)) return el;
  el = document.createElement('div');
  el.id = 'terra-fade';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.28s ease', zIndex: '60' });
  document.body.appendChild(el);
  return el;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Fades to black, runs `action` while dark, fades back. Concurrent calls queue. */
export function fadeThrough(action: () => void, holdMs = 320): Promise<void> {
  const run = async () => {
    const e = element();
    if (!e) { action(); return; }
    e.style.opacity = '1';
    await wait(holdMs);
    try { action(); } finally {
      await wait(80);
      e.style.opacity = '0';
    }
  };
  pending = (pending ?? Promise.resolve()).then(run, run);
  return pending;
}
