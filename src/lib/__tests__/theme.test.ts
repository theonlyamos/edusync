import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveThemePreference, subscribeThemePreference, watchSystemTheme } from '../theme';

let prefersDark = false;
let mediaListeners: Array<() => void> = [];

let classes: Set<string>;

beforeEach(() => {
  prefersDark = false;
  mediaListeners = [];
  classes = new Set();
  const store = new Map<string, string>();
  const events = new EventTarget();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  vi.stubGlobal('document', {
    documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } },
  });
  vi.stubGlobal('window', {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    matchMedia: () => ({
      get matches() { return prefersDark; },
      addEventListener: (_: string, cb: () => void) => mediaListeners.push(cb),
      removeEventListener: (_: string, cb: () => void) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

const deviceTurns = (dark: boolean) => { prefersDark = dark; mediaListeners.forEach((l) => l()); };
const isDark = () => classes.has('dark');

describe('theme preference', () => {
  it('follows the device while set to System', () => {
    const stop = watchSystemTheme();
    saveThemePreference('system');
    expect(isDark()).toBe(false);
    deviceTurns(true);
    expect(isDark()).toBe(true);
    stop();
  });

  it('ignores device changes once an explicit choice is saved, even with several watchers', () => {
    const stopA = watchSystemTheme();
    const stopB = watchSystemTheme();
    saveThemePreference('system');
    saveThemePreference('light');
    deviceTurns(true);
    expect(isDark()).toBe(false);
    stopA();
    stopB();
  });

  it('tells subscribers when the choice changes', () => {
    const onChange = vi.fn();
    const stop = subscribeThemePreference(onChange);
    saveThemePreference('dark');
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
