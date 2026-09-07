import { useState, useEffect } from 'react';
import { createNotebook, fetchTags, setNotebookTags } from '../api';
import TagChip from './TagChip';

const KIND_LABELS = {
  exam: 'Kỳ thi',
  source: 'Nguồn',
  topic: 'Chủ đề',
  level: 'Trình độ',
  function: 'Chức năng',
  register: 'Văn phong'
};
const KIND_ORDER = ['exam', 'source', 'level', 'topic'];

/**
 * Tags are picked from the taxonomy rather than typed. Free-text `topic` and
 * `difficulty` are what produced four competing naming schemes in the first
 * place, so they are no longer offered here.
 */
export default function CreateNotebookModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTags('notebook').then(data => setTags(data.tags || [])).catch(() => {});
  }, []);

  const toggle = (slug) =>
    setSelected(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Vui lòng nhập tên sổ tay');

    setLoading(true);
    try {
      const data = await createNotebook({ title: title.trim(), description });
      // The notebook exists either way; a tag failure should not lose it.
      if (selected.length > 0) {
        try {
          await setNotebookTags(data.notebook.id, selected);
        } catch (tagErr) {
          setError(`Đã tạo sổ tay nhưng chưa gắn được tag: ${tagErr.message}`);
        }
      }
      const chosen = tags.filter(t => selected.includes(t.slug));
      onSuccess({ ...data.notebook, tags: chosen });
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo sổ tay');
    } finally {
      setLoading(false);
    }
  };

  const grouped = KIND_ORDER
    .map(kind => [kind, tags.filter(t => t.kind === kind)])
    .filter(([, list]) => list.length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '520px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
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
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-soft)' }}>Mô tả</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="form-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }} />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-soft)' }}>
              Tag {selected.length > 0 && <span style={{ color: 'var(--primary)' }}>({selected.length})</span>}
            </label>
            {grouped.length === 0 ? (
              <div style={{ color: 'var(--text-soft)', fontSize: '0.85rem' }}>Chưa có tag nào.</div>
            ) : (
              <div className="tag-filter-bar" style={{ marginBottom: 0 }}>
                {grouped.map(([kind, list]) => (
                  <div className="tag-filter-row" key={kind}>
                    <span className="tag-filter-kind">{KIND_LABELS[kind] || kind}</span>
                    <div className="tag-filter-chips">
                      {list.map(tag => (
                        <TagChip
                          key={tag.slug}
                          tag={tag}
                          active={selected.includes(tag.slug)}
                          onClick={() => toggle(tag.slug)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
