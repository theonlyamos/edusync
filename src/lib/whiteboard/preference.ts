/**
 * Remembers whether the learner wants whiteboard mode. Storage can be blocked
 * (private windows, the tutor embedded on another site), so every access is
 * guarded and the caller falls back to its default.
 */

const KEY = 'insyte:tutor-whiteboard';

export function readWhiteboardPreference(): boolean | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

export function saveWhiteboardPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    // Not being able to remember the choice is fine; it still applies to this session.
  }
}

/** Reads the embed's `whiteboard` URL parameter: on, off, or not set. */
export function parseWhiteboardParam(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  return undefined;
}
