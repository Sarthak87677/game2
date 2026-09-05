import { useTerraStore } from '@/state/store';

export function Attribution() {
  const sources = useTerraStore((s) => s.sources);
  const terrainId = useTerraStore((s) => s.terrainId);
  const imageryId = useTerraStore((s) => s.imageryId);
  const show = useTerraStore((s) => s.settings.showAttribution);
  const active = sources.filter((s) => s.id === terrainId || s.id === imageryId);
  if (!show) return null;
  return (
    <div className="terra-attribution">
      {active.map((s) => <span key={s.id}>{s.attributionShort}</span>)}
      <span>Places: Natural Earth</span>
      <span>Engine: CesiumJS</span>
      <span className="mono" title={`Built ${__TERRA_BUILD__.time}`}>build {__TERRA_BUILD__.commit}{__TERRA_BUILD__.dirty ? '+' : ''}</span>
      <span className="terra-attr-note">Vegetation, buildings without data, and weather are procedural/inferred — not surveyed.</span>
    </div>
  );
}
