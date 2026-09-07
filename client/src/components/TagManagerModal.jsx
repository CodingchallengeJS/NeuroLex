import { useState, useEffect } from 'react';
import { fetchTags, createTag, updateTag, deleteTag } from '../api';
import TagChip from './TagChip';

const KINDS = ['exam', 'source', 'topic', 'level', 'function', 'register'];
const SCOPES = [
  { value: 'notebook', label: 'Sổ tay' },
  { value: 'word', label: 'Từ vựng' },
  { value: 'both', label: 'Cả hai' }
];

const inputStyle = {
  padding: '0.5rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--line)',
  background: 'var(--surface-soft)',
  color: 'var(--text)'
};

/** Admin-only tag CRUD: create, rename, recategorise, delete. */
export default function TagManagerModal({ onClose, onChanged }) {
  const [tags, setTags] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ label: '', kind: 'topic', scope: 'both' });
  const [creating, setCreating] = useState({ slug: '', label: '', kind: 'topic', scope: 'both' });
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchTags().then(data => setTags(data.tags || [])).catch(err => setError(err.message));

  useEffect(() => { reload(); }, []);

  const notify = () => { reload(); if (onChanged) onChanged(); };

  const startEdit = (tag) => {
    setError('');
    setEditingId(tag.id);
    setDraft({ label: tag.label, kind: tag.kind, scope: tag.scope });
  };

  const saveEdit = async (tag) => {
    setError('');
    setBusy(true);
    try {
      await updateTag(tag.id, draft);
      setEditingId(null);
      notify();
    } catch (err) {
      setError(err.message || 'Lỗi khi đổi tên tag');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag) => {
    const used = tag.notebook_count + tag.word_count;
    const warning = used > 0
      ? `Tag "${tag.label}" đang gắn với ${tag.notebook_count} sổ tay và ${tag.word_count} từ.\n\nXoá tag sẽ gỡ các liên kết đó. Sổ tay và từ vựng KHÔNG bị xoá.\n\nTiếp tục?`
      : `Xoá tag "${tag.label}"?`;
    if (!window.confirm(warning)) return;

    setError('');
    setBusy(true);
    try {
      await deleteTag(tag.id);
      notify();
    } catch (err) {
      setError(err.message || 'Lỗi khi xoá tag');
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createTag(creating);
      setCreating({ slug: '', label: '', kind: 'topic', scope: 'both' });
      setShowCreate(false);
      notify();
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo tag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '92%' }}>
        <div className="modal-header">
          <h3>Quản lý tag</h3>
          <button className="close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <div className="error-alert">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn-outline btn-sm" onClick={() => setShowCreate(v => !v)}>
              <i className="fa-solid fa-plus" style={{ marginRight: '6px' }}></i>Tag mới
            </button>
          </div>

          {showCreate && (
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
              <input
                type="text" placeholder="slug, ví dụ topic:biology" required
                value={creating.slug}
                onChange={e => setCreating({ ...creating, slug: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text" placeholder="Tên hiển thị" required
                value={creating.label}
                onChange={e => setCreating({ ...creating, label: e.target.value })}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <select value={creating.kind} onChange={e => setCreating({ ...creating, kind: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={creating.scope} onChange={e => setCreating({ ...creating, scope: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  {SCOPES.map(sc => <option key={sc.value} value={sc.value}>{sc.label}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary btn-sm" disabled={busy}>Tạo</button>
            </form>
          )}

          {tags.map(tag => (
            <div className="tag-manager-row" key={tag.id}>
              {editingId === tag.id ? (
                <>
                  <input
                    type="text" value={draft.label}
                    onChange={e => setDraft({ ...draft, label: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }} autoFocus
                  />
                  <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })} style={inputStyle}>
                    {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value })} style={inputStyle}>
                    {SCOPES.map(sc => <option key={sc.value} value={sc.value}>{sc.label}</option>)}
                  </select>
                  <button className="icon-btn" onClick={() => saveEdit(tag)} disabled={busy} title="Lưu">
                    <i className="fa-solid fa-check" style={{ color: 'var(--success)' }}></i>
                  </button>
                  <button className="icon-btn" onClick={() => setEditingId(null)} title="Huỷ">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </>
              ) : (
                <>
                  <TagChip tag={tag} />
                  <code style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>{tag.slug}</code>
                  <span className="tag-manager-usage" style={{ marginLeft: 'auto' }}>
                    {tag.notebook_count} sổ · {tag.word_count} từ
                  </span>
                  <button className="icon-btn" onClick={() => startEdit(tag)} title="Đổi tên">
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button className="icon-btn" onClick={() => remove(tag)} title="Xoá tag">
                    <i className="fa-solid fa-trash" style={{ color: 'var(--danger)' }}></i>
                  </button>
                </>
              )}
            </div>
          ))}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-soft)', marginTop: '1rem' }}>
            Slug không đổi được — các script seed và bộ lọc đã lưu đều tham chiếu tới nó.
            Đổi tên chỉ đổi phần hiển thị.
          </p>
        </div>
      </div>
    </div>
  );
}
