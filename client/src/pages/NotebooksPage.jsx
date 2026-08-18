import { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotebooks, fetchNotebookVocabs, fetchVocabCount } from '../api';
import { AuthContext } from '../context/AuthContext';
import NotebookGrid from '../components/NotebookGrid';
import VocabList from '../components/VocabList';
import SpacedRepetitionPanel from '../components/SpacedRepetitionPanel';
import SearchBar from '../components/SearchBar';
import CreateNotebookModal from '../components/CreateNotebookModal';
import AddVocabModal from '../components/AddVocabModal';
import EditVocabModal from '../components/EditVocabModal';

export default function NotebooksPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState([]);
  const [activeNb, setActiveNb] = useState(null);
  const [vocabs, setVocabs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalResults, setGlobalResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddVocabModal, setShowAddVocabModal] = useState(false);
  const [editingVocab, setEditingVocab] = useState(null);
  const [vocabs_length, setVocabLength] = useState(0);

  useEffect(() => {
    fetchNotebooks().then(data => {
      setNotebooks(data.notebooks || []);
      if (data.notebooks?.length > 0) {
        setActiveNb(data.notebooks[0].id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeNb && !globalResults) {
      setLoading(true);
      fetchNotebookVocabs(activeNb).then(data => {
        setVocabs(data.vocabs || []);
        setVocabLength(data.vocabs.length);
        setLoading(false);
      });
    }
  }, [activeNb, user, globalResults]);

  useEffect(() => {
    if(!activeNb) {
      fetchVocabCount().then(data => {setVocabLength(data.total);});
    }
  });

  const handleSearchResults = useCallback((resultsOrQuery, isGlobal) => {
    if (isGlobal) {
      setGlobalResults(resultsOrQuery);
    } else {
      setGlobalResults(null);
      setSearchQuery(resultsOrQuery);
    }
  }, []);

  return (
    <div className="notebooks-page-container">
      <div className="notebooks-top-layout">
        {/* LEFT COLUMN: Dynamic content (Notebooks OR Vocabs) */}
        <div className="notebooks-col">
          <div className="notebooks-col-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Title and Back button row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {(activeNb || globalResults || searchQuery) ? (
                <>
                  <button className="btn-outline" onClick={() => { setActiveNb(null); setGlobalResults(null); setSearchQuery(''); }}>
                    <i className="fa-solid fa-arrow-left"></i> Quay lại
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 className="section-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                      {globalResults ? 'Kết quả tìm kiếm toàn cầu' : notebooks.find(n => n.id.toString() === activeNb)?.title}
                    </h2>
                    {!globalResults && activeNb && (
                      <button className="icon-btn" onClick={() => setShowAddVocabModal(true)} title="Thêm từ vựng">
                        <i className="fa-solid fa-plus"></i>
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
                </div>
              )}
            </div>
            
            {/* Search Bar and Actions Row */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <SearchBar onResults={handleSearchResults} notebookId={activeNb} />
              </div>
              {!globalResults && activeNb && (
                <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => navigate(`/study/${activeNb}`)}>
                  <i className="fa-solid fa-play"></i> Học sổ tay này
                </button>
              )}
            </div>
          </div>

          <div className="notebooks-col-scrollable">
            {(!activeNb && !globalResults && !searchQuery) ? (
              <NotebookGrid notebooks={notebooks} activeId={activeNb} onSelect={setActiveNb} />
            ) : loading ? (
              <div className="loading-state">Đang tải dữ liệu...</div>
            ) : globalResults ? (
              <VocabList vocabs={globalResults} searchQuery="" onEdit={v => setEditingVocab(v)} />
            ) : activeNb ? (
              <VocabList vocabs={vocabs} searchQuery={searchQuery} onEdit={v => setEditingVocab(v)} />
            ) : (
              <div className="text-center" style={{ color: 'var(--text-soft)', padding: '2rem 0' }}>
                Chọn một sổ tay hoặc tìm kiếm từ vựng.
              </div>
            )}
          </div>
        </div>
        
        {/* RIGHT COLUMN: Spaced Repetition Panel */}
        <div className="sr-col">
          <SpacedRepetitionPanel selected_notebook={activeNb} all_vocab_count={vocabs_length}/>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateNotebookModal 
          onClose={() => setShowCreateModal(false)} 
          onSuccess={(newNb) => {
            setNotebooks([...notebooks, { ...newNb, vocab_count: 0 }]);
            setShowCreateModal(false);
            setActiveNb(newNb.id);
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

      {editingVocab && (
        <EditVocabModal
          vocab={editingVocab}
          onClose={() => setEditingVocab(null)}
          onSuccess={(updatedVocab) => {
            // Update in vocabs list if present
            setVocabs(prev => prev.map(v => v.id === updatedVocab.id ? { ...v, ...updatedVocab } : v));
            // Update in global results if present
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
