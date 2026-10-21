'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '../lib/browser-storage';

type Theme = 'light' | 'dark' | 'system';
interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = 'dte_theme';
let memoryTheme: Theme = 'system';
function snapshot(): string {
  const saved = readStorage(STORAGE_KEY);
  const theme = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : memoryTheme;
  const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  return `${theme}:${resolved}`;
}
function subscribe(notify: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', notify);
  window.addEventListener('storage', notify);
  window.addEventListener('dte-theme-change', notify);
  return () => {
    media.removeEventListener('change', notify);
    window.removeEventListener('storage', notify);
    window.removeEventListener('dte-theme-change', notify);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useSyncExternalStore(subscribe, snapshot, () => 'system:dark');
  const [theme, resolvedTheme] = value.split(':') as [Theme, 'light' | 'dark'];
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  const setTheme = (next: Theme) => {
    memoryTheme = next;
    writeStorage(STORAGE_KEY, next);
    window.dispatchEvent(new Event('dte-theme-change'));
  };
  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark') }}>
    {children}
  </ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
