/**
 * Controlled search box with a magnifier and a clear button.
 *
 * Deliberately has no state of its own: the previous SearchBar kept its own
 * `query`, so clearing the parent's state left stale text in the input, which
 * then fired a search the user had not asked for.
 */
export default function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  autoFocus = false,
  compact = false
}) {
  const pad = compact ? '0.55rem' : '0.85rem';

  return (
    <div className="search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      <i
        className="fa-solid fa-magnifying-glass search-icon"
        style={{ position: 'absolute', left: '0.9rem', color: 'var(--text-soft)', pointerEvents: 'none' }}
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value) onClear(); }}
        placeholder={placeholder}
        className="search-input"
        autoFocus={autoFocus}
        style={{
          width: '100%',
          padding: `${pad} 2.4rem ${pad} 2.6rem`,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line)',
          background: 'var(--surface-soft)',
          color: 'var(--text)',
          outline: 'none',
          fontSize: compact ? '0.9rem' : '1rem'
        }}
      />
      {value && (
        <button
          type="button"
          className="search-clear-btn"
          onClick={onClear}
          title="Xoá tìm kiếm (Esc)"
          aria-label="Xoá tìm kiếm"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      )}
    </div>
  );
}
