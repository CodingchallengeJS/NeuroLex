import { useState } from 'react';
import { updateVocab } from '../api';

export default function EditVocabModal({ vocab, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    word: vocab.word || '',
    meaning: vocab.meaning || '',
    english_meaning: vocab.english_meaning || '',
    vietnamese_meaning: vocab.vietnamese_meaning || '',
    synonyms: vocab.synonyms || '',
    phonetic: vocab.phonetic || '',
    example: vocab.example || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.word) return setError('Vui lòng nhập từ vựng (Word)');
    
    setLoading(true);
    try {
      const data = await updateVocab(vocab.id, formData);
      onSuccess(data.vocab);
    } catch (err) {
      setError(err.message || 'Lỗi khi cập nhật từ vựng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '500px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Sửa từ vựng</h2>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        
        {error && <div className="error-message" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-soft)' }}>Từ vựng (Word) *</label>
            <input type="text" name="word" value={formData.word} onChange={handleChange} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} autoFocus />
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
              {loading ? 'Đang lưu...' : 'Lưu cập nhật'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
