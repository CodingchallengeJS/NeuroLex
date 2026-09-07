import { useState, useEffect, useMemo } from 'react';
import { fetchTags, bulkTagVocabs } from '../api';
import TagChip from './TagChip';

/**
 * Applies or removes one tag across many words at once.
 *
 * Hand-tagging 2869 words one at a time is not realistic, so this works on the
 * word list the admin is currently looking at: filter it, select what belongs,
 * apply the tag in a single request.
 */
export default function BulkTagModal({ vocabs, onClose, onApplied }) {
  const [tags, setTags] = useState([]);
  const [tagSlug, setTagSlug] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    fetchTags('word')
      .then(data => {
        setTags(data.tags || []);
        if (data.tags?.length) setTagSlug(data.tags[0].slug);
      })
      .catch(err => setError(err.message));
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return vocabs;
    return vocabs.filter(v =>
      v.word.toLowerCase().includes(q) ||
      (v.english_meaning || '').toLowerCase().includes(q) ||
      (v.vietnamese_meaning || '').toLowerCase().includes(q)
    );
  }, [vocabs, filter]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllShown = () => setSelected(prev => {
    const next = new Set(prev);
    shown.forEach(v => next.add(v.id));
    return next;
  });

  const run = async (action) => {
    setError('');
    setResult('');
    if (!tagSlug) return setError('Chọn một tag');
    if (selected.size === 0) return setError('Chưa chọn từ nào');

    setBusy(true);
    try {
      const res = await bulkTagVocabs(tagSlug, [...selected], action);
      setResult(
        action === 'add'
          ? `Đã gắn "${tagSlug}" cho ${res.affected}/${res.requested} từ.`
          : `Đã gỡ "${tagSlug}" khỏi ${res.affected} từ.`
      );
      setSelected(new Set());
      if (onApplied) onApplied();
    } catch (err) {
      setError(err.message || 'Lỗi khi gắn tag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '92%' }}>
        <div className="modal-header">
          <h3>Gắn tag hàng loạt</h3>
          <button className="close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="modal-body">
          {error && <div className="error-alert">{error}</div>}
          {result && <div style={{ color: 'var(--success)', marginBottom: '0.75rem' }}>{result}</div>}

          <div className="form-group">
            <label>Tag</label>
            <div className="tag-filter-chips" style={{ marginTop: '0.35rem' }}>
              {tags.length === 0
                ? <span style={{ color: 'var(--text-soft)', fontSize: '0.85rem' }}>Chưa có tag cho từ vựng.</span>
                : tags.map(t => (
                    <TagChip key={t.slug} tag={t} active={tagSlug === t.slug} onClick={() => setTagSlug(t.slug)} title={`${t.word_count} từ`} />
                  ))}
            </div>
          </div>

          <div className="form-group">
            <label>Lọc trong {vocabs.length} từ đang xem</label>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Gõ để lọc..."
              style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>
              Đã chọn <strong style={{ color: 'var(--primary)' }}>{selected.size}</strong> · hiển thị {shown.length}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="link-btn" onClick={selectAllShown} style={{ fontSize: '0.8rem' }}>Chọn tất cả đang hiện</button>
              <button className="link-btn" onClick={() => setSelected(new Set())} style={{ fontSize: '0.8rem' }}>Bỏ chọn</button>
            </div>
          </div>

          <div className="bulk-tag-list">
            {shown.length === 0 ? (
              <div style={{ color: 'var(--text-soft)', padding: '0.5rem' }}>Không có từ nào khớp.</div>
            ) : shown.map(v => (
              <label className="bulk-tag-row" key={v.id}>
                <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} />
                <span className="bulk-tag-word">{v.word}</span>
                <span className="bulk-tag-meaning">
                  {v.english_meaning || v.vietnamese_meaning || v.meaning || ''}
                </span>
                {Array.isArray(v.tags) && v.tags.length > 0 && (
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    {v.tags.map(t => <TagChip key={t.slug} tag={t} />)}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn-outline" onClick={() => run('remove')} disabled={busy || selected.size === 0}>
              Gỡ tag
            </button>
            <button className="btn-primary" onClick={() => run('add')} disabled={busy || selected.size === 0}>
              {busy ? 'Đang lưu...' : `Gắn tag cho ${selected.size} từ`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
