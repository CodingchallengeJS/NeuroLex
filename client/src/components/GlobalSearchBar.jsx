import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import SearchInput from './SearchInput';

/**
 * Global vocabulary search, living in the navbar.
 *
 * The query is kept in the URL (`/notebooks?q=…`) rather than in component
 * state, so searching from any page lands on the notebooks page, the browser
 * back button undoes a search, and a search is shareable.
 */
export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const urlQuery = location.pathname === '/notebooks' ? (searchParams.get('q') || '') : '';
  const [value, setValue] = useState(urlQuery);
  const lastPushed = useRef(urlQuery);

  // Keep in step when the URL changes underneath us (back button, or the page
  // clearing the search itself).
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      setValue(urlQuery);
      lastPushed.current = urlQuery;
    }
  }, [urlQuery]);

  // Debounce so typing does not push a history entry per keystroke.
  useEffect(() => {
    if (value === lastPushed.current) return;

    const timer = setTimeout(() => {
      lastPushed.current = value;
      const trimmed = value.trim();
      // `replace` keeps the back button meaning "before I started searching"
      // instead of walking back one character at a time.
      const onNotebooks = location.pathname === '/notebooks';
      navigate(trimmed ? `/notebooks?q=${encodeURIComponent(trimmed)}` : '/notebooks', {
        replace: onNotebooks
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, navigate, location.pathname]);

  const clear = () => {
    setValue('');
    lastPushed.current = '';
    navigate('/notebooks', { replace: location.pathname === '/notebooks' });
  };

  return (
    <div className="nav-search">
      <SearchInput
        value={value}
        onChange={setValue}
        onClear={clear}
        placeholder="Tìm kiếm toàn bộ từ vựng..."
        compact
      />
    </div>
  );
}
