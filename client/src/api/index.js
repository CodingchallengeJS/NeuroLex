// Same-origin by default: in the Docker/Render image Express serves this build
// and the API from one host, so a relative path works over both http and https.
// For `npm run dev` against a separately running backend, set VITE_API_BASE in
// client/.env (e.g. VITE_API_BASE=http://localhost:8000/api).
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('evl_access_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const login = (email, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const register = (username, email, password) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
export const fetchMe = () => apiFetch('/auth/me');
export const fetchVocabCount = () => apiFetch('/vocabs/count');
export const fetchNotebooks = () => apiFetch('/notebooks');
export const fetchNotebookVocabs = (notebookId) => apiFetch(`/notebooks/${notebookId}/vocabs`);
export const fetchRepetitionSummary = (notebookId) => apiFetch(notebookId ? `/repetition/summary?notebook_id=${notebookId}` : '/repetition/summary');
export const fetchRepetitionItems = (bucket, notebookId) => apiFetch(`/repetition/items?bucket=${bucket}${notebookId ? `&notebook_id=${notebookId}` : ''}`);
export const generateQuiz = (bucket, notebookId) => apiFetch(`/quiz/generate?bucket=${bucket}${notebookId ? `&notebook_id=${notebookId}` : ''}`);
export const submitQuiz = (results) => apiFetch('/quiz/submit', { method: 'POST', body: JSON.stringify({ results }) });
export const searchVocab = (query, notebookId) => apiFetch(`/search?q=${encodeURIComponent(query)}${notebookId ? `&notebook_id=${notebookId}` : ''}`);
export const splitChunk = () => apiFetch('/repetition/split-chunk', { method: 'POST' });
export const fetchReviewSequence = (notebookId) => apiFetch(`/notebooks/${notebookId}/review-sequence`);
export const submitReviewStep = (notebookId, vocabId, correctCount) => apiFetch(`/notebooks/${notebookId}/review-step`, { method: 'POST', body: JSON.stringify({ vocab_id: vocabId, correct_count: correctCount }) });
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

// --- Word tags ---
export const fetchVocabTags = (vocabId) => apiFetch(`/vocabs/${vocabId}/tags`);
export const setVocabTags = (vocabId, tags) => apiFetch(`/vocabs/${vocabId}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
export const bulkTagVocabs = (tag, vocabIds, action) => apiFetch('/vocabs/tags/bulk', { method: 'POST', body: JSON.stringify({ tag, vocab_ids: vocabIds, action }) });
export const fetchVocabsByTag = (slug) => apiFetch(`/vocabs/by-tag/${encodeURIComponent(slug)}`);
