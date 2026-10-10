/**
 * SIGNA Theme System
 * Supports 'system' (default), 'light', and 'dark' preferences.
 * Updates the root documentElement class for Tailwind dark mode styling.
 */

import { useState, useEffect } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'signa_theme_preference';
const LEGACY_THEME_STORAGE_KEY = 'jexi_theme_preference';

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'system';
}

export function applyTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // ignore
  }

  const isDark =
    pref === 'dark' ||
    (pref === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }
}

export function useTheme(): [ThemePreference, (pref: ThemePreference) => void] {
  const [theme, setThemeState] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = () => {
      if (getThemePreference() === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleMedia);
    return () => mediaQuery.removeEventListener('change', handleMedia);
  }, [theme]);

  const setTheme = (pref: ThemePreference) => {
    setThemeState(pref);
    applyTheme(pref);
  };

  return [theme, setTheme];
}

export function initTheme(): () => void {
  if (typeof window === 'undefined') return () => {};

  const currentPref = getThemePreference();
  applyTheme(currentPref);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (getThemePreference() === 'system') {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}
