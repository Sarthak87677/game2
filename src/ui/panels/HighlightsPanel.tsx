import { useMemo, useState } from 'react';
import { useEngine } from '../EngineContext';
import { WORLD_HIGHLIGHTS } from '@/data/bookmarks/highlights';
import { SHOWCASE_AREAS } from '@/data/bookmarks/showcase';
import type { Bookmark } from '@/data/bookmarks/types';

const CONTINENTS = ['All', 'Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Ocean'];
const CATEGORIES = ['All', 'city', 'landmark', 'nature', 'mountain', 'river', 'desert', 'polar', 'island', 'ocean', 'park', 'rural'];

export function HighlightsPanel() {
  const engine = useEngine();
  const [continent, setContinent] = useState('All');
  const [category, setCategory] = useState('All');
  const [tab, setTab] = useState<'showcase' | 'all'>('showcase');
  const list = useMemo(() => {
    const src: Bookmark[] = tab === 'showcase' ? SHOWCASE_AREAS : WORLD_HIGHLIGHTS;
    return src.filter((b) => (continent === 'All' || b.continent === continent) && (category === 'All' || b.category === category)).sort((a, b) => a.name.localeCompare(b.name));
  }, [continent, category, tab]);
  const go = (b: Bookmark) => void engine?.goTo({ lat: b.lat, lon: b.lon, heightM: b.camera.heightM, headingDeg: b.camera.headingDeg, pitchDeg: b.camera.pitchDeg });
  return (
    <div className="terra-panel-body">
      <div className="terra-tabs">
        <button className={tab === 'showcase' ? 'active' : ''} onClick={() => setTab('showcase')}>Showcase areas ({SHOWCASE_AREAS.length})</button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All highlights ({WORLD_HIGHLIGHTS.length})</button>
      </div>
      <div className="terra-filters">
        <select value={continent} onChange={(e) => setContinent(e.target.value)} aria-label="Continent">{CONTINENTS.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <ul className="terra-list">
        {list.map((b) => (
          <li key={b.id}>
            <button onClick={() => go(b)}>
              <span className="terra-list-title">{b.name}</span>
              <span className="terra-list-sub">{b.category} · {b.country ?? b.continent} · {b.lat.toFixed(3)}, {b.lon.toFixed(3)}</span>
              <span className="terra-list-desc">{b.description}</span>
              <span className="terra-list-note">{b.dataNote}</span>
            </button>
            {'tourPath' in b && (b as { tourPath?: unknown[] }).tourPath && (
              <button className="terra-mini" onClick={() => void engine?.startTour((b as { tourPath: { lat: number; lon: number; heightM: number; headingDeg: number; pitchDeg: number; durationS: number }[] }).tourPath)}>Tour</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
