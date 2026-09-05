import { useEffect, useRef, useState } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import type { GeocodeResult } from '@/data/geocoding/types';

export function SearchBar() {
  const engine = useEngine();
  const searchOpen = useTerraStore((s) => s.ui.searchOpen);
  const setUi = useTerraStore((s) => s.setUi);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);

  useEffect(() => {
    if (!engine) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void engine.search(query).then((r) => { setResults(r); setActive(0); });
    }, 120);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query, engine]);

  const go = (r: GeocodeResult) => {
    if (!engine) return;
    setUi({ searchOpen: false });
    setQuery('');
    setResults([]);
    void engine.goTo({ lat: r.lat, lon: r.lon, heightM: r.heightM, pitchDeg: r.kind === 'country' || r.kind === 'region' ? -90 : -40 });
  };

  return (
    <div className={`terra-search ${searchOpen ? 'open' : ''}`} role="search">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={searchOpen && results.length > 0}
        aria-controls="terra-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={searchOpen && results[active] ? `terra-result-${active}` : undefined}
        value={query}
        placeholder="Search a place, landmark or coordinates (e.g. 27.9881, 86.9250)"
        aria-label="Search places or coordinates"
        onFocus={() => setUi({ searchOpen: true })}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setActive((a) => Math.min(results.length - 1, a + 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
          else if (e.key === 'Enter' && results[active]) go(results[active]);
          else if (e.key === 'Escape') { setUi({ searchOpen: false }); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {searchOpen && results.length > 0 && (
        <ul className="terra-search-results" role="listbox" id="terra-search-listbox">
          {results.map((r, i) => (
            <li key={r.id} id={`terra-result-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onMouseDown={() => go(r)}>
              <span className={`terra-kind terra-kind-${r.kind}`}>{r.kind}</span>
              <span className="terra-result-name">{r.name}</span>
              <span className="terra-result-sub">{r.displayName}</span>
              <span className="terra-source">{r.source === 'natural-earth' ? 'measured' : 'bookmark'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
