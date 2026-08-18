import { useState } from 'react';
import { createNotebook } from '../api';

export default function CreateNotebookModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title) return setError('Vui lòng nhập tên sổ tay');
    
    setLoading(true);
    try {
      const data = await createNotebook({ title, topic, difficulty });
      onSuccess(data.notebook);
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo sổ tay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Tạo sổ tay mới</h2>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        
        {error && <div className="error-message" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-soft)' }}>Tên sổ tay *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-soft)' }}>Chủ đề</label>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-soft)' }}>Độ khó</label>
            <input type="text" value={difficulty} onChange={e => setDifficulty(e.target.value)} placeholder="Ví dụ: Dễ, Trung bình, Khó" className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn-outline" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Đang tạo...' : 'Tạo sổ tay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
