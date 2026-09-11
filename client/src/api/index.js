import { apiFetch, getToken } from './http.js';
import * as guest from './guest.js';

export { apiFetch };
export { mergeGuestProgress } from './guest.js';

// Progress calls go to the server for a signed-in user. A guest's are answered
// from this browser by ./guest.js, in the same response shape, so pages call
// these without caring which one they are talking to.
const signedIn = () => Boolean(getToken());

export const login = (email, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const register = (username, email, password) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
export const fetchMe = () => apiFetch('/auth/me');
export const fetchVocabCount = () => apiFetch('/vocabs/count');
export const fetchNotebooks = () => apiFetch('/notebooks');
export const fetchNotebookVocabs = (notebookId) => (signedIn()
  ? apiFetch(`/notebooks/${notebookId}/vocabs`)
  : guest.guestNotebookVocabs(notebookId));
export const fetchRepetitionSummary = (notebookId) => (signedIn()
  ? apiFetch(notebookId ? `/repetition/summary?notebook_id=${notebookId}` : '/repetition/summary')
  : guest.guestRepetitionSummary(notebookId));
export const fetchRepetitionItems = (bucket, notebookId) => apiFetch(`/repetition/items?bucket=${bucket}${notebookId ? `&notebook_id=${notebookId}` : ''}`);
export const generateQuiz = (bucket, notebookId) => (signedIn()
  ? apiFetch(`/quiz/generate?bucket=${bucket}${notebookId ? `&notebook_id=${notebookId}` : ''}`)
  : guest.guestGenerateQuiz(bucket, notebookId));
export const submitQuiz = (results) => (signedIn()
  ? apiFetch('/quiz/submit', { method: 'POST', body: JSON.stringify({ results }) })
  : guest.guestSubmitQuiz(results));
export const searchVocab = (query, notebookId) => apiFetch(`/search?q=${encodeURIComponent(query)}${notebookId ? `&notebook_id=${notebookId}` : ''}`);
export const splitChunk = () => apiFetch('/repetition/split-chunk', { method: 'POST' });
export const fetchReviewSequence = (notebookId) => (signedIn()
  ? apiFetch(`/notebooks/${notebookId}/review-sequence`)
  : guest.guestReviewSequence(notebookId));
export const submitReviewStep = (notebookId, vocabId, correctCount) => (signedIn()
  ? apiFetch(`/notebooks/${notebookId}/review-step`, { method: 'POST', body: JSON.stringify({ vocab_id: vocabId, correct_count: correctCount }) })
  : guest.guestReviewStep(notebookId, vocabId, correctCount));
export const createNotebook = (data) => apiFetch('/notebooks', { method: 'POST', body: JSON.stringify(data) });
export const addVocabToNotebook = (notebookId, data) => apiFetch(`/notebooks/${notebookId}/vocabs`, { method: 'POST', body: JSON.stringify(data) });
export const updateVocab = (vocabId, data) => apiFetch(`/vocabs/${vocabId}`, { method: 'PUT', body: JSON.stringify(data) });

// --- Tags ---
export const fetchTags = (scope) => apiFetch(scope ? `/tags?scope=${scope}` : '/tags');
export const createTag = (data) => apiFetch('/tags', { method: 'POST', body: JSON.stringify(data) });
export const updateTag = (tagId, data) => apiFetch(`/tags/${tagId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTag = (tagId) => apiFetch(`/tags/${tagId}`, { method: 'DELETE' });
export const setNotebookTags = (notebookId, tags) => apiFetch(`/notebooks/${notebookId}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });

// Notebooks filtered by tag slugs (AND) and/or a title search.
export const fetchNotebooksFiltered = ({ tags = [], q = '' } = {}) => {
  const params = new URLSearchParams();
  tags.forEach((t) => params.append('tag', t));
  if (q) params.set('q', q);
  const qs = params.toString();
  return apiFetch(qs ? `/notebooks?${qs}` : '/notebooks');
};

// --- Question bank ---
// only_studied has its own endpoint for a signed-in user: it is the feature the
// bank exists for. A guest's progress is in the browser, so it travels in the
// body of /questions/guest and only_studied is just another filter there.
export const fetchQuestions = ({ tags = [], only_studied = false, ...rest } = {}) => {
  const params = new URLSearchParams();
  tags.forEach((t) => params.append('tag', t));
  Object.entries(rest).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    params.set(key, value === true ? '1' : String(value));
  });

  if (!signedIn()) {
    if (only_studied) params.set('only_studied', '1');
    const qs = params.toString();
    return apiFetch(qs ? `/questions/guest?${qs}` : '/questions/guest', {
      method: 'POST',
      body: JSON.stringify(guest.guestQuestionProgress())
    });
  }

  const qs = params.toString();
  const base = only_studied ? '/questions/studied' : '/questions';
  return apiFetch(qs ? `${base}?${qs}` : base);
};
// Takes the whole question: a guest's answer is graded from its answer key and
// word links without a round trip.
export const submitQuestionAttempt = (question, selectedKey) => (signedIn()
  ? apiFetch('/questions/attempt', { method: 'POST', body: JSON.stringify({ question_id: question.id, selected_key: selectedKey }) })
  : guest.guestQuestionAttempt(question, selectedKey));

// --- Word tags ---
export const fetchVocabTags = (vocabId) => apiFetch(`/vocabs/${vocabId}/tags`);
export const setVocabTags = (vocabId, tags) => apiFetch(`/vocabs/${vocabId}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
export const bulkTagVocabs = (tag, vocabIds, action) => apiFetch('/vocabs/tags/bulk', { method: 'POST', body: JSON.stringify({ tag, vocab_ids: vocabIds, action }) });
export const fetchVocabsByTag = (slug) => apiFetch(`/vocabs/by-tag/${encodeURIComponent(slug)}`);
