import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { MAHARASHTRA_SPAWNS } from '@/data/maharashtra';

/** Spawn as a player at a Maharashtra location (plus the external Taj Mahal hero destination). */
export function PlayPanel() {
  const engine = useEngine();
  const setUi = useTerraStore((s) => s.setUi);
  const player = useTerraStore((s) => s.gameplay.player);
  const boot = useTerraStore((s) => s.boot);
  const spawn = (id: string) => {
    const s = MAHARASHTRA_SPAWNS.find((x) => x.id === id);
    if (!engine || !s) return;
    setUi({ panel: 'none' });
    void engine.gameplay.spawn(s);
  };
  return (
    <div className="terra-panel-body">
      <p className="terra-muted">Spawn as a walking character. Walk with <kbd>W A S D</kbd>, run with <kbd>Shift</kbd>, interact with <kbd>E</kbd>, third person <kbd>V</kbd>. Coordinates are approximate public reference values; campuses, interiors and landmark bodies are original procedural reconstructions.</p>
      {boot.phase !== 'ready' && <p className="terra-warn">World still loading ({boot.message}) — you can spawn now; terrain streams in around you.</p>}
      {player.spawned && <p className="terra-muted">Currently spawned at <b>{player.spawnName}</b>.</p>}
      <ul className="terra-list">
        {MAHARASHTRA_SPAWNS.map((s) => (
          <li key={s.id}>
            <button className="terra-list-btn" onClick={() => spawn(s.id)}>
              <b>{s.name}</b>
              <span className="terra-muted">{s.region} · {s.description}</span>
              <span className="terra-tiny">{s.dataNote}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
