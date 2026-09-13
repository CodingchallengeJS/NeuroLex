import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { getAiState } from '../lib/geminiKey';
import { listChatModels, streamChat } from '../lib/gemini';
import { SYSTEM_INSTRUCTION, buildContents, withContext } from '../lib/aiContext';

const ChatContext = createContext(null);

// The conversation lives in memory only: never sent to the NeuroLex server,
// never written to storage, gone on reload. It travels to Google, and only
// with the user's own key.
export function ChatProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessagesState] = useState([]);
  const [pendingContext, setPendingContext] = useState(null);
  const [streaming, setStreaming] = useState(false);
  // The models the saved key can use; fetched with the key, never persisted.
  const [models, setModels] = useState(null);

  // The ref is the source of truth so a send always builds its history from
  // the latest messages, even while stream updates are still being rendered.
  const messagesRef = useRef([]);
  const controllerRef = useRef(null);
  const nextId = useRef(0);

  const setMessages = useCallback((update) => {
    const next = typeof update === 'function' ? update(messagesRef.current) : update;
    messagesRef.current = next;
    setMessagesState(next);
  }, []);

  const patchMessage = useCallback((id, patch) => {
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [setMessages]);

  const send = useCallback(async (rawText) => {
    const text = String(rawText || '').trim();
    const { apiKey, model } = getAiState();
    if (!text || controllerRef.current || !apiKey || !model) return;

    const context = pendingContext;
    nextId.current += 1;
    const userMessage = {
      id: nextId.current,
      role: 'user',
      text,
      context: context ? { kind: context.kind, label: context.label } : null,
      sendText: withContext(context, text)
    };
    nextId.current += 1;
    const replyId = nextId.current;

    const contents = buildContents([...messagesRef.current, userMessage]);
    setMessages((list) => [...list, userMessage, { id: replyId, role: 'model', text: '', pending: true }]);
    setPendingContext(null);

    const controller = new AbortController();
    controllerRef.current = controller;
    setStreaming(true);
    try {
      const result = await streamChat({
        apiKey,
        model,
        systemInstruction: SYSTEM_INSTRUCTION,
        contents,
        signal: controller.signal,
        onText: (partial) => patchMessage(replyId, { text: partial })
      });
      patchMessage(replyId, { text: result.text, pending: false });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        patchMessage(replyId, { pending: false, stopped: true });
      } else {
        patchMessage(replyId, { pending: false, error: (err && err.message) || 'Có lỗi xảy ra khi gọi Gemini.' });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setStreaming(false);
    }
  }, [pendingContext, patchMessage, setMessages]);

  const stop = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
  }, []);

  const clearChat = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
    setMessages([]);
    setPendingContext(null);
  }, [setMessages]);

  const loadModels = useCallback(async (apiKey) => {
    const list = await listChatModels(apiKey);
    setModels(list);
    return list;
  }, []);

  const askAbout = useCallback((context) => {
    setPendingContext(context);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({
    open,
    messages,
    pendingContext,
    streaming,
    models,
    send,
    stop,
    clearChat,
    askAbout,
    loadModels,
    forgetModels: () => setModels(null),
    clearContext: () => setPendingContext(null),
    openChat: () => setOpen(true),
    close: () => setOpen(false)
  }), [open, messages, pendingContext, streaming, models, send, stop, clearChat, askAbout, loadModels]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error('useChat must be used inside ChatProvider');
  return chat;
}
