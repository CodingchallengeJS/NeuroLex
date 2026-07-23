export default function VocabCard({ vocab }) {
  const playAudio = () => {
    if (!vocab.word) return;
    const utterance = new SpeechSynthesisUtterance(vocab.word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const getLevelClass = (level) => {
    if (vocab.mastered) return 'level-mastered';
    if (level === -1) return 'level-relearn';
    if (level >= 0) return `level-${level}`;
    return 'level-new';
  };

  return (
    <div className="vocab-card">
      <div className="vc-header">
        <h3 className="vc-word">{vocab.word}</h3>
        <button className="icon-btn audio-btn" onClick={playAudio} title="Nghe phát âm">
          <i className="fa-solid fa-volume-high"></i>
        </button>
      </div>
      {vocab.phonetic && <div className="vc-phonetic">{vocab.phonetic}</div>}
      
      <div className="vc-meanings">
        {vocab.english_meaning && <p className="en-meaning">{vocab.english_meaning}</p>}
        {vocab.vietnamese_meaning && <p className="vi-meaning">{vocab.vietnamese_meaning}</p>}
        {(!vocab.english_meaning && !vocab.vietnamese_meaning && vocab.meaning) && (
          <p className="vi-meaning">{vocab.meaning}</p>
        )}
      </div>

      {vocab.example && (
        <div className="vc-examples">
          <ul style={{ paddingLeft: '20px', margin: '5px 0', fontStyle: 'italic'}}>
            {vocab.example.split('\n').map((ex, idx) => (
              <li key={idx} className="example-text">{ex}</li>
            ))}
          </ul>
        </div>
      )}

      {vocab.synonyms && (
        <div className="vc-synonyms">
          {vocab.synonyms.split(',').map(s => s.trim()).filter(Boolean).map((syn, idx) => (
            <span key={idx} className="chip">{syn}</span>
          ))}
        </div>
      )}

      {vocab.repetition_level !== undefined && (
        <div className={`vc-level-badge ${getLevelClass(vocab.repetition_level)}`}>
          Lv {vocab.repetition_level}
        </div>
      )}
    </div>
  );
}