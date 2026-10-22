/**
 * Light/dark/system appearance shared by every portal. The choice is kept in
 * localStorage under `theme`; when nothing is saved the app stays dark.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme';

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 'dark';
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Applies a preference to the page without saving it. */
export function applyThemePreference(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export function saveThemePreference(preference: ThemePreference): 'light' | 'dark' {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Still apply it for this page view.
  }
  return applyThemePreference(preference);
}
