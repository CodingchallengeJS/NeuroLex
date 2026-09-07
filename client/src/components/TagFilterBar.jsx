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

// Order the rows so the coarsest filter (which exam) comes first.
const KIND_ORDER = ['exam', 'source', 'level', 'topic', 'function', 'register'];

/**
 * Tag rows grouped by kind, matching how the API filters:
 *   - several tags in the SAME row widen the result (SAT or IELTS)
 *   - tags in DIFFERENT rows narrow it (IELTS and from Magoosh)
 * Nothing is both SAT and IELTS, so ANDing within a row would only ever return
 * an empty list.
 */
export default function TagFilterBar({ tags, selected, onToggle, onClear }) {
  const grouped = useMemo(() => {
    const byKind = new Map();
    for (const tag of tags || []) {
      // A tag nothing uses would just be a dead end in the filter bar.
      if (!tag.notebook_count) continue;
      if (!byKind.has(tag.kind)) byKind.set(tag.kind, []);
      byKind.get(tag.kind).push(tag);
    }
    return KIND_ORDER
      .filter(kind => byKind.has(kind))
      .map(kind => [kind, byKind.get(kind)]);
  }, [tags]);

  if (grouped.length === 0) return null;

  return (
    <div className="tag-filter-bar">
      {grouped.map(([kind, kindTags]) => (
        <div className="tag-filter-row" key={kind}>
          <span className="tag-filter-kind">{KIND_LABELS[kind] || kind}</span>
          <div className="tag-filter-chips">
            {kindTags.map(tag => (
              <TagChip
                key={tag.slug}
                tag={tag}
                active={selected.includes(tag.slug)}
                onClick={() => onToggle(tag.slug)}
                title={`${tag.notebook_count} sổ tay`}
              />
            ))}
          </div>
        </div>
      ))}

      {selected.length > 0 && (
        <div className="tag-filter-row">
          <span className="tag-filter-kind"></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="link-btn" onClick={onClear} style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-xmark" style={{ marginRight: '4px' }}></i>
              Bỏ {selected.length} bộ lọc
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>
              Cùng một hàng: chọn nhiều = "hoặc" · khác hàng: "và"
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
