import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchReviewSequence, submitReviewStep } from '../api';

export default function StudyPage() {
  const { notebookId } = useParams();
  const navigate = useNavigate();
  
  const [vocabs, setVocabs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchReviewSequence(notebookId)
      .then(res => {
        if (!active) return;
        setVocabs(res.vocabs || []);
        setCurrentIndex(res.currentIndex || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [notebookId]);

  if (loading) return <div className="loading-state">Đang tải sổ tay...</div>;
  if (vocabs.length === 0) return <div className="empty-state">Sổ tay này chưa có từ vựng. <button className="btn-outline ml-2" onClick={() => navigate('/notebooks')}>Quay lại</button></div>;

  const word = vocabs[currentIndex];

  const playAudio = (e) => {
    e.stopPropagation();
    if (!word || !word.word) return;
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleReveal = () => setRevealed(true);

  const handleResult = async (correctCount) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await submitReviewStep(notebookId, word.id, correctCount);
      setCurrentIndex(res.nextIndex);
      setRevealed(false);
    } catch (e) {
      console.error(e);
      alert('Lỗi khi nộp kết quả');
    }
    setSubmitting(false);
  };

  return (
    <div className="study-page-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <button className="btn-outline" onClick={() => navigate('/notebooks')}>
          <i className="fa-solid fa-arrow-left"></i> Thoát
        </button>
        <span className="text-soft">Tiến độ: {currentIndex + 1} / {vocabs.length}</span>
      </div>

      <div className="card study-card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>{word.word}</h1>
        {word.phonetic && (
          <div style={{ fontSize: '1.2rem', color: 'var(--text-soft)', marginBottom: '1rem', fontFamily: 'monospace' }}>
            {word.phonetic}
            <button className="icon-btn" onClick={playAudio} style={{ marginLeft: '10px' }}>
              <i className="fa-solid fa-volume-high"></i>
            </button>
          </div>
        )}

        {!revealed ? (
          <button className="btn-primary" onClick={handleReveal} style={{ marginTop: '2rem', width: '200px' }}>
            <i className="fa-solid fa-eye" style={{ marginRight: '8px' }}></i> Xem nghĩa
          </button>
        ) : (
          <div className="study-meanings" style={{ width: '100%', marginTop: '2rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem', textAlign: 'left' }}>
            {word.english_meaning && <p style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}><span className="lang-tag">EN</span> {word.english_meaning}</p>}
            {word.vietnamese_meaning && <p style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text)' }}><span className="lang-tag">VI</span> {word.vietnamese_meaning}</p>}
            {(!word.english_meaning && !word.vietnamese_meaning && word.meaning) && <p style={{ fontSize: '1.1rem', color: 'var(--text)' }}>{word.meaning}</p>}
            
            {word.example && (
              <div className="vc-examples" style={{ marginTop: '1rem', background: 'var(--surface-soft)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  <i className="fa-solid fa-quote-left" style={{ marginRight: '6px' }}></i> Ví dụ (Examples)
                </div>
                <ul style={{ paddingLeft: '1.25rem', margin: '4px 0', fontStyle: 'italic', color: 'var(--text-soft)' }}>
                  {word.example.split('\n').map((ex, idx) => (
                    <li key={idx} className="example-text" style={{ marginBottom: '4px' }}>{ex}</li>
                  ))}
                </ul>
              </div>
            )}

            {word.synonyms && (
              <div className="vc-synonyms" style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: 600, marginRight: '4px' }}>
                  <i className="fa-solid fa-tags" style={{ marginRight: '4px' }}></i> Đồng nghĩa:
                </span>
                {word.synonyms.split(',').map(s => s.trim()).filter(Boolean).map((syn, idx) => (
                  <span key={idx} className="chip">{syn}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
              <button className="btn-outline" onClick={() => handleResult(0)} disabled={submitting} style={{ borderColor: 'var(--danger)', color: 'var(--danger)', flex: 1, padding: '0.75rem' }}>
                <i className="fa-solid fa-xmark" style={{ marginRight: '6px' }}></i> Chưa thuộc
              </button>
              <button className="btn-primary" onClick={() => handleResult(2)} disabled={submitting} style={{ background: 'var(--success)', borderColor: 'var(--success)', flex: 1, padding: '0.75rem' }}>
                <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i> Đã thuộc
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
