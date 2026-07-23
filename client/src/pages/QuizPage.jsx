import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { generateQuiz, submitQuiz } from '../api';
import QuizQuestion from '../components/QuizQuestion';

export default function QuizPage() {
  const { bucket } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const searchParams = new URLSearchParams(location.search);
  const notebookId = searchParams.get('notebook_id');

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  
  const [correctCounts, setCorrectCounts] = useState({});
  const [quizFinished, setQuizFinished] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    generateQuiz(bucket, notebookId).then(data => {
      // 1. Map data.words theo từ vựng (chữ tiếng Anh) thay vì ID
      const wordsMap = {};
      (data.words || []).forEach(w => { 
        wordsMap[w.word] = w; // Dùng w.word làm chìa khóa
      });

      // 2. Nhồi thêm example và synonyms từ wordsMap vào từng option
      const enrichedQuestions = (data.questions || []).map(q => ({
        ...q,
        options: (q.options || []).map(opt => {
          // Lấy đúng từ tiếng Anh dựa theo type của câu hỏi
          const optionWord = q.type === 'meaning_to_word' ? opt.text : opt.word;
          const wordDetail = wordsMap[optionWord] || {};
          
          return {
            ...opt,
            example: opt.example || wordDetail.example,
            synonyms: opt.synonyms || wordDetail.synonyms
          };
        })
      }));

      setQuestions(enrichedQuestions);

      const initialCounts = {};
      (data.words || []).forEach(w => { initialCounts[w.id] = 0; });
      setCorrectCounts(initialCounts);
      setLoading(false);
    }).catch(() => {
      setQuestions([]);
      setLoading(false);
    });
  }, [bucket, notebookId]);

  const handleAnswer = (key) => {
    setSelectedKey(key);
    setShowResult(true);

    const q = questions[currentIndex];
    if (key === q.correct_key) {
      setCorrectCounts(prev => ({
        ...prev,
        [q.vocab_id]: prev[q.vocab_id] + 1
      }));
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowResult(false);
      setSelectedKey(null);
    } else {
      setQuizFinished(true);
      submitResults();
    }
  };

  const submitResults = async () => {
    const results = Object.entries(correctCounts).map(([vocab_id, correct_count]) => ({
      vocab_id: parseInt(vocab_id),
      correct_count
    }));
    try {
      await submitQuiz(results);
      setSubmitSuccess(true);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="quiz-container card">Đang tải câu hỏi...</div>;
  if (questions.length === 0) return (
    <div className="quiz-container card">
      <h3>Không có từ nào để ôn tập trong mục này.</h3>
      <button className="btn-primary mt-3" onClick={() => navigate('/notebooks')}>Quay lại</button>
    </div>
  );

  if (quizFinished) {
    const totalWords = Object.keys(correctCounts).length;
    const masteredThisSession = Object.values(correctCounts).filter(c => c === 2).length;
    
    return (
      <div className="quiz-container card text-center">
        <h2>Ôn tập hoàn tất!</h2>
        <div className="mt-4">
          <p>Số từ ôn tập: {totalWords}</p>
          <p>Số từ trả lời đúng cả 2 câu (tăng cấp): <strong>{masteredThisSession}</strong></p>
          <p>Số từ trả lời đúng 1 câu (giữ cấp): <strong>{Object.values(correctCounts).filter(c => c === 1).length}</strong></p>
          <p>Số từ sai (học lại): <strong>{Object.values(correctCounts).filter(c => c === 0).length}</strong></p>
        </div>
        {submitSuccess ? (
          <p className="text-success mt-3"><i className="fa-solid fa-check"></i> Đã lưu kết quả</p>
        ) : (
          <p className="text-warning mt-3">Đang lưu kết quả...</p>
        )}
        <button className="btn-primary mt-4" onClick={() => navigate('/notebooks')}>Tiếp tục học</button>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="quiz-container card">
      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{ width: `${((currentIndex) / questions.length) * 100}%` }}></div>
      </div>
      <div className="quiz-header">
        <span>Câu {currentIndex + 1} / {questions.length}</span>
      </div>
      
      <QuizQuestion 
        question={q} 
        onAnswer={handleAnswer} 
        showResult={showResult} 
        selectedKey={selectedKey} 
      />

      {showResult && (
        <button className="btn-primary block w-100 mt-4" onClick={handleNext}>
          {currentIndex < questions.length - 1 ? 'Tiếp tục' : 'Hoàn thành'}
        </button>
      )}
    </div>
  );
}