import { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchQuestions, submitQuestionAttempt, fetchTags } from '../api';
import { AuthContext } from '../context/AuthContext';
import SearchInput from '../components/SearchInput';
import TagChip from '../components/TagChip';

const PAGE_SIZE = 50;

const STATUSES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unanswered', label: 'Chưa làm' },
  { key: 'got_wrong', label: 'Từng sai' }
];

// easy/hard come from the prompt's word count (migration 007): under 45 words
// is easy. The bank's median is 42, so this splits it 250 / 177.
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

const LEVEL_LABELS = {
  '-1': 'học lại', 0: 'cấp 1', 1: 'cấp 2', 2: 'cấp 3', 3: 'cấp 4', 4: 'nhớ sâu'
};
const levelLabel = (level) => LEVEL_LABELS[String(level)] || `cấp ${Number(level) + 1}`;

/**
 * The prompt quotes the word under test ( ... the word "prized" is closest ... ),
 * so pulling the quotes out lets the eye land on it instead of re-reading the
 * whole sentence.
 */
function HighlightedPrompt({ text }) {
  const parts = String(text || '').split(/"([^"]+)"/g);
  return (
    <p className="q-prompt">
      {parts.map((part, i) => (
        i % 2 === 1 ? <strong key={i} className="q-target">{part}</strong> : <span key={i}>{part}</span>
      ))}
    </p>
  );
}

export default function QuestionsPage() {
  const { user } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const notebookId = searchParams.get('notebook_id');

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

  // Progress filters ask about your own history, so they need an account.
  useEffect(() => {
    if (!user) {
      setOnlyStudied(false);
      setDueNow(false);
      setStatus('all');
    }
  }, [user]);

  useEffect(() => {
    fetchTags('word').then(d => setTags((d.tags || []).filter(t => t.word_count > 0))).catch(() => {});
  }, []);

  const filters = useMemo(() => ({
    q: query.trim(),
    tags: selectedTags,
    notebook_id: notebookId || undefined,
    only_studied: onlyStudied,
    due_now: dueNow,
    unanswered: status === 'unanswered',
    got_wrong: status === 'got_wrong',
    difficulty: difficulty || undefined,
    order,
    limit: PAGE_SIZE
  }), [query, selectedTags, notebookId, onlyStudied, dueNow, status, difficulty, order]);

  // Filters changed: back to the first page and the first question.
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
  }, [filters, shuffleNonce]);

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
    // Show the outcome immediately; the server call only records it.
    setResult({ is_correct: key === current.answer_key, updated_progress: null });
    if (!user) return;
    try {
      const data = await submitQuestionAttempt(current.id, key);
      setResult(data);
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

  const optionClass = (key) => {
    if (!selectedKey) return '';
    if (key === current.answer_key) return 'correct';
    if (key === selectedKey) return 'wrong';
    return '';
  };

  const studiedWords = (current?.words || []).filter(w => w.studied);

  return (
    <div className="questions-page">
      <div className="questions-filters card">
        <div className="q-filter-row">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="Tìm trong câu hỏi hoặc đáp án..."
            compact
          />
          <div
            className="segmented segmented-even"
            role="group"
            aria-label="Trạng thái"
            style={{ '--seg-count': STATUSES.length, '--seg-index': STATUSES.findIndex(s => s.key === status) }}
          >
            <span className="segmented-thumb" aria-hidden="true" />
            {STATUSES.map(s => (
              <button
                key={s.key}
                type="button"
                className={`segmented-btn ${status === s.key ? 'active' : ''}`}
                onClick={() => user && setStatus(s.key)}
                disabled={!user && s.key !== 'all'}
                aria-pressed={status === s.key}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="q-filter-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={onlyStudied}
              disabled={!user}
              onChange={e => setOnlyStudied(e.target.checked)}
            />
            Chỉ câu chứa từ tôi đã học
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={dueNow}
              disabled={!user}
              onChange={e => setDueNow(e.target.checked)}
            />
            Chỉ từ đến hạn ôn
          </label>
          {!user && <span className="q-hint">Đăng nhập để lọc theo tiến độ của bạn</span>}
        </div>

        <div className="q-filter-row">
          <div className="q-group">
            <span className="q-group-label">Độ dài</span>
            <div
              className="segmented segmented-even"
              role="group"
              aria-label="Độ dài câu hỏi"
              style={{ '--seg-count': DIFFICULTIES.length, '--seg-index': DIFFICULTIES.findIndex(d => d.key === difficulty) }}
            >
              <span className="segmented-thumb" aria-hidden="true" />
              {DIFFICULTIES.map(d => (
                <button
                  key={d.key || 'all'}
                  type="button"
                  className={`segmented-btn ${difficulty === d.key ? 'active' : ''}`}
                  onClick={() => setDifficulty(d.key)}
                  title={d.title}
                  aria-pressed={difficulty === d.key}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="q-group">
            <span className="q-group-label">Thứ tự</span>
            <div
              className="segmented segmented-even"
              role="group"
              aria-label="Thứ tự câu hỏi"
              style={{ '--seg-count': ORDERS.length, '--seg-index': ORDERS.findIndex(o => o.key === order) }}
            >
              <span className="segmented-thumb" aria-hidden="true" />
              {ORDERS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  className={`segmented-btn ${order === o.key ? 'active' : ''}`}
                  onClick={() => setOrder(o.key)}
                  title={o.title}
                  aria-pressed={order === o.key}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
        <div className="card questions-card">
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${(index / Math.max(total, 1)) * 100}%` }} />
          </div>
          <div className="quiz-header">
            Câu {index + 1} / {total}
            {current.external_id ? ` · #${current.external_id}` : ''}
            {current.word_count != null && (
              <span
                className={`chip q-diff ${current.difficulty || ''}`}
                title={current.difficulty === 'hard' ? 'Câu dài, từ 45 từ trở lên' : 'Câu ngắn, dưới 45 từ'}
              >
                {current.difficulty === 'hard' ? 'Khó' : 'Dễ'} · {current.word_count} từ
              </span>
            )}
          </div>

          <HighlightedPrompt text={current.prompt} />

          <div className="quiz-options">
            {Object.entries(current.options || {}).map(([key, text]) => (
              <div
                key={key}
                className={`quiz-option ${optionClass(key)} ${selectedKey ? 'disabled' : ''}`}
                role="button"
                onClick={() => answer(key)}
              >
                <span className="q-option-key">{key}</span>
                <span className="opt-main-text">{text}</span>
              </div>
            ))}
          </div>

          {selectedKey && (
            <div className={`q-result ${result?.is_correct ? 'is-correct' : 'is-wrong'}`}>
              <div className="q-result-verdict">
                {result?.is_correct
                  ? <><i className="fa-solid fa-check" /> Chính xác</>
                  : <><i className="fa-solid fa-xmark" /> Đáp án đúng: {current.answer_key}. {current.options[current.answer_key]}</>}
              </div>

              {current.explanation && <p className="q-explanation">{current.explanation}</p>}

              {result?.updated_progress?.length > 0 && (
                <div className="q-progress-change">
                  {result.updated_progress.map(u => (
                    <span key={u.vocab_id} className="chip">
                      {/* A word already at the top level stays there, so saying
                          "nhớ sâu → nhớ sâu" would read like a bug. */}
                      {u.previous_level === u.new_level
                        ? <>{u.word}: giữ mức <strong>{levelLabel(u.new_level)}</strong></>
                        : <>{u.word}: {levelLabel(u.previous_level)} → <strong>{levelLabel(u.new_level)}</strong></>}
                    </span>
                  ))}
                </div>
              )}

              {(current.words || []).length > 0 && (
                <div className="q-words">
                  <span className="q-words-label">Từ trong câu này:</span>
                  {current.words.map(w => (
                    <span
                      key={`${w.id}-${w.role}`}
                      className={`chip q-word ${w.studied ? 'studied' : ''} ${w.due ? 'due' : ''}`}
                      title={[
                        w.role === 'target' ? 'từ được hỏi' : 'đáp án',
                        w.vietnamese_meaning || w.meaning,
                        w.studied ? `đã học · ${levelLabel(w.repetition_level)}` : 'chưa học'
                      ].filter(Boolean).join(' · ')}
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
