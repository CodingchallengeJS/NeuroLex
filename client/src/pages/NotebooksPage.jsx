import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchNotebooksFiltered, fetchNotebookVocabs, fetchVocabCount, fetchTags, searchVocab
} from '../api';
import { AuthContext } from '../context/AuthContext';
import NotebookGrid from '../components/NotebookGrid';
import TagPanel from '../components/TagPanel';
import VocabList from '../components/VocabList';
import SpacedRepetitionPanel from '../components/SpacedRepetitionPanel';
import SearchInput from '../components/SearchInput';
import CreateNotebookModal from '../components/CreateNotebookModal';
import AddVocabModal from '../components/AddVocabModal';
import EditVocabModal from '../components/EditVocabModal';
import TagManagerModal from '../components/TagManagerModal';
import BulkTagModal from '../components/BulkTagModal';
import { matchesTagSelection, countTagUsage } from '../lib/tagFilter';

export default function NotebooksPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // The global query lives in the URL, owned by the navbar search box.
  const globalQuery = (searchParams.get('q') || '').trim();

  const [notebooks, setNotebooks] = useState([]);
  const [activeNb, setActiveNb] = useState(null);
  const [vocabs, setVocabs] = useState([]);
  const [globalResults, setGlobalResults] = useState(null);
  const [localQuery, setLocalQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddVocabModal, setShowAddVocabModal] = useState(false);
  const [editingVocab, setEditingVocab] = useState(null);
  const [vocabs_length, setVocabLength] = useState(0);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedWordTags, setSelectedWordTags] = useState([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);

  const tagIndex = useMemo(() => new Map((tags || []).map(t => [t.slug, t])), [tags]);

  /* ---------------- data ---------------- */

  useEffect(() => {
    fetchTags().then(data => setTags(data.tags || [])).catch(() => {});
  }, []);

  // Notebook grid, filtered server-side by the selected notebook tags.
  useEffect(() => {
    if (globalQuery) return; // showing search results instead
    let alive = true;
    setLoading(true);
    fetchNotebooksFiltered({ tags: selectedTags })
      .then(data => { if (alive) { setNotebooks(data.notebooks || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selectedTags, globalQuery]);

  // A global search takes over the page: drop the open notebook and its filters
  // so we never show a notebook's words under a search heading.
  useEffect(() => {
    if (!globalQuery) {
      setGlobalResults(null);
      return;
    }
    setActiveNb(null);
    setLocalQuery('');
    setSelectedWordTags([]);

    let alive = true;
    setLoading(true);
    searchVocab(globalQuery, null)
      .then(data => { if (alive) { setGlobalResults(data.vocabs || []); setLoading(false); } })
      .catch(() => { if (alive) { setGlobalResults([]); setLoading(false); } });
    return () => { alive = false; };
  }, [globalQuery]);

  useEffect(() => {
    if (!activeNb || globalQuery) return;
    let alive = true;
    setLoading(true);
    fetchNotebookVocabs(activeNb)
      .then(data => {
        if (!alive) return;
        setVocabs(data.vocabs || []);
        setVocabLength((data.vocabs || []).length);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeNb, user, globalQuery]);

  useEffect(() => {
    if (!activeNb) {
      fetchVocabCount().then(data => setVocabLength(data.total)).catch(() => {});
    }
  }, [activeNb]);

  /* ---------------- actions ---------------- */

  const reloadVocabs = useCallback(() => {
    if (activeNb) {
      fetchNotebookVocabs(activeNb).then(data => setVocabs(data.vocabs || [])).catch(() => {});
    }
  }, [activeNb]);

  // Opening a notebook must reset the previous notebook's local search, which
  // used to linger and immediately re-filter the new list.
  const openNotebook = useCallback((id) => {
    setActiveNb(id);
    setLocalQuery('');
    setSelectedWordTags([]);
  }, []);

  const goBackToGrid = useCallback(() => {
    setActiveNb(null);
    setLocalQuery('');
    setSelectedWordTags([]);
    if (globalQuery) navigate('/notebooks');
  }, [globalQuery, navigate]);

  const toggleNotebookTag = useCallback((slug) => {
    setActiveNb(null);
    setSelectedTags(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }, []);

  const toggleWordTag = useCallback((slug) => {
    setSelectedWordTags(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }, []);

  /* ---------------- derived ---------------- */

  const inNotebook = Boolean(activeNb) && !globalQuery;
  const showingSearch = Boolean(globalQuery);

  const wordSource = showingSearch ? (globalResults || []) : vocabs;

  const visibleWords = useMemo(() => {
    let list = wordSource;
    if (selectedWordTags.length > 0) {
      list = list.filter(v => matchesTagSelection(v.tags, selectedWordTags, tagIndex));
    }
    const q = localQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(v =>
        v.word.toLowerCase().includes(q) ||
        (v.meaning || '').toLowerCase().includes(q) ||
        (v.english_meaning || '').toLowerCase().includes(q) ||
        (v.vietnamese_meaning || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [wordSource, selectedWordTags, localQuery, tagIndex]);

  const wordTagCounts = useMemo(() => countTagUsage(wordSource), [wordSource]);

  const activeTitle = notebooks.find(n => String(n.id) === String(activeNb))?.title;

  /* ---------------- render ---------------- */

  return (
    <div className="notebooks-page-container">
      <div className="notebooks-top-layout">
        {/* LEFT: tag filter, outside the scrolling list so it stays put */}
        <TagPanel
          mode={inNotebook || showingSearch ? 'word' : 'notebook'}
          tags={tags}
          selected={inNotebook || showingSearch ? selectedWordTags : selectedTags}
          onToggle={inNotebook || showingSearch ? toggleWordTag : toggleNotebookTag}
          onClear={() => (inNotebook || showingSearch ? setSelectedWordTags([]) : setSelectedTags([]))}
          counts={inNotebook || showingSearch ? wordTagCounts : null}
        />

        {/* MIDDLE: notebooks, or the words inside one */}
        <div className="notebooks-col">
          <div className="notebooks-col-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              {(inNotebook || showingSearch) ? (
                <>
                  <button className="btn-outline" onClick={goBackToGrid}>
                    <i className="fa-solid fa-arrow-left"></i> Quay lại
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 className="section-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                      {showingSearch ? `Kết quả cho "${globalQuery}"` : activeTitle}
                    </h2>
                    {inNotebook && (
                      <button className="icon-btn" onClick={() => setShowAddVocabModal(true)} title="Thêm từ vựng">
                        <i className="fa-solid fa-plus"></i>
                      </button>
                    )}
                    {user?.isAdmin && wordSource.length > 0 && (
                      <button className="icon-btn" onClick={() => setShowBulkTag(true)} title="Gắn tag hàng loạt">
                        <i className="fa-solid fa-tags"></i>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h2 className="section-title" style={{ margin: 0 }}>Sổ tay từ vựng</h2>
                  <button className="icon-btn" onClick={() => setShowCreateModal(true)} title="Tạo sổ tay mới">
                    <i className="fa-solid fa-plus"></i>
                  </button>
                  {user?.isAdmin && (
                    <button className="icon-btn" onClick={() => setShowTagManager(true)} title="Quản lý tag">
                      <i className="fa-solid fa-tags"></i>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Local search: only inside a list of words. Global search lives in the navbar. */}
            {(inNotebook || showingSearch) && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <SearchInput
                    value={localQuery}
                    onChange={setLocalQuery}
                    onClear={() => setLocalQuery('')}
                    placeholder={showingSearch ? 'Lọc trong kết quả tìm kiếm...' : 'Tìm kiếm trong sổ tay hiện tại...'}
                  />
                </div>
                {inNotebook && (
                  <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => navigate(`/study/${activeNb}`)}>
                    <i className="fa-solid fa-play"></i> Học sổ tay này
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="notebooks-col-scrollable">
            {loading ? (
              <div className="loading-state">Đang tải dữ liệu...</div>
            ) : (inNotebook || showingSearch) ? (
              visibleWords.length === 0 ? (
                <div className="empty-state">
                  {wordSource.length === 0
                    ? 'Không tìm thấy từ vựng nào.'
                    : 'Không có từ nào khớp bộ lọc hiện tại.'}
                </div>
              ) : (
                <VocabList vocabs={visibleWords} searchQuery="" onEdit={v => setEditingVocab(v)} />
              )
            ) : notebooks.length === 0 ? (
              <div className="empty-state">
                Không có sổ tay nào khớp bộ lọc.{' '}
                <button className="link-btn" onClick={() => setSelectedTags([])}>Bỏ bộ lọc</button>
              </div>
            ) : (
              <NotebookGrid notebooks={notebooks} activeId={activeNb} onSelect={openNotebook} />
            )}
          </div>
        </div>

        {/* RIGHT: spaced repetition */}
        <div className="sr-col">
          <SpacedRepetitionPanel selected_notebook={activeNb} all_vocab_count={vocabs_length} />
        </div>
      </div>

      {showCreateModal && (
        <CreateNotebookModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(newNb) => {
            setNotebooks([...notebooks, { ...newNb, vocab_count: 0, tags: newNb.tags || [] }]);
            setShowCreateModal(false);
            openNotebook(newNb.id);
          }}
        />
      )}

      {showAddVocabModal && activeNb && (
        <AddVocabModal
          notebookId={activeNb}
          onClose={() => setShowAddVocabModal(false)}
          onSuccess={(newVocab) => {
            setVocabs(prev => [...prev, newVocab]);
            setShowAddVocabModal(false);
          }}
        />
      )}

      {showTagManager && (
        <TagManagerModal
          onClose={() => setShowTagManager(false)}
          onChanged={() => {
            fetchTags().then(data => setTags(data.tags || [])).catch(() => {});
            fetchNotebooksFiltered({ tags: selectedTags })
              .then(data => setNotebooks(data.notebooks || []))
              .catch(() => {});
            reloadVocabs();
          }}
        />
      )}

      {showBulkTag && (
        <BulkTagModal
          vocabs={visibleWords}
          onClose={() => setShowBulkTag(false)}
          onApplied={() => {
            reloadVocabs();
            fetchTags().then(data => setTags(data.tags || [])).catch(() => {});
          }}
        />
      )}

      {editingVocab && (
        <EditVocabModal
          vocab={editingVocab}
          onClose={() => setEditingVocab(null)}
          onSuccess={(updatedVocab) => {
            setVocabs(prev => prev.map(v => v.id === updatedVocab.id ? { ...v, ...updatedVocab } : v));
            if (globalResults) {
              setGlobalResults(prev => prev.map(v => v.id === updatedVocab.id ? { ...v, ...updatedVocab } : v));
            }
            setEditingVocab(null);
          }}
        />
      )}
    </div>
  );
}
