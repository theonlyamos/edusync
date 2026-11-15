import { afterEach, describe, expect, it, vi } from 'vitest';

import { addRehearsalNote, clearRehearsalNotes, readRehearsalNotes, rehearsalNotesMessage } from '../rehearsal-notes';

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
}

describe('rehearsal notes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps notes per lesson and turns them into one co-author message', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(addRehearsalNote('lesson-1', { where: 'Objective 1 · interactive visual', artifactId: 'a1', note: 'Slider label unclear' })).toBe(true);
    addRehearsalNote('lesson-1', { where: 'Lesson text', note: 'Too long' });
    addRehearsalNote('lesson-2', { where: 'Lesson text', note: 'Other lesson' });
    const notes = readRehearsalNotes('lesson-1');
    expect(notes.map((item) => item.note)).toEqual(['Slider label unclear', 'Too long']);
    expect(rehearsalNotesMessage(notes)).toContain('- Objective 1 · interactive visual [a1]: Slider label unclear\n- Lesson text: Too long');
    clearRehearsalNotes('lesson-1');
    expect(readRehearsalNotes('lesson-1')).toEqual([]);
    expect(readRehearsalNotes('lesson-2')).toHaveLength(1);
  });

  it('copes when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(readRehearsalNotes('lesson')).toEqual([]);
    expect(addRehearsalNote('lesson', { where: 'x', note: 'y' })).toBe(false);
    expect(() => clearRehearsalNotes('lesson')).not.toThrow();
  });
});
