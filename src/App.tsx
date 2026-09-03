import { useEffect, useRef, useState } from 'react';
import { TerraEngine } from './engine/TerraEngine';
import { EngineContext } from './ui/EngineContext';
import { Hud } from './ui/Hud';
import { useTerraStore } from './state/store';
import './styles/hud.css';

export function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<TerraEngine | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let created: TerraEngine | null = null;
    TerraEngine.create(el)
      .then((e) => { if (cancelled) { e.destroy(); return; } created = e; setEngine(e); })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        useTerraStore.getState().log('error', message);
        useTerraStore.setState({ boot: { phase: 'error', progress: 0, message: 'Failed to start', error: message, details: [] } });
      });
    return () => { cancelled = true; created?.destroy(); };
  }, []);

  return (
    <EngineContext.Provider value={engine}>
      <div ref={ref} className="terra-viewer" />
      <Hud />
    </EngineContext.Provider>
  );
}
