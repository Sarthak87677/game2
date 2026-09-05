import { useEffect, useRef, useState } from 'react';
import { TerraEngine } from './engine/TerraEngine';
import { EngineContext } from './ui/EngineContext';
import { Hud } from './ui/Hud';
import { useTerraStore } from './state/store';
import './styles/hud.css';

/**
 * One engine per container element. React StrictMode (development) runs mount → unmount → mount for every effect;
 * creating a second Cesium viewer while the first is still loading produced two render loops and a burst of
 * "reading 'scene'" errors from the destroyed one. Disposal is therefore deferred briefly so an immediate remount
 * reuses the same engine; a real unmount disposes it after the grace period.
 */
let shared: { container: HTMLElement; promise: Promise<TerraEngine>; disposeTimer: number | null } | null = null;

function acquireEngine(container: HTMLElement): Promise<TerraEngine> {
  if (shared && shared.container === container) {
    if (shared.disposeTimer !== null) { window.clearTimeout(shared.disposeTimer); shared.disposeTimer = null; }
    return shared.promise;
  }
  if (shared) releaseEngine(0);
  const promise = TerraEngine.create(container);
  shared = { container, promise, disposeTimer: null };
  return promise;
}

function releaseEngine(delayMs = 150): void {
  const current = shared;
  if (!current) return;
  if (current.disposeTimer !== null) return;
  current.disposeTimer = window.setTimeout(() => {
    if (shared === current) shared = null;
    void current.promise.then((e) => e.destroy()).catch(() => undefined);
  }, delayMs);
}

export function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<TerraEngine | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;
    acquireEngine(el)
      .then((e) => { if (active) setEngine(e); })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        useTerraStore.getState().log('error', message, err);
        useTerraStore.setState({ boot: { phase: 'error', progress: 0, message: 'Failed to start', error: message, details: [] } });
      });
    return () => { active = false; releaseEngine(); };
  }, []);

  return (
    <EngineContext.Provider value={engine}>
      <div ref={ref} className="terra-viewer" />
      <Hud />
    </EngineContext.Provider>
  );
}
