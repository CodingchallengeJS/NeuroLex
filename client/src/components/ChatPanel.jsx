import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import { useAiSettings, getAiState, saveSettings } from '../lib/geminiKey';
import { resolveModel } from '../lib/gemini';
import SafeMarkdown from './SafeMarkdown';
import AiKeySetup from './AiKeySetup';

const STARTERS = [
  'Phân biệt "affect" và "effect"',
  'Giải thích cụm "take something for granted"',
  'Cho 3 câu ví dụ IELTS với từ "mitigate"'
];

export default function ChatPanel() {
  const chat = useChat();
  const ai = useAiSettings();
  const [editingKey, setEditingKey] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const ready = Boolean(ai.apiKey && ai.ageConfirmed && ai.model);
  const showSetup = !ready || editingKey;
  const { open, models, loadModels, close } = chat;

  // A key saved earlier: fetch its model list for the picker, then settle on
  // the model. An automatic choice follows the current default; one the user
  // picked stays, unless the key can no longer use it.
  useEffect(() => {
    if (!open || !ready || models) return;
    loadModels(ai.apiKey)
      .then((list) => {
        const current = getAiState();
        const next = resolveModel(current, list);
        if (next.model && (next.model !== current.model || next.modelPinned !== current.modelPinned)) {
          saveSettings(next);
        }
      })
      .catch(() => {});
  }, [open, ready, models, loadModels, ai.apiKey]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.messages, open, showSetup]);

  useEffect(() => {
    if (open && !showSetup && inputRef.current) inputRef.current.focus();
  }, [open, showSetup, chat.pendingContext]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) {
    return (
      <button type="button" className="chat-launcher" onClick={chat.openChat} title="Trợ lý học tập AI">
        <i className="fa-solid fa-wand-magic-sparkles"></i>
        <span>Hỏi AI</span>
      </button>
    );
  }

  const submit = (text) => {
    if (!text.trim() || chat.streaming) return;
    chat.send(text);
    setDraft('');
  };

  const onKeyDown = (event) => {
    // isComposing: Vietnamese input methods compose accents with Enter-like
    // keystrokes on some systems; sending mid-word would cut the message off.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  return (
    <section className="chat-panel" role="dialog" aria-label="Trợ lý học tập AI">
      <header className="chat-header">
        <div className="chat-title">
          <i className="fa-solid fa-wand-magic-sparkles"></i>
          <div>
            <strong>Trợ lý học tập</strong>
            {ready && (models && models.length > 0 ? (
              <select
                className="chat-model-select"
                value={ai.model}
                onChange={(e) => saveSettings({ model: e.target.value, modelPinned: true })}
                title="Chọn model"
                aria-label="Chọn model"
              >
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <span className="chat-model">{ai.model}</span>
            ))}
          </div>
        </div>
        <div className="chat-header-actions">
          {!showSetup && chat.messages.length > 0 && (
            <button type="button" className="icon-btn" onClick={chat.clearChat} title="Cuộc trò chuyện mới">
              <i className="fa-solid fa-rotate-left"></i>
            </button>
          )}
          {ready && (
            <button
              type="button"
              className={`icon-btn ${editingKey ? 'active' : ''}`}
              onClick={() => setEditingKey((v) => !v)}
              title="Khoá API và model"
            >
              <i className="fa-solid fa-key"></i>
            </button>
          )}
          <button type="button" className="icon-btn" onClick={close} title="Đóng">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </header>

      {showSetup ? (
        <div className="chat-body-scroll">
          <AiKeySetup onDone={() => setEditingKey(false)} />
        </div>
      ) : (
        <>
          <div className="chat-messages" ref={listRef}>
            {chat.messages.length === 0 && (
              <div className="chat-empty">
                <p>Hỏi bất cứ điều gì về từ vựng, cách dùng, ví dụ, hoặc nhờ giải thích một câu hỏi Word in Context.</p>
                <div className="chat-suggestions">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => submit(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {chat.messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                {m.context && (
                  <span className="chat-msg-context"><i className="fa-solid fa-paperclip"></i> {m.context.label}</span>
                )}
                {m.role === 'user'
                  ? <p className="chat-user-text">{m.text}</p>
                  : (m.text ? <SafeMarkdown text={m.text} /> : (m.pending && <span className="chat-typing">Đang trả lời…</span>))}
                {m.stopped && <span className="chat-note">Đã dừng</span>}
                {m.error && <span className="chat-error">{m.error}</span>}
              </div>
            ))}
          </div>

          {chat.pendingContext && (
            <div className="chat-context">
              <div className="chat-context-chip">
                <i className="fa-solid fa-paperclip"></i>
                <span>Đính kèm: {chat.pendingContext.label}</span>
                <button type="button" className="icon-btn" onClick={chat.clearContext} title="Bỏ đính kèm">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="chat-suggestions">
                {chat.pendingContext.suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)} disabled={chat.streaming}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={chat.pendingContext
                ? `Hỏi về ${chat.pendingContext.label}…`
                : 'Nhập câu hỏi… (Enter để gửi, Shift+Enter để xuống dòng)'}
            />
            {chat.streaming ? (
              <button type="button" className="chat-send stop" onClick={chat.stop} title="Dừng trả lời">
                <i className="fa-solid fa-stop"></i>
              </button>
            ) : (
              <button type="submit" className="chat-send" disabled={!draft.trim()} title="Gửi">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            )}
          </form>
          <p className="chat-footnote">
            Gửi thẳng tới Google Gemini bằng khoá của bạn · không lưu lịch sử ·{' '}
            <Link to="/privacy" onClick={close}>Quyền riêng tư</Link>
          </p>
        </>
      )}
    </section>
  );
}
