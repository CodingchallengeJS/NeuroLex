import { useState } from 'react';
import AskAiButton from './AskAiButton';
import { questionContext } from '../lib/aiContext';

const LEVEL_LABELS = {
  '-1': 'học lại', 0: 'cấp 1', 1: 'cấp 2', 2: 'cấp 3', 3: 'cấp 4', 4: 'nhớ sâu'
};
export const levelLabel = (level) => LEVEL_LABELS[String(level)] || `cấp ${Number(level) + 1}`;

const SKILL_LABELS = {
  'Command of Evidence': 'Bằng chứng',
  Inferences: 'Suy luận',
  'Central Ideas and Details': 'Ý chính & chi tiết'
};
export const skillLabel = (skill) => SKILL_LABELS[skill] || skill;

/**
 * The 440 set quotes the word under test ( ... the word "prized" is closest ... ),
 * so pulling the quotes out lets the eye land on it instead of re-reading the
 * whole sentence. SAT stems have no quoted word and render as plain text.
 */
function HighlightedPrompt({ text, strong }) {
  const parts = String(text || '').split(/"([^"]+)"/g);
  return (
    <p className={`q-prompt ${strong ? 'q-stem' : ''}`}>
      {parts.map((part, i) => (
        i % 2 === 1 ? <strong key={i} className="q-target">{part}</strong> : <span key={i}>{part}</span>
      ))}
    </p>
  );
}

// One line of passage text: <u>…</u> from the parser becomes a real underline
// ("the underlined sentence" questions need it) and ______ becomes a visible
// blank. Built as elements, never as HTML.
function PassageLine({ text }) {
  return String(text).split(/(<u>.*?<\/u>|_{3,})/g).map((part, i) => {
    if (/^<u>/.test(part)) return <u key={i}>{part.slice(3, -4)}</u>;
    if (/^_{3,}$/.test(part)) return <span key={i} className="q-blank" aria-label="chỗ trống">______</span>;
    return <span key={i}>{part}</span>;
  });
}

function Passage({ text }) {
  return (
    <div className="q-passage">
      {String(text).split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j, all) => (
            <span key={j}>
              <PassageLine text={line} />
              {j < all.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

// Passage/choice text size for SAT questions, in rem. Remembered per browser,
// like the zoom a reader sets once in Bluebook and forgets about.
const SIZE_KEY = 'neurolex.passageSize';
const SIZE_MIN = 0.9;
const SIZE_MAX = 1.6;
const SIZE_DEFAULT = 1.12;

function readSize() {
  try {
    const n = Number.parseFloat(localStorage.getItem(SIZE_KEY));
    return Number.isFinite(n) ? Math.min(Math.max(n, SIZE_MIN), SIZE_MAX) : SIZE_DEFAULT;
  } catch {
    return SIZE_DEFAULT;
  }
}

function PassageSizeControl({ size, onChange }) {
  return (
    <label className="q-size" title="Cỡ chữ đoạn văn và đáp án">
      <span className="q-size-small" aria-hidden="true">A</span>
      <input
        type="range"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={0.02}
        value={size}
        onChange={e => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(SIZE_DEFAULT)}
        aria-label="Cỡ chữ đoạn văn"
      />
      <span className="q-size-large" aria-hidden="true">A</span>
    </label>
  );
}

export default function QuestionCard({ question, selectedKey, result, onAnswer, header, progress, children }) {
  const isReading = Boolean(question.passage);
  const [size, setSize] = useState(readSize);
  const changeSize = (next) => {
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* not remembered, still applied */ }
  };

  const optionClass = (key) => {
    if (!selectedKey) return '';
    if (key === question.answer_key) return 'correct';
    if (key === selectedKey) return 'wrong';
    return '';
  };

  return (
    <div className="card questions-card" style={isReading ? { '--passage-size': `${size}rem` } : undefined}>
      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{ width: `${Math.min(Math.max(progress || 0, 0), 1) * 100}%` }} />
      </div>
      <div className="quiz-header">
        {header}
        {isReading ? (
          <span className="chip q-diff hard" title="College Board xếp loại Hard">
            SAT · Khó{question.skill ? ` · ${skillLabel(question.skill)}` : ''}
          </span>
        ) : question.word_count != null && (
          <span
            className={`chip q-diff ${question.difficulty || ''}`}
            title={question.difficulty === 'hard' ? 'Câu dài, từ 45 từ trở lên' : 'Câu ngắn, dưới 45 từ'}
          >
            {question.difficulty === 'hard' ? 'Khó' : 'Dễ'} · {question.word_count} từ
          </span>
        )}
      </div>

      {isReading && <PassageSizeControl size={size} onChange={changeSize} />}

      {question.figure_url && (
        <figure className="q-figure">
          <img src={question.figure_url} alt="Biểu đồ hoặc bảng số liệu của câu hỏi" loading="lazy" />
        </figure>
      )}
      {isReading && <Passage text={question.passage} />}

      <HighlightedPrompt text={question.prompt} strong={isReading} />

      <div className={`quiz-options ${isReading ? 'q-options-long' : ''}`}>
        {Object.entries(question.options || {}).map(([key, text]) => (
          <div
            key={key}
            className={`quiz-option ${optionClass(key)} ${selectedKey ? 'disabled' : ''}`}
            role="button"
            tabIndex={selectedKey ? -1 : 0}
            onClick={() => onAnswer(key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAnswer(key); } }}
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
              : <><i className="fa-solid fa-xmark" /> Đáp án đúng: {question.answer_key}{isReading ? '' : `. ${question.options[question.answer_key]}`}</>}
          </div>

          {question.explanation && (
            <div className="q-explanation">
              {String(question.explanation).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}

          <div>
            <AskAiButton
              getContext={() => questionContext(question, selectedKey)}
              label="Hỏi AI giải thích câu này"
            />
          </div>

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

          {(question.words || []).length > 0 && (
            <div className="q-words">
              <span className="q-words-label">{isReading ? 'Từ vựng trong đoạn văn:' : 'Từ trong câu này:'}</span>
              {question.words.map(w => (
                <span
                  key={`${w.id}-${w.role}`}
                  className={`chip q-word ${w.studied ? 'studied' : ''} ${w.due ? 'due' : ''}`}
                  title={[
                    w.role === 'target' ? 'từ được hỏi' : w.role === 'passage' ? 'trong đoạn văn' : 'đáp án',
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

      {children}
    </div>
  );
}
