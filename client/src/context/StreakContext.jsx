import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from './AuthContext';
import { fetchStreak } from '../api';

// One copy of /api/streak for the whole app: the navbar badge, the daily panel
// and the 5-question session all read it, and anything that answers a SAT
// question or finishes a quiz calls refreshStreak() so they update together.
export const StreakContext = createContext({ streak: null, refreshStreak: () => {} });

export function StreakProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [streak, setStreak] = useState(null);
  const latest = useRef(0);

  const refreshStreak = useCallback(() => {
    if (!user) {
      setStreak(null);
      return Promise.resolve(null);
    }
    // Answers can land in quick succession; only the newest response wins.
    const ticket = ++latest.current;
    return fetchStreak()
      .then((data) => {
        if (ticket === latest.current) setStreak(data);
        return data;
      })
      .catch(() => null);
  }, [user]);

  useEffect(() => { refreshStreak(); }, [refreshStreak]);

  // Coming back to the tab after midnight should show the new day.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refreshStreak(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refreshStreak]);

  return (
    <StreakContext.Provider value={{ streak, refreshStreak }}>
      {children}
    </StreakContext.Provider>
  );
}
