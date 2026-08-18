import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotebooks, fetchRepetitionSummary, splitChunk } from '../api';
import { AuthContext } from '../context/AuthContext';
import VocabularyProgressChart from './VocabProgressChart'
//import { PieChart, PieSlice, PieCenter } from "@bklitui/ui/charts";

export default function SpacedRepetitionPanel({ selected_notebook, all_vocab_count }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState([]);
  const [selectedNb, setSelectedNb] = useState(selected_notebook || '');
  const [summary, setSummary] = useState(null);
  const [allVocabCount, setAllVocabCount] = useState(all_vocab_count || 0);

  useEffect(() => {
    if (user) {
      fetchNotebooks().then(data => setNotebooks(data.notebooks || []));
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchRepetitionSummary(selectedNb || null).then(setSummary);
    }
  }, [user, selectedNb]);

  useEffect(() => {
    if (selected_notebook != selectedNb) {
      setSelectedNb(selected_notebook);
    }
  }, [selected_notebook]);

  useEffect(() => {
    if (all_vocab_count != allVocabCount ) {
      setAllVocabCount(all_vocab_count);
    }
  }, [all_vocab_count]);

  if (!user) {
    return (
      <div className="sr-panel card">
        <h3 className="sr-title"><i className="fa-solid fa-brain"></i> Spaced Repetition</h3>
        <p>Vui lòng đăng nhập để sử dụng tính năng ôn tập.</p>
      </div>
    );
  }

  const handleStartReview = (bucket) => {
    let url = `/quiz/${bucket}`;
    if (selectedNb) url += `?notebook_id=${selectedNb}`;
    navigate(url);
  };

  const dueNow = summary?.due_now || 0;

  const total = dueNow + (summary?.due_1 || 0) + (summary?.due_3 || 0) + (summary?.due_7 || 0) + (summary?.due_14 || 0) + (summary?.mastered || 0);

  return (
    <div className="sr-panel card">
      <h3 className="sr-title"><i className="fa-solid fa-brain"></i> Spaced Repetition</h3>
      
      {/* <div className="sr-filter">
        <select value={selectedNb} onChange={e => setSelectedNb(e.target.value)} className="form-select">
          <option value="">Tất cả sổ tay</option>
          {notebooks.map(nb => (
            <option key={nb.id} value={nb.id}>{nb.title}</option>
          ))}
        </select>
      </div> */}
      <VocabularyProgressChart summary={summary} learnedWords={total} total_words={allVocabCount} selected_nb={selectedNb} onStartReview={true} />
      {/* <div className="sr-buckets">
        <div className="sr-bucket" onClick={() => handleStartReview('due_now')}>
          <div className="bucket-icon text-danger"><i className="fa-solid fa-fire"></i></div>
          <div className="bucket-info">
            <h4>Ôn tập ngay</h4>
            <span className="count text-danger">{dueNow} từ</span>
          </div>
        </div>
        <div className="sr-bucket" onClick={() => handleStartReview('due_1')}>
          <div className="bucket-icon text-warning"><i className="fa-solid fa-sun"></i></div>
          <div className="bucket-info">
            <h4>Ngày mai</h4>
            <span className="count text-warning">{summary?.due_1 || 0} từ</span>
          </div>
        </div>
        <div className="sr-bucket" onClick={() => handleStartReview('due_3')}>
          <div className="bucket-icon text-info"><i className="fa-solid fa-calendar-days"></i></div>
          <div className="bucket-info">
            <h4>3 ngày</h4>
            <span className="count text-info">{summary?.due_3 || 0} từ</span>
          </div>
        </div>
        <div className="sr-bucket" onClick={() => handleStartReview('due_7')}>
          <div className="bucket-icon text-primary"><i className="fa-solid fa-calendar-week"></i></div>
          <div className="bucket-info">
            <h4>7 ngày</h4>
            <span className="count text-primary">{summary?.due_7 || 0} từ</span>
          </div>
        </div>
        <div className="sr-bucket" onClick={() => handleStartReview('due_14')}>
          <div className="bucket-icon text-success"><i className="fa-solid fa-seedling"></i></div>
          <div className="bucket-info">
            <h4>14 ngày</h4>
            <span className="count text-success">{summary?.due_14 || 0} từ</span>
          </div>
        </div>
        <div className="sr-bucket" onClick={() => handleStartReview('mastered')}>
          <div className="bucket-icon text-mastered"><i className="fa-solid fa-crown"></i></div>
          <div className="bucket-info">
            <h4>Nhớ sâu</h4>
            <span className="count text-mastered">{summary?.mastered || 0} từ</span>
          </div>
        </div>
      </div> */}

      <button 
        className="btn-primary w-100 mt-3" 
        disabled={dueNow === 0}
        onClick={() => handleStartReview('due_now')}
      >
        <i className="fa-solid fa-play"></i> Ôn tập hôm nay ({dueNow})
      </button>

      <button 
        className="btn-outline w-100 mt-2" 
        disabled={dueNow === 0}
        onClick={async () => {
          try {
            const res = await splitChunk();
            const data = await fetchNotebooks();
            setNotebooks(data.notebooks || []);
            setSelectedNb(res.notebook_id.toString());
            alert(`Đã tạo Chunk sổ tay với ${res.word_count} từ! Vui lòng chọn sổ tay Chunk ở trên và bắt đầu học.`);
          } catch (e) {
            alert(e.message || 'Lỗi khi tạo chunk');
          }
        }}
      >
        <i className="fa-solid fa-cut"></i> Cắt 30 từ (Tạo Chunk)
      </button>
    </div>
  );
}
