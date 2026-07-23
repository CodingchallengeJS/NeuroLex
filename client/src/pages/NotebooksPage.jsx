import { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotebooks, fetchNotebookVocabs } from '../api';
import { AuthContext } from '../context/AuthContext';
import NotebookGrid from '../components/NotebookGrid';
import VocabList from '../components/VocabList';
import SpacedRepetitionPanel from '../components/SpacedRepetitionPanel';
import SearchBar from '../components/SearchBar';

export default function NotebooksPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState([]);
  const [activeNb, setActiveNb] = useState(null);
  const [vocabs, setVocabs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalResults, setGlobalResults] = useState(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      });
    }
  }, [activeNb, user, globalResults]);

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
                  <h2 className="section-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                    {globalResults ? 'Kết quả tìm kiếm toàn cầu' : notebooks.find(n => n.id.toString() === activeNb)?.title}
                  </h2>
                </>
              ) : (
                <h2 className="section-title" style={{ margin: 0 }}>Sổ tay từ vựng</h2>
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
            ) : (
              <VocabList 
                vocabs={globalResults || vocabs} 
                searchQuery={globalResults ? '' : searchQuery} 
              />
            )}
          </div>
        </div>
        
        {/* RIGHT COLUMN: Spaced Repetition Panel */}
        <div className="sr-col">
          <SpacedRepetitionPanel />
        </div>
      </div>
    </div>
  );
}
