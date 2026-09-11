import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { login as apiLogin, register as apiRegister, fetchMe, mergeGuestProgress } from '../api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('evl_access_token'));
  const [loading, setLoading] = useState(true);
  // The login modal is opened from here so any "sign in to save" prompt can
  // open it, not just the navbar button.
  const [authOpen, setAuthOpen] = useState(false);
  // What happened to a guest's browser progress at sign-in; the navbar shows it.
  const [mergeNotice, setMergeNotice] = useState(null);
  const mergedAtLogin = useRef(false);

  useEffect(() => {
    if (token) {
      fetchMe()
        .then(data => setUser(data.user))
        .catch(() => {
          setToken(null);
          localStorage.removeItem('evl_access_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  // A failed merge is not a failed login: the progress stays in the browser
  // and is tried again on the next visit.
  const mergeGuest = useCallback(async () => {
    try {
      const result = await mergeGuestProgress();
      if (result) setMergeNotice({ ok: true, ...result.imported });
    } catch {
      setMergeNotice({ ok: false });
    }
  }, []);

  // The retry: a saved session confirmed on page load, with guest progress
  // still waiting from a merge that failed (offline, server still waking up).
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    if (mergedAtLogin.current) {
      mergedAtLogin.current = false;
      return;
    }
    mergeGuest();
  }, [userId, mergeGuest]);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    // Stored before merging, because the import call authenticates with it.
    // The merge also finishes before `user` is set, so pages that refetch on
    // sign-in already see the merged progress.
    localStorage.setItem('evl_access_token', data.accessToken);
    await mergeGuest();
    mergedAtLogin.current = true;
    setToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (username, email, password) => {
    return await apiRegister(username, email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('evl_access_token');
  };

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const dismissMergeNotice = useCallback(() => setMergeNotice(null), []);

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, register, logout,
      authOpen, openAuth, closeAuth, mergeNotice, dismissMergeNotice
    }}>
      {children}
    </AuthContext.Provider>
  );
}
