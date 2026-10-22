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
  const resolved = applyThemePreference(preference);
  notifyThemeChange();
  return resolved;
}

const THEME_CHANGE_EVENT = 'theme-preference-change';

/** Tells every listener on this page (and other tabs, via storage) that the saved choice changed. */
function notifyThemeChange() {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Calls back whenever the saved preference changes, in this tab or another. */
export function subscribeThemePreference(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyThemePreference(readThemePreference());
      onChange();
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Follows the device's light/dark setting while the saved preference is
 * System. It reads the saved choice at the moment the device changes, so
 * several pages or menus watching at once never fight over a stale value.
 */
export function watchSystemTheme(onChange?: (resolved: 'light' | 'dark') => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media) return () => {};
  const listener = () => {
    if (readThemePreference() !== 'system') return;
    const resolved = applyThemePreference('system');
    onChange?.(resolved);
  };
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
