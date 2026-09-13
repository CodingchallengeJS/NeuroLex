import { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

const systemMode = () => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('evl_theme_mode') || 'system';
  });
  // What is actually on screen: 'system' resolved to light or dark. Components
  // that cannot read CSS variables (the ApexCharts SVG) pick their colours from it.
  const [resolvedTheme, setResolvedTheme] = useState(() => (theme === 'system' ? systemMode() : theme));

  useEffect(() => {
    const applyTheme = (mode) => {
      const actualMode = mode === 'system' ? systemMode() : mode;
      document.documentElement.setAttribute('data-theme', actualMode);
      setResolvedTheme(actualMode);
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      if (theme === 'system') applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = (mode) => {
    setThemeState(mode);
    localStorage.setItem('evl_theme_mode', mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
