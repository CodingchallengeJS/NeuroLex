import { useMemo } from 'react';
import TagChip from './TagChip';

const KIND_LABELS = {
  exam: 'Kỳ thi',
  source: 'Nguồn',
  topic: 'Chủ đề',
  level: 'Trình độ',
  function: 'Chức năng',
  register: 'Văn phong'
};

const KIND_ORDER = ['exam', 'source', 'level', 'topic', 'function', 'register'];

/**
 * Left column tag filter. Sits outside the scrolling list so it stays put.
 *
 * Two modes:
 *   notebook - filters the notebook grid (server side, via ?tag=)
 *   word     - filters the words inside the open notebook (client side)
 *
 * Selecting several tags of the same kind widens the result; tags of different
 * kinds narrow it. Same rule in both modes, and the same rule the API uses.
 */
export default function TagPanel({ mode, tags, selected, onToggle, onClear, counts }) {
  const grouped = useMemo(() => {
    const usage = (tag) => {
      if (counts) return counts.get(tag.slug) || 0;
      return mode === 'word' ? tag.word_count : tag.notebook_count;
    };

    const byKind = new Map();
    for (const tag of tags || []) {
      if (mode === 'word' && tag.scope === 'notebook') continue;
      if (mode === 'notebook' && tag.scope === 'word') continue;
      // A tag nothing uses is a dead end in a filter.
      if (usage(tag) === 0 && !selected.includes(tag.slug)) continue;
      if (!byKind.has(tag.kind)) byKind.set(tag.kind, []);
      byKind.get(tag.kind).push(tag);
    }
    return KIND_ORDER
      .filter(kind => byKind.has(kind))
      .map(kind => [kind, byKind.get(kind)]);
  }, [tags, mode, counts, selected]);

  // Kept short so it fits the narrow panel on one line.
  const title = mode === 'word' ? 'Lọc từ vựng' : 'Lọc sổ tay';

  return (
    <div className="tag-col card">
      <div className="tag-col-header">
        <h3 className="sr-title" style={{ margin: 0, fontSize: '1rem' }}>
          <i className="fa-solid fa-filter"></i> {title}
        </h3>
        {selected.length > 0 && (
          <button className="link-btn" onClick={onClear} style={{ fontSize: '0.78rem' }}>
            Bỏ lọc ({selected.length})
          </button>
        )}
      </div>

      <div className="tag-col-body">
        {grouped.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', fontSize: '0.85rem', margin: 0 }}>
            {mode === 'word'
              ? 'Chưa có từ nào ở đây được gắn tag.'
              : 'Chưa có tag nào.'}
          </p>
        ) : grouped.map(([kind, kindTags]) => (
          <div className="tag-col-group" key={kind}>
            <span className="tag-filter-kind">{KIND_LABELS[kind] || kind}</span>
            <div className="tag-filter-chips">
              {kindTags.map(tag => {
                const n = counts ? (counts.get(tag.slug) || 0)
                  : (mode === 'word' ? tag.word_count : tag.notebook_count);
                return (
                  <TagChip
                    key={tag.slug}
                    tag={tag}
                    active={selected.includes(tag.slug)}
                    onClick={() => onToggle(tag.slug)}
                    title={`${n} ${mode === 'word' ? 'từ' : 'sổ tay'}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {selected.length > 1 && (
          <p className="tag-col-hint">
            Cùng nhóm: "hoặc" · khác nhóm: "và"
          </p>
        )}
      </div>
    </div>
  );
}
