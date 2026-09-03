import { useEngine } from '../EngineContext';
import { useTerraStore, type PanelId } from '@/state/store';
import type { ModeId } from '@/modes/ModeController';
import type { QualityPresetId } from '@/engine/quality';

const MODES: { id: ModeId; label: string; key: string }[] = [
  { id: 'orbit', label: 'Orbit', key: '1' }, { id: 'fly', label: 'Fly', key: '2' }, { id: 'walk', label: 'Walk', key: '3' }, { id: 'drive', label: 'Drive', key: '4' }, { id: 'cinematic', label: 'Tour', key: '5' },
];

export function Toolbar() {
  const engine = useEngine();
  const mode = useTerraStore((s) => s.mode);
  const ui = useTerraStore((s) => s.ui);
  const setUi = useTerraStore((s) => s.setUi);
  const quality = useTerraStore((s) => s.quality);
  const streaming = useTerraStore((s) => s.streaming);
  const toggle = (p: PanelId) => setUi({ panel: ui.panel === p ? 'none' : p });
  const screenshot = () => {
    if (!engine) return;
    const url = engine.screenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `terra-infinite-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
  };
  return (
    <div className="terra-toolbar">
      <div className="terra-toolgroup" role="radiogroup" aria-label="Exploration mode">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode.mode === m.id} className={mode.mode === m.id ? 'active' : ''} title={`${m.label} (key ${m.key})`} onClick={() => (m.id === 'cinematic' ? void engine?.startTour(null) : engine?.modes.setMode(m.id))}>{m.label}</button>
        ))}
      </div>
      {(mode.mode === 'walk' || mode.mode === 'drive') && (
        <div className="terra-toolgroup">
          <button onClick={() => engine?.modes.setView(mode.view === 'first' ? 'third' : 'first')} title="Toggle first/third person (V)">{mode.view === 'first' ? '1st person' : '3rd person'}</button>
        </div>
      )}
      {mode.mode !== 'orbit' && (
        <div className="terra-toolgroup terra-speed">
          <button onClick={() => engine?.modes.setSpeed(mode.speed / 1.5)} title="Slower ([)">−</button>
          <span className="mono" title="Movement speed multiplier">{mode.speed >= 10 ? mode.speed.toFixed(0) : mode.speed.toFixed(1)}×{mode.mode === 'drive' ? ` · ${(mode.groundSpeedMs * 3.6).toFixed(0)} km/h` : ''}</span>
          <button onClick={() => engine?.modes.setSpeed(mode.speed * 1.5)} title="Faster (])">+</button>
        </div>
      )}
      <div className="terra-toolgroup">
        <button className={ui.panel === 'highlights' ? 'active' : ''} onClick={() => toggle('highlights')}>World Highlights</button>
        <button className={ui.panel === 'timeweather' ? 'active' : ''} onClick={() => toggle('timeweather')}>Time & Weather</button>
        <button className={ui.panel === 'sources' ? 'active' : ''} onClick={() => toggle('sources')}>Data</button>
        <button className={ui.panel === 'settings' ? 'active' : ''} onClick={() => toggle('settings')}>Settings</button>
        <button className={ui.panel === 'diagnostics' ? 'active' : ''} onClick={() => toggle('diagnostics')}>Diagnostics</button>
        <button className={ui.panel === 'help' ? 'active' : ''} onClick={() => toggle('help')}>?</button>
      </div>
      <div className="terra-toolgroup">
        <select value={quality} aria-label="Rendering quality" onChange={(e) => engine?.setQuality(e.target.value as QualityPresetId)}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option>
        </select>
        <button onClick={screenshot} title="Save screenshot (P)">📷</button>
        <button onClick={() => setUi({ hidden: true })} title="Hide interface (H)">Hide UI</button>
      </div>
      <div className="terra-toolgroup terra-stream" title="Streaming: queued tiles · active requests · FPS">
        <span className={`terra-dot ${streaming && streaming.queuedTiles > 0 ? 'busy' : 'idle'}`} />
        <span className="mono">{streaming ? `${streaming.queuedTiles} tiles · ${streaming.activeRequests} req · ${streaming.fps.toFixed(0)} fps` : '…'}</span>
      </div>
    </div>
  );
}
