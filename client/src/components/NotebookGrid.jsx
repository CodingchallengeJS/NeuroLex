export default function NotebookGrid({ notebooks, activeId, onSelect }) {
  if (!notebooks || notebooks.length === 0) return <div>Không có sổ tay nào.</div>;

  return (
    <div className="notebook-grid">
      {notebooks.map(nb => (
        <div 
          key={nb.id} 
          className={`notebook-card ${activeId === nb.id ? 'active' : ''}`}
          onClick={() => onSelect(nb.id)}
        >
          <div className="nb-title">{nb.title}</div>
          <div className="nb-meta">
            <span className="badge">{nb.difficulty || 'mixed'}</span>
            <span className="vocab-count">{nb.vocab_count} từ</span>
          </div>
        </div>
      ))}
    </div>
  );
}
