import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import { useAiSettings, saveKey, forgetKey, saveSettings, maskKey } from '../lib/geminiKey';
import { resolveModel } from '../lib/gemini';

// Bring your own key. The key is checked by asking Google for the models it
// can use (which also fills the model picker), and saved only once that works.
export default function AiKeySetup({ onDone }) {
  const ai = useAiSettings();
  const { models, loadModels, forgetModels, close } = useChat();
  const hasKey = Boolean(ai.apiKey);

  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(ai.remember);
  const [adult, setAdult] = useState(ai.ageConfirmed);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const key = draft.trim();

    if (!adult) {
      setError('Bạn cần xác nhận đủ 18 tuổi và đồng ý với Điều khoản Gemini API của Google.');
      return;
    }
    if (!key) {
      if (!hasKey) {
        setError('Hãy dán khoá API Gemini của bạn.');
        return;
      }
      // Only the checkboxes changed; the saved key moves to the chosen storage.
      saveKey(ai.apiKey, { remember });
      saveSettings({ ageConfirmed: true });
      onDone();
      return;
    }
    if (/\s/.test(key) || key.length < 20) {
      setError('Khoá này trông không giống khoá API Gemini. Hãy sao chép lại từ Google AI Studio.');
      return;
    }

    setChecking(true);
    try {
      const list = await loadModels(key);
      if (list.length === 0) throw new Error('Khoá hợp lệ nhưng không có model Gemini nào dùng để trò chuyện.');
      saveKey(key, { remember });
      saveSettings({ ageConfirmed: true, ...resolveModel(ai, list) });
      setDraft('');
      onDone();
    } catch (err) {
      setError(err.message || 'Không kiểm tra được khoá.');
    } finally {
      setChecking(false);
    }
  };

  const removeKey = () => {
    forgetKey();
    forgetModels();
    setDraft('');
  };

  return (
    <form className="chat-setup" onSubmit={submit}>
      <div className="chat-setup-intro">
        <h4><i className="fa-solid fa-key"></i> Dùng khoá API Gemini của bạn</h4>
        <p>
          Trợ lý chạy bằng khoá Google AI Studio của chính bạn. Khoá chỉ được lưu trong trình duyệt này và chỉ
          được gửi thẳng tới Google. Máy chủ NeuroLex không bao giờ nhận hay lưu khoá của bạn;{' '}
          <a href="https://github.com/CodingchallengeJS/NeuroLex" target="_blank" rel="noreferrer">mã nguồn công khai</a>{' '}
          để bạn tự kiểm tra.
        </p>
      </div>

      <ol className="chat-setup-steps">
        <li>
          Mở <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio → API keys</a> và tạo khoá.
        </li>
        <li>Nên tạo khoá trong một dự án <strong>chưa bật thanh toán (billing)</strong>: khi đó bạn không thể bị tính tiền.</li>
        <li>Dán khoá vào ô bên dưới.</li>
      </ol>

      {hasKey && (
        <div className="chat-key-saved">
          <span>
            <i className="fa-solid fa-circle-check"></i> Đã lưu khoá <code>{maskKey(ai.apiKey)}</code>{' '}
            {ai.remember ? '(ghi nhớ trên trình duyệt này)' : '(chỉ trong tab này)'}
          </span>
          <button type="button" className="link-btn" onClick={removeKey}>Xoá khoá</button>
        </div>
      )}

      <label className="chat-field">
        <span>{hasKey ? 'Đổi sang khoá khác' : 'Khoá API'}</span>
        <div className="chat-key-input">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIza..."
            name="gemini-api-key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="button" className="icon-btn" onClick={() => setReveal((v) => !v)} title={reveal ? 'Ẩn khoá' : 'Hiện khoá'}>
            <i className={`fa-solid ${reveal ? 'fa-eye-slash' : 'fa-eye'}`}></i>
          </button>
        </div>
      </label>

      {hasKey && models && models.length > 0 && (
        <label className="chat-field">
          <span>Model</span>
          <select className="form-select" value={ai.model} onChange={(e) => saveSettings({ model: e.target.value, modelPinned: true })}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <small>Mặc định là Gemini 3 Flash. Nếu gặp lỗi hết lượt dùng, hãy thử một model Flash hoặc Flash-Lite khác.</small>
        </label>
      )}

      <label className="toggle-label">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Ghi nhớ trên trình duyệt này (đừng bật trên máy dùng chung)</span>
      </label>
      <label className="toggle-label">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>
          Tôi đủ 18 tuổi và đồng ý với{' '}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Điều khoản Gemini API</a> của Google
        </span>
      </label>

      <p className="chat-setup-note">
        Với khoá miễn phí, Google có thể dùng nội dung trò chuyện để cải thiện sản phẩm và người đánh giá có thể
        đọc chúng. Đừng gửi thông tin cá nhân. Xem <Link to="/privacy" onClick={close}>chính sách quyền riêng tư</Link>.
      </p>

      {error && <div className="error-alert">{error}</div>}

      <div className="chat-setup-actions">
        {hasKey && ai.ageConfirmed && ai.model && (
          <button type="button" className="btn-outline btn-sm" onClick={onDone}>Quay lại trò chuyện</button>
        )}
        <button type="submit" className="btn-primary btn-sm" disabled={checking}>
          {checking ? 'Đang kiểm tra khoá…' : (hasKey && !draft.trim() ? 'Lưu' : 'Kiểm tra và lưu')}
        </button>
      </div>
    </form>
  );
}
