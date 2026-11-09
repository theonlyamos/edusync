export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;
export const SEARCH_GROUP_LIMIT = 6;

export type SearchKind = 'student' | 'teacher' | 'class' | 'lesson' | 'homework';

export type SearchResult = {
  kind: SearchKind;
  id: string;
  title: string;
  /** A short second line, e.g. the grade or subject. */
  detail: string;
  href: string;
};

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  student: 'Students',
  teacher: 'Teachers',
  class: 'Classes',
  lesson: 'Lessons',
  homework: 'Homework',
};

/** Tidies what was typed. Returns null when it is too short to search. */
export function cleanSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX);
  return text.length >= SEARCH_MIN ? text : null;
}

/** Makes typed text safe inside a SQL LIKE pattern, matching anywhere in the value. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
