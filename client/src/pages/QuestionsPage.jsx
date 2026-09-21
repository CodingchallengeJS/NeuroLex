import { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchQuestions, submitQuestionAttempt, fetchTags, fetchQuestionSets } from '../api';
import { AuthContext } from '../context/AuthContext';
import { StreakContext } from '../context/StreakContext';
import SearchInput from '../components/SearchInput';
import TagChip from '../components/TagChip';
import GuestNotice from '../components/GuestNotice';
import QuestionCard, { skillLabel } from '../components/QuestionCard';
import DailyPanel from '../components/DailyPanel';
import { SAT_SET, WIC_SET } from '../lib/questionSets';

const PAGE_SIZE = 50;

const SET_KEY = 'neurolex.questionSet';

// Short labels for the switcher; the server's titles are long.
const SET_LABELS = { [SAT_SET]: 'SAT Khó', [WIC_SET]: 'Từ trong ngữ cảnh' };

function readStoredSet() {
  try {
    return localStorage.getItem(SET_KEY) || SAT_SET;
  } catch {
    return SAT_SET;
  }
}

const STATUSES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unanswered', label: 'Chưa làm' },
  { key: 'got_wrong', label: 'Từng sai' }
];

// easy/hard for the 440 set come from the prompt's word count (migration 007):
// under 45 words is easy. The SAT set is all College Board "Hard", so this
// toggle only appears for the 440 set.
const DIFFICULTIES = [
  { key: '', label: 'Tất cả', title: 'Không lọc theo độ dài' },
  { key: 'easy', label: 'Dễ', title: 'Câu ngắn, dưới 45 từ' },
  { key: 'hard', label: 'Khó', title: 'Câu dài, từ 45 từ trở lên' }
];

const ORDERS = [
  { key: 'random', label: 'Xáo trộn', title: 'Thứ tự ngẫu nhiên' },
  { key: 'longest', label: 'Dài trước', title: 'Câu dài nhất trước' },
  { key: 'shortest', label: 'Ngắn trước', title: 'Câu ngắn nhất trước' },
  { key: 'sequence', label: 'Theo số', title: 'Theo thứ tự đề gốc' }
];

function Segmented({ items, value, onChange, label }) {
  return (
    <div
      className="segmented segmented-even"
      role="group"
      aria-label={label}
      style={{ '--seg-count': items.length, '--seg-index': Math.max(items.findIndex(i => i.key === value), 0) }}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {items.map(i => (
        <button
          key={i.key || 'all'}
          type="button"
          className={`segmented-btn ${value === i.key ? 'active' : ''}`}
          onClick={() => onChange(i.key)}
          title={i.title}
          aria-pressed={value === i.key}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export default function QuestionsPage() {
  const { user } = useContext(AuthContext);
  const { refreshStreak } = useContext(StreakContext);
  const [searchParams] = useSearchParams();
  const notebookId = searchParams.get('notebook_id');

  const [sets, setSets] = useState([]);
  const [setSlug, setSetSlug] = useState(readStoredSet);
  const [skill, setSkill] = useState('');
  const [query, setQuery] = useState('');
  const [onlyStudied, setOnlyStudied] = useState(false);
  const [dueNow, setDueNow] = useState(false);
  const [status, setStatus] = useState('all');
  const [difficulty, setDifficulty] = useState('');
  // Shuffled by default: practising in import order means meeting the same
  // questions in the same sequence every session.
  const [order, setOrder] = useState('random');
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tags, setTags] = useState([]);

  // The shuffle seed the server picked, kept out of React state on purpose: it
  // is set by the same response that would otherwise re-trigger the fetch.
  // Later pages send it back so they belong to the same shuffle.
  const seedRef = useRef(null);

  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedKey, setSelectedKey] = useState(null);
  const [result, setResult] = useState(null);

  const isSat = setSlug === SAT_SET;

  useEffect(() => {
    fetchTags('word').then(d => setTags((d.tags || []).filter(t => t.word_count > 0))).catch(() => {});
    fetchQuestionSets()
      .then(d => {
        const list = (d.sets || []).filter(s => s.count > 0);
        setSets(list);
        // A remembered set that no longer exists falls back to the first one.
        setSetSlug(prev => (list.some(s => s.slug === prev) ? prev : (list[0]?.slug || prev)));
      })
      .catch(() => {});
  }, []);

  const chooseSet = (slug) => {
    setSetSlug(slug);
    setSkill('');
    setDifficulty('');
    try { localStorage.setItem(SET_KEY, slug); } catch { /* private mode: just not remembered */ }
  };

  const skills = useMemo(() => {
    const current = sets.find(s => s.slug === setSlug);
    return (current?.skills || []).slice().sort();
  }, [sets, setSlug]);

  const filters = useMemo(() => ({
    set: setSlug,
    skill: isSat ? skill || undefined : undefined,
    q: query.trim(),
    tags: selectedTags,
    notebook_id: notebookId || undefined,
    only_studied: onlyStudied,
    due_now: dueNow,
    unanswered: status === 'unanswered',
    got_wrong: status === 'got_wrong',
    difficulty: !isSat ? difficulty || undefined : undefined,
    order,
    limit: PAGE_SIZE
  }), [setSlug, isSat, skill, query, selectedTags, notebookId, onlyStudied, dueNow, status, difficulty, order]);

  // Filters changed: back to the first page and the first question. Signing in
  // or out counts too, because it changes whose progress the filters read.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      // No seed on the first page: the server picks one and hands it back.
      fetchQuestions({ ...filters, offset: 0 })
        .then(data => {
          if (!alive) return;
          seedRef.current = data.seed || null;
          setQuestions(data.questions || []);
          setTotal(data.total || 0);
          setIndex(0);
          setSelectedKey(null);
          setResult(null);
          setLoading(false);
        })
        .catch(err => {
          if (!alive) return;
          setError(err.message);
          setQuestions([]);
          setTotal(0);
          setLoading(false);
        });
    }, 250); // debounce the search box
    return () => { alive = false; clearTimeout(timer); };
  }, [filters, shuffleNonce, user]);

  const loadMore = useCallback(() => {
    if (questions.length >= total) return;
    // Same seed as page 1, or the shuffle would be re-drawn per page and some
    // questions would repeat while others never appear.
    fetchQuestions({ ...filters, offset: questions.length, seed: seedRef.current || undefined })
      .then(data => setQuestions(prev => [...prev, ...(data.questions || [])]))
      .catch(() => {});
  }, [filters, questions.length, total]);

  const current = questions[index] || null;

  const answer = async (key) => {
    if (selectedKey || !current) return;
    setSelectedKey(key);
    // Show the outcome immediately; the call only records it (on the server,
    // or in this browser for a guest).
    setResult({ is_correct: key === current.answer_key, updated_progress: null });
    try {
      const data = await submitQuestionAttempt(current, key);
      setResult(data);
      if (current.set_slug === SAT_SET) refreshStreak();
    } catch {
      // Keeping the local verdict is better than blanking the card.
    }
  };

  const next = () => {
    setSelectedKey(null);
    setResult(null);
    if (index + 1 >= questions.length - 5) loadMore();
    setIndex(i => Math.min(i + 1, Math.max(questions.length - 1, 0)));
  };

  const prev = () => {
    setSelectedKey(null);
    setResult(null);
    setIndex(i => Math.max(i - 1, 0));
  };

  const toggleTag = (slug) =>
    setSelectedTags(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);

  const studiedWords = (current?.words || []).filter(w => w.studied);

  const setItems = (sets.length > 0 ? sets : [{ slug: SAT_SET, count: null }, { slug: WIC_SET, count: null }])
    .map(s => ({
      key: s.slug,
      label: `${SET_LABELS[s.slug] || s.title}${s.count ? ` (${s.count})` : ''}`,
      title: s.title
    }));

  return (
    <div className="questions-page">
      <GuestNotice compact />

      <DailyPanel />

      <div className="questions-filters card">
        <div className="q-filter-row">
          <div className="q-group">
            <span className="q-group-label">Bộ đề</span>
            <Segmented items={setItems} value={setSlug} onChange={chooseSet} label="Bộ câu hỏi" />
          </div>
        </div>

        <div className="q-filter-row">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder={isSat ? 'Tìm trong đoạn văn, câu hỏi, đáp án...' : 'Tìm trong câu hỏi hoặc đáp án...'}
            compact
          />
          <Segmented items={STATUSES} value={status} onChange={setStatus} label="Trạng thái" />
        </div>

        <div className="q-filter-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={onlyStudied}
              onChange={e => setOnlyStudied(e.target.checked)}
            />
            Chỉ câu chứa từ tôi đã học
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={dueNow}
              onChange={e => setDueNow(e.target.checked)}
            />
            Chỉ từ đến hạn ôn
          </label>
        </div>

        <div className="q-filter-row">
          {isSat ? (
            skills.length > 0 && (
              <div className="q-group">
                <span className="q-group-label">Kỹ năng</span>
                <Segmented
                  items={[{ key: '', label: 'Tất cả' }, ...skills.map(s => ({ key: s, label: skillLabel(s), title: s }))]}
                  value={skill}
                  onChange={setSkill}
                  label="Kỹ năng SAT"
                />
              </div>
            )
          ) : (
            <div className="q-group">
              <span className="q-group-label">Độ dài</span>
              <Segmented items={DIFFICULTIES} value={difficulty} onChange={setDifficulty} label="Độ dài câu hỏi" />
            </div>
          )}

          <div className="q-group">
            <span className="q-group-label">Thứ tự</span>
            <Segmented items={ORDERS} value={order} onChange={setOrder} label="Thứ tự câu hỏi" />
          </div>

          {order === 'random' && (
            <button
              className="btn-outline btn-sm"
              onClick={() => setShuffleNonce(n => n + 1)}
              title="Trộn lại theo thứ tự khác"
            >
              <i className="fa-solid fa-shuffle" /> Trộn lại
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="q-filter-row q-tag-row">
            {tags.map(tag => (
              <TagChip
                key={tag.slug}
                tag={tag}
                active={selectedTags.includes(tag.slug)}
                onClick={() => toggleTag(tag.slug)}
                title={`${tag.word_count} từ`}
              />
            ))}
            {selectedTags.length > 0 && (
              <button className="link-btn" onClick={() => setSelectedTags([])} style={{ fontSize: '0.78rem' }}>
                Bỏ lọc ({selectedTags.length})
              </button>
            )}
          </div>
        )}

        <div className="q-count">
          {loading ? 'Đang tải...' : `${total} câu hỏi`}
          {notebookId && <> · chỉ trong sổ tay đang chọn · <Link to="/questions">bỏ giới hạn</Link></>}
        </div>
      </div>

      {error && <div className="card empty-state">{error}</div>}

      {!loading && !error && total === 0 && (
        <div className="card empty-state">
          Không có câu hỏi nào khớp bộ lọc.
          {onlyStudied && <div style={{ fontSize: '0.9rem', marginTop: '0.75rem' }}>
            Hãy học thêm từ trong sổ tay, rồi quay lại đây để gặp lại chúng trong câu văn thật.
          </div>}
        </div>
      )}

      {current && (
        <QuestionCard
          question={current}
          selectedKey={selectedKey}
          result={result}
          onAnswer={answer}
          progress={index / Math.max(total, 1)}
          header={<>Câu {index + 1} / {total}{current.external_id ? ` · #${current.external_id}` : ''}</>}
        >
          <div className="q-nav">
            <button className="btn-outline" onClick={prev} disabled={index === 0}>
              <i className="fa-solid fa-arrow-left" /> Câu trước
            </button>
            {!selectedKey && studiedWords.length > 0 && (
              <span className="q-studied-hint">
                <i className="fa-solid fa-brain" /> {studiedWords.length} từ bạn đã học
              </span>
            )}
            <button
              className="btn-primary"
              onClick={next}
              disabled={index + 1 >= Math.min(questions.length, total)}
            >
              Câu tiếp <i className="fa-solid fa-arrow-right" />
            </button>
          </div>
        </QuestionCard>
      )}
    </div>
  );
}
