import { useSyncExternalStore } from 'react';

// Where the user's own Gemini API key lives, and just as important, where it
// does not. Only lib/gemini.js sends it anywhere, and only to Google.
// api/http.js, which talks to the NeuroLex server, never imports this module,
// so the key cannot ride along on a NeuroLex request.
//
// sessionStorage unless the user asks to be remembered: the key is then gone
// when the tab closes, the safer default on a shared computer.
const KEY_NAME = 'evl_gemini_api_key';
// Nothing secret in here: the model, whether the user picked it themselves, and
// the age confirmation.
const SETTINGS_NAME = 'evl_ai_settings_v1';

function storage(name) {
  try {
    return globalThis[name] || null;
  } catch {
    return null; // some browsers throw on access when site data is blocked
  }
}

function read(store, name) {
  try {
    return store ? store.getItem(name) : null;
  } catch {
    return null;
  }
}

function write(store, name, value) {
  try {
    if (!store) return;
    if (value == null) store.removeItem(name);
    else store.setItem(name, value);
  } catch {
    // Blocked or full: the key then only lives in memory for this page load.
  }
}

function load() {
  const remembered = read(storage('localStorage'), KEY_NAME);
  let settings = {};
  try {
    settings = JSON.parse(read(storage('localStorage'), SETTINGS_NAME) || '{}') || {};
  } catch {
    settings = {};
  }
  return {
    apiKey: remembered || read(storage('sessionStorage'), KEY_NAME) || '',
    remember: Boolean(remembered),
    model: typeof settings.model === 'string' ? settings.model : '',
    modelPinned: settings.modelPinned === true,
    ageConfirmed: settings.ageConfirmed === true
  };
}

let state = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const getAiState = () => state;

export function subscribeAi(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAiSettings() {
  return useSyncExternalStore(subscribeAi, getAiState);
}

export function saveKey(apiKey, { remember = false } = {}) {
  // Exactly one copy: turning "remember" off must not leave the key behind in
  // localStorage, and turning it on must not leave a second one in the session.
  write(storage('localStorage'), KEY_NAME, null);
  write(storage('sessionStorage'), KEY_NAME, null);
  write(storage(remember ? 'localStorage' : 'sessionStorage'), KEY_NAME, apiKey);
  state = { ...state, apiKey, remember: Boolean(remember) };
  emit();
}

export function forgetKey() {
  write(storage('localStorage'), KEY_NAME, null);
  write(storage('sessionStorage'), KEY_NAME, null);
  state = { ...state, apiKey: '', remember: false };
  emit();
}

export function saveSettings(patch) {
  const next = { model: state.model, modelPinned: state.modelPinned, ageConfirmed: state.ageConfirmed, ...patch };
  write(storage('localStorage'), SETTINGS_NAME, JSON.stringify(next));
  state = { ...state, ...next };
  emit();
}

// Enough to recognise which key is saved without showing it.
export const maskKey = (key) => (key && key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••');

// Forgetting the key in one tab forgets it in the others too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY_NAME || event.key === SETTINGS_NAME || event.key === null) {
      state = load();
      emit();
    }
  });
}
