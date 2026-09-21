import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchQuestions, submitQuestionAttempt } from '../api';
import { AuthContext } from '../context/AuthContext';
import { StreakContext } from '../context/StreakContext';
import QuestionCard, { skillLabel } from '../components/QuestionCard';
import GuestNotice from '../components/GuestNotice';
import { SAT_SET } from '../lib/questionSets';

const SESSION_SIZE = 5;

/**
 * Five SAT Hard questions, picked for today: ones never answered first, then
 * ones whose latest answer was wrong, then anything (a bank already finished).
 * Random within each group, so two sessions in a day do not repeat.
 */
async function pickQuestions() {
  const picked = [];
  const seen = new Set();
  const groups = [{ unanswered: true }, { got_wrong: true }, {}];
  for (const extra of groups) {
    if (picked.length >= SESSION_SIZE) break;
    const data = await fetchQuestions({ set: SAT_SET, order: 'random', limit: SESSION_SIZE * 2, ...extra });
    for (const q of data.questions || []) {
      if (picked.length >= SESSION_SIZE) break;
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      picked.push({ ...q, _group: extra.unanswered ? 'new' : extra.got_wrong ? 'retry' : 'repeat' });
    }
  }
  return picked;
}

export default function DailySessionPage() {
  const { user } = useContext(AuthContext);
  const { streak, refreshStreak } = useContext(StreakContext);

  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // question id -> { key, is_correct }
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [finished, setFinished] = useState(false);
  const [round, setRound] = useState(0);

  // The streak as it was when this round started, for the before/after line.
  // Read through a ref: start() must not re-run (and re-pick questions) every
  // time an answer refreshes the streak.
  const before = useRef(null);
  const streakRef = useRef(streak);
  streakRef.current = streak;
  const snapshot = (st) => (st ? { current: st.streak.current, hard: st.today.hard, shields: st.streak.shields } : null);

  const start = useCallback(() => {
    setLoading(true);
    setError(null);
    setFinished(false);
    setIndex(0);
    setAnswers({});
    setResult(null);
    before.current = snapshot(streakRef.current);
    pickQuestions()
      .then(qs => { setQuestions(qs); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { start(); }, [start, round, user]);

  // On a direct visit the streak may arrive after the questions do.
  useEffect(() => {
    if (!before.current && streak && Object.keys(answers).length === 0) before.current = snapshot(streak);
  }, [streak, answers]);

  const current = questions[index] || null;
  const selected = current ? answers[current.id] : null;

  const answer = async (key) => {
    if (!current || selected) return;
    const isCorrect = key === current.answer_key;
    setAnswers(prev => ({ ...prev, [current.id]: { key, is_correct: isCorrect } }));
    setResult({ is_correct: isCorrect, updated_progress: null });
    try {
      setResult(await submitQuestionAttempt(current, key));
      refreshStreak();
    } catch {
      // The verdict above stands even if recording it failed.
    }
  };

  const next = () => {
    setResult(null);
    if (index + 1 >= questions.length) {
      setFinished(true);
      refreshStreak();
    } else {
      setIndex(i => i + 1);
    }
  };

  if (loading) return <div className="card daily-session">Đang chọn 5 câu cho hôm nay...</div>;
  if (error) return <div className="card daily-session empty-state">{error}</div>;
  if (questions.length === 0) {
    return (
      <div className="card daily-session empty-state">
        Chưa có câu SAT nào trong ngân hàng câu hỏi.
        <div className="mt-3"><Link to="/questions" className="btn-outline">Về trang câu hỏi</Link></div>
      </div>
    );
  }

  if (finished) {
    const correct = questions.filter(q => answers[q.id]?.is_correct).length;
    const t = streak?.today;
    const s = streak?.streak;
    const b = before.current;
    const earnedShield = b && s && s.shields > b.shields;

    let moreLabel = 'Làm thêm 5 câu';
    if (t && t.hard < t.goal) moreLabel = `Làm thêm (còn ${t.goal - t.hard} câu tới mục tiêu)`;
    else if (t && t.hard < t.bonus && s.shields < s.max_shields) moreLabel = `Làm thêm 5 câu (lên ${t.bonus} → +1 khiên)`;

    return (
      <div className="card daily-session daily-summary">
        <h2>{correct === questions.length ? 'Hoàn hảo!' : 'Xong lượt hôm nay!'}</h2>
        <div className="daily-summary-score">
          <strong>{correct}</strong>/{questions.length} câu đúng
        </div>

        {user && t && s ? (
          <div className="daily-summary-stats">
            <div>
              <i className="fa-solid fa-fire" />{' '}
              {b && b.current !== s.current
                ? <>Chuỗi {b.current} → <strong>{s.current} ngày</strong></>
                : <>Chuỗi <strong>{s.current} ngày</strong></>}
            </div>
            <div>
              <i className="fa-solid fa-bullseye" /> Hôm nay: <strong>{t.hard}</strong>/{t.goal} câu Khó
              {t.hard >= t.bonus ? ' · vượt mức!' : t.hard >= t.goal ? ' · đạt mục tiêu' : ''}
            </div>
            <div>
              <i className="fa-solid fa-shield-halved" /> {s.shields}/{s.max_shields} khiên
              {earnedShield && <strong> · vừa nhận 1 khiên!</strong>}
            </div>
          </div>
        ) : (
          <GuestNotice />
        )}

        <ol className="daily-summary-list">
          {questions.map(q => {
            const a = answers[q.id];
            return (
              <li key={q.id} className={a?.is_correct ? 'is-correct' : 'is-wrong'}>
                <i className={`fa-solid ${a?.is_correct ? 'fa-check' : 'fa-xmark'}`} />
                <span>#{q.external_id} · {skillLabel(q.skill)}</span>
                {q._group === 'retry' && <span className="chip">làm lại câu từng sai</span>}
              </li>
            );
          })}
        </ol>

        <div className="daily-summary-actions">
          <button className="btn-primary" onClick={() => setRound(r => r + 1)}>
            <i className="fa-solid fa-bolt" /> {moreLabel}
          </button>
          <Link to="/questions" className="btn-outline">Về trang câu hỏi</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-session-wrap">
      <QuestionCard
        question={current}
        selectedKey={selected?.key || null}
        result={selected ? result : null}
        onAnswer={answer}
        progress={(index + (selected ? 1 : 0)) / questions.length}
        header={<>Làm 5 câu hôm nay · Câu {index + 1}/{questions.length}{current._group === 'retry' ? ' · từng sai' : ''}</>}
      >
        <div className="q-nav">
          <Link to="/questions" className="btn-outline">
            <i className="fa-solid fa-xmark" /> Dừng
          </Link>
          <button className="btn-primary" onClick={next} disabled={!selected}>
            {index + 1 >= questions.length ? 'Xem kết quả' : 'Câu tiếp'} <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      </QuestionCard>
    </div>
  );
}
