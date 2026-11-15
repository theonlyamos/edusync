/**
 * Notes a teacher flags while rehearsing a lesson in the student preview.
 * They wait in this browser until the teacher sends them to the co-author.
 * Browser storage is optional, so every access tolerates it being unavailable.
 */
export type RehearsalNote = {
  id: string;
  /** e.g. "Objective 2 · Explore", or "Lesson text". */
  where: string;
  artifactId?: string;
  note: string;
  at: string;
};

const MAX_NOTES = 20;
export const rehearsalNotesKey = (lessonId: string) => `insyte:rehearsal:${lessonId}`;

export function readRehearsalNotes(lessonId: string): RehearsalNote[] {
  try {
    const saved = JSON.parse(localStorage.getItem(rehearsalNotesKey(lessonId)) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.note === 'string' && typeof item.where === 'string').slice(-MAX_NOTES) : [];
  } catch { return []; }
}

export function addRehearsalNote(lessonId: string, note: Omit<RehearsalNote, 'id' | 'at'>): boolean {
  try {
    const next = [...readRehearsalNotes(lessonId), {
      ...note, note: note.note.trim().slice(0, 1_000), id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString(),
    }].slice(-MAX_NOTES);
    localStorage.setItem(rehearsalNotesKey(lessonId), JSON.stringify(next));
    return true;
  } catch { return false; }
}

export function clearRehearsalNotes(lessonId: string) {
  try { localStorage.removeItem(rehearsalNotesKey(lessonId)); } catch { /* optional */ }
}

/** One co-author message that hands over every flagged moment. */
export function rehearsalNotesMessage(notes: RehearsalNote[]) {
  const lines = notes.map((item) => `- ${item.where}${item.artifactId ? ` [${item.artifactId}]` : ''}: ${item.note}`);
  return `I rehearsed this lesson as a student and flagged these moments:\n${lines.join('\n')}\n\nSuggest fixes for them.`.slice(0, 4_000);
}

export const REHEARSAL_PROFILES = [
  { key: 'struggling', label: 'Struggling', description: 'a student who finds this subject hard, reads slowly and holds the usual misconceptions' },
  { key: 'on-level', label: 'On level', description: 'a typical student for this grade' },
  { key: 'advanced', label: 'Advanced', description: 'a quick student who already knows the basics and gets bored easily' },
] as const;

export function rehearsalPrompt(profile: (typeof REHEARSAL_PROFILES)[number]) {
  return `Rehearse this lesson as ${profile.description}. Walk through the introduction and each objective's materials in order. For each, say in a line what this student would think or do and where they would get stuck. Then propose the most useful fixes.`;
}
