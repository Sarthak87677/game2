import { useRef } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';

function Joystick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  return (
    <div ref={ref} className="terra-joystick" aria-label={label}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!start.current || start.current.id !== e.pointerId) return;
        const dx = (e.clientX - start.current.x) / 40;
        const dy = (e.clientY - start.current.y) / 40;
        onMove(Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, -dy)));
      }}
      onPointerUp={() => { start.current = null; onMove(0, 0); }}
      onPointerCancel={() => { start.current = null; onMove(0, 0); }}>
      <div className="terra-joystick-knob" />
    </div>
  );
}

/** On-screen joysticks for touch devices: left = move, right = look. Shown in fly/walk/drive modes. */
export function TouchControls() {
  const engine = useEngine();
  const mode = useTerraStore((s) => s.mode.mode);
  const touch = useTerraStore((s) => s.ui.touch);
  if (!touch || !engine || mode === 'orbit' || mode === 'cinematic') return null;
  const input = engine.modes.input;
  return (
    <div className="terra-touch">
      <Joystick label="Move" onMove={(x, y) => input.setVirtualAxis(x, y)} />
      <Joystick label="Look" onMove={(x, y) => input.addVirtualLook(x * 6, -y * 6)} />
      <button className="terra-touch-jump" onPointerDown={() => input.queueJump()}>Jump</button>
    </div>
  );
}
