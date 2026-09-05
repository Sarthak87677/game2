import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';

/** "E — Enter Library" prompt near the bottom of the screen, plus the journey/activity status line. */
export function InteractionPrompt() {
  const engine = useEngine();
  const prompt = useTerraStore((s) => s.gameplay.prompt);
  const status = useTerraStore((s) => s.gameplay.status);
  const vehicle = useTerraStore((s) => s.gameplay.vehicle);
  const touch = useTerraStore((s) => s.ui.touch);
  if (!prompt && !status && !vehicle) return null;
  return (
    <div className="terra-gameplay-bar" aria-live="polite">
      {vehicle && (
        <div className="terra-vehicle-hud mono">
          <span className="terra-vehicle-speed">{Math.round(vehicle.speedKmh)}</span><span className="terra-vehicle-unit">km/h</span>
          <span className="terra-vehicle-gear">{vehicle.gear}</span>
          <span className={`terra-vehicle-lamp ${vehicle.headlights ? 'on' : ''}`} title="Headlights (L)">☼</span>
          <span className={`terra-vehicle-lamp ${vehicle.indicator === 'left' || vehicle.indicator === 'hazard' ? 'blink' : ''}`} title="Indicator (Q)">◀</span>
          <span className={`terra-vehicle-lamp ${vehicle.indicator === 'right' || vehicle.indicator === 'hazard' ? 'blink' : ''}`} title="Indicator (R)">▶</span>
          <span className="terra-vehicle-name">{vehicle.name}</span>
        </div>
      )}
      {status && <div className="terra-gameplay-status">{status}</div>}
      {prompt && (
        <button className="terra-prompt" onClick={() => engine?.gameplay.interact()}>
          <kbd>{touch ? 'TAP' : 'E'}</kbd> {prompt.label}
        </button>
      )}
    </div>
  );
}
