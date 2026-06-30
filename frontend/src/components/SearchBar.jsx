import { useEffect, useMemo, useRef, useState } from 'react';
import { searchPlaces } from '../lib/places';

const SCENARIO_TAG = {
  tornado: { label: 'Tornado', color: '#ff2d2d' },
  hurricane: { label: 'Hurricane', color: '#4cc9f0' },
  squall: { label: 'Derecho', color: '#ffb000' },
  clear: { label: 'Clear', color: '#8a94b8' },
};

/**
 * Map search bar. Typing a city/region filters the local place catalogue;
 * selecting one pans the camera there and swaps in the matching demo scenario.
 */
export default function SearchBar({ onSelect, activeScenario }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  const results = useMemo(() => searchPlaces(query), [query]);

  useEffect(() => {
    const onClickAway = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const choose = (place) => {
    if (!place) return;
    onSelect(place);
    setQuery(place.name);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[highlight] || results[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="searchbar" ref={boxRef}>
      <div className="searchbar-input">
        <span className="search-icon">⌕</span>
        <input
          type="text"
          value={query}
          placeholder="Search a city or region (e.g. Tampa, Tornado Alley, Chicago)…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((p, i) => {
            const tag = SCENARIO_TAG[p.scenario];
            return (
              <li
                key={p.name}
                className={i === highlight ? 'active' : ''}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
              >
                <span>{p.name}</span>
                <span className="scenario-tag" style={{ background: tag.color }}>
                  {tag.label}
                  {activeScenario === p.scenario ? ' •' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
