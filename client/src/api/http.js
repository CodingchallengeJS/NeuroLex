// Same-origin by default: in the Docker/Render image Express serves this build
// and the API from one host, so a relative path works over both http and https.
// For `npm run dev` against a separately running backend, set VITE_API_BASE in
// client/.env (e.g. VITE_API_BASE=http://localhost:8000/api).
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const TOKEN_KEY = 'evl_access_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
