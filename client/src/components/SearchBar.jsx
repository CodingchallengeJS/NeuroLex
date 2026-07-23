import { useState, useEffect, useRef } from 'react';
import { searchVocab } from '../api';

export default function SearchBar({ onResults, notebookId }) {
  const [query, setQuery] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Local search mode: just pass query string up for parent to filter
    if (notebookId) {
      onResults(query, false);
      return;
    }

    // Global search mode: call API with debounce + stale response guard
    if (!query.trim()) {
      requestIdRef.current++;
      onResults(null, true);
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const data = await searchVocab(query.trim(), null);
        // Only apply if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          onResults(data.vocabs || [], true);
        }
      } catch (e) {
        if (currentRequestId === requestIdRef.current) {
          onResults([], true);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, notebookId, onResults]);

  return (
    <div className="search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      <i className="fa-solid fa-magnifying-glass search-icon" style={{ position: 'absolute', left: '1rem', color: 'var(--text-soft)' }}></i>
      <input 
        type="text" 
        placeholder={notebookId ? "Tìm kiếm trong sổ tay hiện tại..." : "Tìm kiếm toàn bộ từ vựng..."}
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="search-input"
        style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', outline: 'none', fontSize: '1rem' }}
      />
    </div>
  );
}
