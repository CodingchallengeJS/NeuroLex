import VocabCard from './VocabCard';

export default function VocabList({ vocabs, searchQuery, onEdit }) {
  // If global search is active (searchQuery starts with global: or we just pass it from outside), 
  // we might handle filtering elsewhere, but for now this just filters whatever is passed.
  const filtered = vocabs.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return v.word.toLowerCase().includes(q) || 
           (v.meaning || '').toLowerCase().includes(q) || 
           (v.english_meaning || '').toLowerCase().includes(q) || 
           (v.vietnamese_meaning || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    return <div className="card text-center" style={{ color: 'var(--text-soft)' }}>Không tìm thấy từ vựng nào.</div>;
  }

  return (
    <div className="vocab-list">
      {filtered.map((v, idx) => (
        <VocabCard key={`${v.id}-${idx}`} vocab={v} onEdit={onEdit} />
      ))}
    </div>
  );
}
