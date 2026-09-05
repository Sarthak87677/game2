import { useEffect, useRef } from 'react';
import { useTerraStore } from '@/state/store';
import { useEngine } from './EngineContext';
import { SearchBar } from './widgets/SearchBar';
import { LocationCard } from './widgets/LocationCard';
import { Compass } from './widgets/Compass';
import { MiniMap } from './widgets/MiniMap';
import { Toolbar } from './widgets/Toolbar';
import { LoadingOverlay } from './widgets/LoadingOverlay';
import { TouchControls } from './widgets/TouchControls';
import { Attribution } from './widgets/Attribution';
import { HighlightsPanel } from './panels/HighlightsPanel';
import { TimeWeatherPanel } from './panels/TimeWeatherPanel';
import { SourcesPanel } from './panels/SourcesPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { HelpPanel } from './panels/HelpPanel';
import { scaleBarMetres, formatMetres } from './format';
import { ErrorToasts } from './widgets/ErrorToasts';
import { ModeHint } from './widgets/ModeHint';

const PANEL_TITLES = { highlights: 'World Highlights', timeweather: 'Time & Weather', sources: 'Data sources & accuracy', settings: 'Settings & accessibility', diagnostics: 'Diagnostics', help: 'Controls & help', none: '' } as const;

export function Hud() {
  const engine = useEngine();
  const ui = useTerraStore((s) => s.ui);
  const setUi = useTerraStore((s) => s.setUi);
  const camera = useTerraStore((s) => s.camera);
  const settings = useTerraStore((s) => s.settings);
  const boot = useTerraStore((s) => s.boot);

  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    document.documentElement.style.setProperty('--terra-ui-scale', String(settings.uiScale));
    document.documentElement.classList.toggle('terra-high-contrast', settings.highContrast);
    const reduce = settings.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.classList.toggle('terra-reduce-motion', reduce);
  }, [settings.uiScale, settings.highContrast, settings.reduceMotion]);
  // Focus management: move focus into an opened panel and restore it to the opener on close.
  useEffect(() => {
    if (ui.panel !== 'none') {
      openerRef.current = document.activeElement as HTMLElement | null;
      window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')?.focus(), 0);
    } else if (openerRef.current && document.body.contains(openerRef.current)) {
      openerRef.current.focus();
      openerRef.current = null;
    }
  }, [ui.panel]);

  const agl = camera?.altitudeAglM ?? camera?.heightM ?? 1000;
  const scaleM = scaleBarMetres(Math.max(1, agl), window.innerWidth);
  const scalePx = Math.max(20, Math.min(200, (scaleM / (2 * Math.max(1, agl) * Math.tan(Math.PI / 6))) * window.innerWidth));

  if (ui.hidden) {
    return (
      <>
        <button className="terra-unhide" onClick={() => setUi({ hidden: false })} title="Show interface (H)">◱</button>
        <LoadingOverlay />
      </>
    );
  }
  return (
    <div className="terra-hud">
      <div className="terra-top">
        <div className="terra-brand" onClick={() => void engine?.goTo({ lat: 20, lon: 20, heightM: 24_000_000, pitchDeg: -90 }, { descend: false })} title="Back to orbit">TERRA <b>INFINITE</b></div>
        <SearchBar />
        <div className={`terra-status terra-status-${boot.phase}`}>{boot.phase === 'ready' ? 'ready' : boot.message}</div>
      </div>
      <Toolbar />
      {ui.panel !== 'none' && (
        <aside className="terra-panel" role="dialog" aria-modal="false" aria-label={PANEL_TITLES[ui.panel]} ref={panelRef} onKeyDown={(e) => { if (e.key === 'Escape') setUi({ panel: 'none' }); }}>
          <header><h2>{PANEL_TITLES[ui.panel]}</h2><button onClick={() => setUi({ panel: 'none' })} aria-label="Close panel">×</button></header>
          {ui.panel === 'highlights' && <HighlightsPanel />}
          {ui.panel === 'timeweather' && <TimeWeatherPanel />}
          {ui.panel === 'sources' && <SourcesPanel />}
          {ui.panel === 'settings' && <SettingsPanel />}
          {ui.panel === 'diagnostics' && <DiagnosticsPanel />}
          {ui.panel === 'help' && <HelpPanel />}
        </aside>
      )}
      <div className="terra-bottom-left"><LocationCard /></div>
      <div className="terra-bottom-right">
        <div className="terra-scale" title="Approximate ground scale at screen centre"><div style={{ width: scalePx }} /><span>{formatMetres(scaleM)}</span></div>
        <Compass headingDeg={camera?.headingDeg ?? 0} onClick={() => { if (engine && camera) void engine.goTo({ lat: camera.lat, lon: camera.lon, heightM: camera.heightM, headingDeg: 0, pitchDeg: camera.pitchDeg }, { descend: false }); }} />
        <MiniMap />
      </div>
      <TouchControls />
      <ModeHint />
      <ErrorToasts />
      <Attribution />
      <LoadingOverlay />
    </div>
  );
}
