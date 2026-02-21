import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'openclaw-theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  // 'system' | 'dark' | 'light'
  const [preference, setPreference] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  const [resolved, setResolved] = useState(() =>
    preference === 'system' ? getSystemTheme() : preference
  );

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (preference !== 'system') {
      setResolved(preference);
      return;
    }
    setResolved(getSystemTheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setResolved(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  // Apply class + persist
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {}
  }, [resolved, preference]);

  const setTheme = useCallback((value) => {
    setPreference(value);
  }, []);

  const cycleTheme = useCallback(() => {
    setPreference(prev => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  }, []);

  const isDark = resolved === 'dark';

  return (
    <ThemeContext.Provider value={{ theme: resolved, preference, isDark, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
