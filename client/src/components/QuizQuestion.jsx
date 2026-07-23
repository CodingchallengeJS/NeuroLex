export default function QuizQuestion({ question, onAnswer, showResult, selectedKey }) {
  const handleOptionClick = (key) => {
    // Chỉ cho phép click nếu chưa hiện kết quả
    if (!showResult) {
      onAnswer(key);
    }
  };

  const getOptionClass = (key) => {
    if (!showResult) return selectedKey === key ? 'selected' : '';
    if (key === question.correct_key) return 'correct';
    if (key === selectedKey) return 'wrong';
    return '';
  };

  const playAudio = (e, word) => {
    e.stopPropagation(); // djt, quả này quan trọng nè để click loa ko bị lan ra ngoài
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="quiz-question-container">
      <div className="quiz-prompt">
        <h2>{question.prompt}</h2>
        {question.phonetic && (
          <div className="quiz-phonetic">
            {question.phonetic}
            <button className="icon-btn ml-2" onClick={(e) => playAudio(e, question.prompt)}>
              <i className="fa-solid fa-volume-high"></i>
            </button>
          </div>
        )}
      </div>

      <div className="quiz-options">
        {question.options.map(opt => {
          // For meaning_to_word, expand all options. For word_to_meaning, expand only the correct option.
          const shouldExpand = showResult && (question.type === 'meaning_to_word' || opt.key === question.correct_key);

          return (
            // Đổi button thành div ở đây để fix lỗi lồng button
            <div
              key={opt.key}
              className={`quiz-option ${getOptionClass(opt.key)} ${shouldExpand ? 'show-result' : ''} ${showResult ? 'disabled' : ''}`}
              onClick={() => handleOptionClick(opt.key)}
              role="button"
            >
              {!shouldExpand && <div className="opt-main-text">{opt.text}</div>}
              
              {shouldExpand && (
                <div className="opt-result-details">
                  <div className="opt-word-row">
                    <span className="opt-word">{question.type === 'meaning_to_word' ? opt.text : opt.word}</span>
                    {opt.phonetic && <span className="opt-phonetic">{opt.phonetic}</span>}
                    {/* Nút loa bây giờ sẽ hđ bình thường vì bên ngoài nó là div, ko phải button nữa */}
                    <button className="icon-btn audio-btn-small" onClick={(e) => playAudio(e, question.type === 'meaning_to_word' ? opt.text : opt.word)}>
                      <i className="fa-solid fa-volume-high"></i>
                    </button>
                  </div>
                  
                  <div className="opt-meanings">
                    {opt.english_meaning && <div className="opt-en"><span className="lang-tag">EN</span> {opt.english_meaning}</div>}
                    {opt.vietnamese_meaning && <div className="opt-vi"><span className="lang-tag">VI</span> {opt.vietnamese_meaning}</div>}
                    {(!opt.english_meaning && !opt.vietnamese_meaning && opt.text) && (
                      <div className="opt-en">{opt.text}</div>
                    )}
                  </div>

                  {/* Render Example */}
                  {opt.example && (
                    <div className="opt-examples">
                      <ul style={{ paddingLeft: '20px', margin: '10px 0', fontStyle: 'italic', color: '#555' }}>
                        {opt.example.split('\n').map((ex, idx) => (
                          <li key={idx} className="example-text">{ex}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Render Synonyms */}
                  {opt.synonyms && (
                    <div className="opt-synonyms" style={{ marginTop: '10px' }}>
                      {opt.synonyms.split(',').map(s => s.trim()).filter(Boolean).map((syn, idx) => (
                        <span key={idx} className="chip" style={{ marginRight: '5px' }}>{syn}</span>
                      ))}
                    </div>
                  )}
                  
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}