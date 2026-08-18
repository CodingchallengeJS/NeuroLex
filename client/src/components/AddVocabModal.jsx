import { useState, useEffect, useRef } from 'react';
import { addVocabToNotebook, searchVocab } from '../api';

export default function AddVocabModal({ notebookId, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    word: '',
    meaning: '',
    english_meaning: '',
    vietnamese_meaning: '',
    synonyms: '',
    phonetic: '',
    example: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(0);

  // Fetch suggestions when word changes
  useEffect(() => {
    if (!formData.word.trim()) {
      setSuggestions([]);
      return;
    }
    
    // Only fetch if we are actually typing, don't fetch if we just selected a word
    const currentRef = ++searchRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await searchVocab(formData.word, null);
        if (currentRef === searchRef.current) {
          // Filter exact matches or close matches
          setSuggestions(data.vocabs || []);
        }
      } catch (err) {
        // ignore
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [formData.word]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === 'word') {
      setShowSuggestions(true);
    }
  };

  const selectSuggestion = (v) => {
    setFormData({
      word: v.word || '',
      meaning: v.meaning || '',
      english_meaning: v.english_meaning || '',
      vietnamese_meaning: v.vietnamese_meaning || '',
      synonyms: v.synonyms || '',
      phonetic: v.phonetic || '',
      example: v.example || ''
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.word) return setError('Vui lòng nhập từ vựng (Word)');
    
    setLoading(true);
    try {
      const data = await addVocabToNotebook(notebookId, formData);
      onSuccess(data.vocab);
    } catch (err) {
      setError(err.message || 'Lỗi khi thêm từ vựng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="modal-content card" onClick={e => { e.stopPropagation(); setShowSuggestions(false); }} style={{ width: '90%', maxWidth: '500px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Thêm từ vựng</h2>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        
        {error && <div className="error-message" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Từ vựng (Word) *</label>
            <input 
              type="text" 
              name="word" 
              value={formData.word} 
              onChange={handleChange} 
              onFocus={() => setShowSuggestions(true)}
              onClick={e => e.stopPropagation()}
              className="form-input" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} 
              autoFocus 
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: '200px', overflowY: 'auto', marginTop: '4px', padding: '0.5rem 0' }}>
                {suggestions.map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => selectSuggestion(s)}
                    style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: 'bold' }}>{s.word} <span style={{ fontWeight: 'normal', color: 'var(--text-soft)', fontSize: '0.9rem' }}>{s.phonetic}</span></div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.vietnamese_meaning || s.meaning || s.english_meaning}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Phát âm (Phonetic)</label>
              <input type="text" name="phonetic" value={formData.phonetic} onChange={handleChange} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Từ đồng nghĩa</label>
              <input type="text" name="synonyms" value={formData.synonyms} onChange={handleChange} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Nghĩa Tiếng Anh</label>
            <textarea name="english_meaning" value={formData.english_meaning} onChange={handleChange} className="form-input" rows="2" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', resize: 'vertical' }}></textarea>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Nghĩa Tiếng Việt</label>
            <textarea name="vietnamese_meaning" value={formData.vietnamese_meaning} onChange={handleChange} className="form-input" rows="2" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', resize: 'vertical' }}></textarea>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Nghĩa ngắn gọn</label>
            <input type="text" name="meaning" value={formData.meaning} onChange={handleChange} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Ví dụ (Example)</label>
            <textarea name="example" value={formData.example} onChange={handleChange} className="form-input" rows="2" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', resize: 'vertical' }}></textarea>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn-outline" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu từ vựng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
