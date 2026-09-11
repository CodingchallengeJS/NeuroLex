import { useSyncExternalStore } from 'react';

// A guest's learning progress, kept in this browser's localStorage.
//
// localStorage is the same API in Chrome, Edge, Firefox and Safari, so nothing
// here branches per browser. What differs is how long a browser keeps it: a
// private window drops it on close, and Safari erases script-written storage for
// a site not visited in 7 days. The account is the copy that survives, which is
// why guests keep being invited to sign in.
//
// Shape (version 1):
//   words:     { [vocabId]: progress row, same fields as user_vocab_progress }
//   notebooks: { [notebookId]: current word id in the study sequence }
//   attempts:  { [questionId]: latest answer to that question }

const KEY = 'evl_guest_progress_v1';

const empty = () => ({ version: 1, words: {}, notebooks: {}, attempts: {} });

function probeStorage() {
  try {
    const probe = `${KEY}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!parsed || parsed.version !== 1) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

let storageOk = probeStorage();
let state = read();
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());

export const getGuestState = () => state;

export function subscribeGuest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Every write replaces the state object, so React sees a new snapshot.
export function updateGuest(mutate) {
  const next = {
    ...state,
    words: { ...state.words },
    notebooks: { ...state.notebooks },
    attempts: { ...state.attempts }
  };
  mutate(next);
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    storageOk = true;
  } catch {
    // Blocked or full: keep going in memory for this page load.
    storageOk = false;
  }
  emit();
  return next;
}

export function clearGuest() {
  state = empty();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to remove.
  }
  emit();
}

export const guestStorageOk = () => storageOk;

export const guestWordCount = (s = state) => Object.keys(s.words).length;

export const hasGuestProgress = (s = state) =>
  Object.keys(s.words).length > 0 ||
  Object.keys(s.notebooks).length > 0 ||
  Object.keys(s.attempts).length > 0;

// Another tab studying as a guest, or signing in and merging, changes the same
// key; follow it so this tab does not overwrite newer progress.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      state = read();
      emit();
    }
  });
}

export function useGuestProgress() {
  return useSyncExternalStore(subscribeGuest, getGuestState);
}
