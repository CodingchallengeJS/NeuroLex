import VocabCard from './VocabCard';

export default function VocabList({ vocabs, searchQuery }) {
  const filtered = vocabs.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (v.word && v.word.toLowerCase().includes(q)) ||
      (v.meaning && v.meaning.toLowerCase().includes(q)) ||
      (v.english_meaning && v.english_meaning.toLowerCase().includes(q)) ||
      (v.vietnamese_meaning && v.vietnamese_meaning.toLowerCase().includes(q))
    );
  });

  if (filtered.length === 0) {
    return <div className="empty-state">Không tìm thấy từ vựng nào.</div>;
  }

  return (
    <div className="vocab-list">
      {filtered.map((v, idx) => (
        <VocabCard key={`${v.id}-${idx}`} vocab={v} />
      ))}
    </div>
  );
}
