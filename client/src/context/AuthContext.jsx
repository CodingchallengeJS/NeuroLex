import { createContext, useState, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, fetchMe } from '../api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('evl_access_token'));
  const [loading, setLoading] = useState(true);

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

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('evl_access_token', data.accessToken);
  };

  const register = async (username, email, password) => {
    return await apiRegister(username, email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('evl_access_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
