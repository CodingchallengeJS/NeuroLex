// The only code that talks to Google's Gemini API, and the only place a user's
// own API key is ever sent. It travels in a request header (never the URL,
// which would end up in history and logs) to the one host below. The server's
// Content-Security-Policy (server/index.js) lets page scripts reach this host
// and NeuroLex itself, and nothing else.
export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.reason = reason;
  }
}

function messageFor(status, reason, detail) {
  if (reason === 'API_KEY_INVALID') {
    return 'Khoá API không hợp lệ. Hãy kiểm tra lại, hoặc tạo khoá mới trong Google AI Studio.';
  }
  if (status === 429) {
    return 'Khoá này đã hết lượt dùng (giới hạn theo phút hoặc theo ngày). Hãy thử lại sau, hoặc chọn model khác.';
  }
  if (status === 403) return 'Khoá này không được phép gọi Gemini API. Có thể khoá đã bị giới hạn hoặc vô hiệu hoá.';
  if (status === 404) return 'Model này không dùng được với khoá của bạn. Hãy chọn model khác.';
  if (status >= 500) return 'Máy chủ Gemini đang gặp sự cố. Hãy thử lại sau ít phút.';
  return detail ? `Gemini báo lỗi: ${detail}` : `Gemini báo lỗi (HTTP ${status}).`;
}

// Google's error body: { error: { code, message, status, details: [{ reason }] } }
function errorFromBody(status, body) {
  const error = (body && body.error) || {};
  const info = (error.details || []).find((d) => d && d.reason);
  const code = status || error.code || 0;
  const reason = (info && info.reason) || error.status || '';
  return new GeminiError(messageFor(code, reason, error.message), { status: code, reason });
}

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new GeminiError('Không kết nối được tới Gemini. Hãy kiểm tra mạng rồi thử lại.', { reason: 'NETWORK' });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw errorFromBody(res.status, body);
  }
  return res;
}

const keyHeader = (apiKey) => ({ 'x-goog-api-key': apiKey });

// Only models that can hold a text conversation. The list also carries
// embedding, image, speech and live-audio models that would fail as a chat.
const NOT_CHAT = /(embed|imagen|image|tts|audio|live|veo|aqa|robotics|computer-use)/i;

export async function listChatModels(apiKey, { signal } = {}) {
  const found = [];
  let pageToken = '';
  for (let page = 0; page < 10; page += 1) {
    const query = `pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await request(`${GEMINI_API}/models?${query}`, { headers: keyHeader(apiKey), signal });
    const data = await res.json();
    found.push(...(data.models || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return found
    .map((m) => ({
      id: String(m.name || '').replace(/^models\//, ''),
      label: m.displayName || '',
      methods: m.supportedGenerationMethods || []
    }))
    .filter((m) => /^gemini-/i.test(m.id) && m.methods.includes('generateContent') && !NOT_CHAT.test(m.id))
    .map(({ id, label }) => ({ id, label: label || id }));
}

const versionOf = (id) => {
  const match = /^gemini-(\d+(?:\.\d+)?)/.exec(id);
  return match ? Number(match[1]) : 0;
};

// The recommended model: Gemini 3 Flash. It is quick, light on a free quota and
// plenty for vocabulary help. Google offers it only as a preview for now, so a
// stable "gemini-3-flash" wins if one appears.
export const PREFERRED_MODELS = ['gemini-3-flash', 'gemini-3-flash-preview'];

// Picked from what the key can actually use. A preview can be shut down, so
// when neither preferred model is listed this falls back to Flash in general:
// a stable release before a preview, the newest version within each group.
export function pickDefaultModel(models) {
  const ids = models.map((m) => m.id);
  const preferred = PREFERRED_MODELS.find((id) => ids.includes(id));
  if (preferred) return preferred;

  const newest = (list) => list.sort((a, b) => versionOf(b) - versionOf(a) || a.length - b.length)[0];
  return newest(ids.filter((id) => /^gemini-\d+(\.\d+)?-flash(-\d{3})?$/.test(id)))
    || newest(ids.filter((id) => /^gemini-\d+(\.\d+)?-flash-lite(-\d{3})?$/.test(id)))
    || newest(ids.filter((id) => /flash/.test(id)))
    || ids[0]
    || '';
}

// The model to use once the key's model list is known. One the user picked
// themselves is kept for as long as the key can still use it. Otherwise the
// default applies, so a change of default (or a retired preview) reaches
// everyone who never chose.
export function resolveModel({ model, modelPinned }, models) {
  if (modelPinned && models.some((m) => m.id === model)) return { model, modelPinned: true };
  return { model: pickDefaultModel(models), modelPinned: false };
}

// Server-Sent Events: `data:` lines, one event per blank line. A network chunk
// can end mid-line or mid-event, so nothing is parsed until its line is whole.
async function* sseEvents(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data = [];
  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line === '') {
        if (data.length) yield data.join('\n');
        data = [];
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''));
      }
      newline = buffer.indexOf('\n');
    }
    if (done) break;
  }
  if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''));
  if (data.length) yield data.join('\n');
}

const BLOCKED = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'];

// contents: [{ role: 'user' | 'model', text }]. onText receives the whole reply
// so far on every chunk. Resolves with the full reply; rejects with a
// GeminiError, or an AbortError when `signal` is aborted.
export async function streamChat({ apiKey, model, systemInstruction, contents, signal, onText }) {
  const res = await request(`${GEMINI_API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { ...keyHeader(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
      // No maxOutputTokens: on thinking models the budget can be spent before
      // any visible text, which would come back as an empty reply.
      generationConfig: { temperature: 0.6 }
    }),
    signal
  });

  let text = '';
  let finishReason = '';
  let blockReason = '';
  for await (const payload of sseEvents(res.body)) {
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }
    if (chunk.error) throw errorFromBody(chunk.error.code, chunk);
    if (chunk.promptFeedback && chunk.promptFeedback.blockReason) blockReason = chunk.promptFeedback.blockReason;
    const candidate = (chunk.candidates || [])[0];
    if (!candidate) continue;
    if (candidate.finishReason) finishReason = candidate.finishReason;
    for (const part of (candidate.content && candidate.content.parts) || []) {
      // Thought summaries only arrive when asked for; skip them if they do.
      if (part.thought || typeof part.text !== 'string') continue;
      text += part.text;
      if (onText) onText(text);
    }
  }

  if (!text) {
    if (blockReason || BLOCKED.includes(finishReason)) {
      throw new GeminiError('Gemini từ chối trả lời nội dung này vì bộ lọc an toàn. Hãy diễn đạt lại câu hỏi.', {
        reason: blockReason || finishReason
      });
    }
    throw new GeminiError('Gemini không trả về nội dung nào. Hãy thử hỏi lại hoặc chọn model khác.', {
      reason: finishReason || 'EMPTY'
    });
  }
  return { text, finishReason };
}
