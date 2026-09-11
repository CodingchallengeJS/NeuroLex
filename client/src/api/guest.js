// Guest versions of the progress calls in ./index.js. Each resolves to the same
// shape as the server route it stands in for, so pages never need to know which
// one answered.
import { apiFetch } from './http.js';
import { getGuestState, updateGuest, clearGuest, hasGuestProgress } from '../lib/guestStore.js';
import {
  BUCKETS, applyQuizResult, applyQuestionResult, bucketMatches, previousLevel, scoredVocabIds, summarize
} from '../lib/srs.js';

// /api/quiz/generate takes 10 words per quiz.
const QUIZ_WORDS = 10;

const PROGRESS_FIELDS = ['repetition_level', 'interval_days', 'next_review_at', 'correct_streak', 'mastered'];

// A notebook's word list is public and does not change while someone studies
// it, so one fetch per notebook per page load is enough.
const notebookVocabCache = new Map();

function notebookVocabs(notebookId) {
  const key = String(notebookId);
  if (!notebookVocabCache.has(key)) {
    const pending = apiFetch(`/notebooks/${key}/vocabs`)
      .then((data) => data.vocabs || [])
      .catch((err) => {
        notebookVocabCache.delete(key);
        throw err;
      });
    notebookVocabCache.set(key, pending);
  }
  return notebookVocabCache.get(key);
}

// The server fills these columns from the caller's progress; a guest's lives here.
function withProgress(vocab, row) {
  if (!row) return vocab;
  return { ...vocab, ...Object.fromEntries(PROGRESS_FIELDS.map((f) => [f, row[f]])) };
}

async function progressEntries(notebookId) {
  const entries = Object.entries(getGuestState().words);
  if (!notebookId) return entries;
  const inNotebook = new Set((await notebookVocabs(notebookId)).map((v) => String(v.id)));
  return entries.filter(([id]) => inNotebook.has(id));
}

function requireInteger(value, message) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(message);
  return n;
}

/* ---------- notebooks + study sequence ---------- */

export async function guestNotebookVocabs(notebookId) {
  const { words } = getGuestState();
  const vocabs = await notebookVocabs(notebookId);
  return { vocabs: vocabs.map((v) => withProgress(v, words[v.id])) };
}

export async function guestReviewSequence(notebookId) {
  const vocabs = await notebookVocabs(requireInteger(notebookId, 'Invalid notebook id'));
  if (vocabs.length === 0) return { vocabs: [], currentIndex: 0, currentWordId: null };

  const currentWordId = getGuestState().notebooks[notebookId] ?? null;
  const index = currentWordId === null
    ? -1
    : vocabs.findIndex((v) => Number(v.id) === Number(currentWordId));
  return { vocabs, currentIndex: index >= 0 ? index : 0, currentWordId };
}

export async function guestReviewStep(notebookId, vocabId, correctCount) {
  const nbId = requireInteger(notebookId, 'Invalid parameters');
  const wordId = requireInteger(vocabId, 'Invalid parameters');

  const vocabs = await notebookVocabs(nbId);
  if (vocabs.length === 0) return { nextIndex: 0, currentWordId: null };

  const currentIndex = vocabs.findIndex((v) => Number(v.id) === wordId);
  const nextIndex = currentIndex >= 0 && currentIndex < vocabs.length - 1 ? currentIndex + 1 : 0;
  const nextWordId = Number(vocabs[nextIndex].id);

  updateGuest((s) => {
    if (correctCount !== undefined) s.words[wordId] = applyQuizResult(s.words[wordId], correctCount);
    s.notebooks[nbId] = nextWordId;
  });
  return { nextIndex, currentWordId: nextWordId };
}

/* ---------- review buckets + quiz ---------- */

export async function guestRepetitionSummary(notebookId) {
  return summarize((await progressEntries(notebookId)).map(([, row]) => row));
}

export async function guestGenerateQuiz(bucket, notebookId) {
  if (!BUCKETS.includes(bucket)) throw new Error('Invalid bucket');

  const now = Date.now();
  // Same order as the server: soonest review first.
  const picked = (await progressEntries(notebookId))
    .filter(([, row]) => bucketMatches(row, bucket, now))
    .sort(([idA, a], [idB, b]) =>
      Date.parse(a.next_review_at) - Date.parse(b.next_review_at) || Number(idA) - Number(idB))
    .slice(0, QUIZ_WORDS);

  if (picked.length === 0) return { words: [], questions: [] };

  // Distractors come from the shared vocabulary, so the questions still need
  // the server; only the choice of words is the guest's.
  const data = await apiFetch('/quiz/build', {
    method: 'POST',
    body: JSON.stringify({ vocab_ids: picked.map(([id]) => Number(id)) })
  });
  const { words } = getGuestState();
  return { ...data, words: (data.words || []).map((w) => withProgress(w, words[w.id])) };
}

export async function guestSubmitQuiz(results) {
  const now = Date.now();
  const updated = [];
  updateGuest((s) => {
    for (const r of Array.isArray(results) ? results : []) {
      if (!Number.isInteger(r.vocab_id) || !(r.correct_count >= 0 && r.correct_count <= 2)) continue;
      const row = applyQuizResult(s.words[r.vocab_id], r.correct_count, now);
      s.words[r.vocab_id] = row;
      updated.push({ vocab_id: r.vocab_id, new_level: row.repetition_level, next_review_at: row.next_review_at });
    }
  });
  return { results: updated };
}

/* ---------- question bank ---------- */

// Tuples rather than objects: a guest who has studied every word still sends
// a body well inside the route's limit.
export function guestQuestionProgress() {
  const { words, attempts } = getGuestState();
  return {
    words: Object.entries(words).map(([id, row]) =>
      [Number(id), row.repetition_level, Date.parse(row.next_review_at)]),
    attempts: Object.entries(attempts).map(([id, a]) =>
      [Number(id), a.selected_key, a.is_correct, Date.parse(a.answered_at)])
  };
}

// Graded here: the question list already carries the answer key and the word
// links, so a guest's answer needs no round trip.
export async function guestQuestionAttempt(question, selectedKey) {
  const key = selectedKey == null ? null : String(selectedKey).trim().toUpperCase();
  const isCorrect = key !== null && key === question.answer_key;
  const now = Date.now();
  const links = question.words || [];
  const updated = [];

  updateGuest((s) => {
    s.attempts[question.id] = { selected_key: key, is_correct: isCorrect, answered_at: new Date(now).toISOString() };

    for (const vocabId of scoredVocabIds(links, question.options, question.answer_key)) {
      const row = s.words[vocabId];
      const next = applyQuestionResult(row, isCorrect, now);
      if (!next) continue;
      s.words[vocabId] = next;
      const link = links.find((l) => Number(l.id) === vocabId);
      updated.push({
        vocab_id: vocabId,
        word: link ? link.word : null,
        previous_level: previousLevel(row),
        new_level: next.repetition_level,
        next_review_at: next.next_review_at
      });
    }
  });

  return { is_correct: isCorrect, answer_key: question.answer_key, updated_progress: updated };
}

/* ---------- sign-in merge ---------- */

function importPayload({ words, notebooks, attempts }) {
  return {
    words: Object.entries(words).map(([id, row]) => ({ vocab_id: Number(id), ...row })),
    notebooks: Object.entries(notebooks).map(([id, wordId]) =>
      ({ notebook_id: Number(id), current_word_id: Number(wordId) })),
    attempts: Object.entries(attempts).map(([id, a]) => ({ question_id: Number(id), ...a }))
  };
}

// Called with the new token already stored. The browser copy is cleared only
// once the server has it; if the call fails, it stays for the next attempt.
export async function mergeGuestProgress() {
  if (!hasGuestProgress()) return null;
  const snapshot = getGuestState();
  const result = await apiFetch('/progress/import', {
    method: 'POST',
    body: JSON.stringify(importPayload(snapshot))
  });
  // Something written meanwhile (another tab) is kept for the next merge,
  // which is safe to repeat.
  if (getGuestState() === snapshot) clearGuest();
  return result;
}
