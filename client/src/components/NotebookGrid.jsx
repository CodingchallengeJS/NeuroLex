import TagChip from './TagChip';

export default function NotebookGrid({ notebooks, activeId, onSelect }) {
  if (!notebooks || notebooks.length === 0) return <div>Không có sổ tay nào.</div>;

  return (
    <div className="notebook-grid">
      {notebooks.map(nb => {
        // Level reads better as the card's summary line; the rest become chips.
        const tags = Array.isArray(nb.tags) ? nb.tags : [];
        const level = tags.find(t => t.kind === 'level');
        const rest = tags.filter(t => t.kind !== 'level');

        return (
          <div
            key={nb.id}
            className={`notebook-card ${String(activeId) === String(nb.id) ? 'active' : ''}`}
            onClick={() => onSelect(nb.id)}
          >
            <div className="nb-title">{nb.title}</div>

            {rest.length > 0 && (
              <div className="nb-tags">
                {rest.map(t => <TagChip key={t.slug} tag={t} />)}
              </div>
            )}

            <div className="nb-meta">
              {level
                ? <TagChip tag={level} />
                : <span className="badge">{nb.difficulty || 'mixed'}</span>}
              <span className="vocab-count">{nb.vocab_count} từ</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
