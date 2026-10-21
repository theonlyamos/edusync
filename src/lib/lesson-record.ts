import { GRADE_LEVELS } from './constants';

type LessonRecord = Record<string, unknown> & {
  id?: string;
  _id?: string;
  gradeLevel?: unknown;
  gradelevel?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

export function mapLessonRecord<T extends LessonRecord>(record: T) {
  return {
    ...record,
    _id: record._id ?? record.id,
    gradeLevel: record.gradeLevel ?? record.gradelevel ?? null,
    createdAt: record.createdAt ?? record.created_at ?? null,
    updatedAt: record.updatedAt ?? record.updated_at ?? null,
  };
}

export function formatLessonDate(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return 'Not available';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

export type LessonStatus = 'draft' | 'live' | 'archived';

export function lessonStatus(record: { archived_at?: unknown; current_publication_id?: unknown }): LessonStatus {
  if (record.archived_at) return 'archived';
  return record.current_publication_id ? 'live' : 'draft';
}

/** Objectives arrive as an array (current lessons) or a newline-separated string (older ones). */
export function lessonObjectiveList(objectives: unknown): string[] {
  const items = Array.isArray(objectives) ? objectives : typeof objectives === 'string' ? objectives.split('\n') : [];
  return items.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

/** "jhs 1" -> "JHS 1", "primary 3" -> "Primary 3". */
export function formatGradeLevel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'No grade';
  return value.trim().split(/\s+/).map((word) => (
    word.length <= 3 && /^[a-z]+$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
  )).join(' ');
}

/** Grades in school order (Primary 1 up to SHS 3); unknown grades keep their order at the end. */
export function orderGradeLevels(grades: readonly string[]): string[] {
  const rank = (grade: string) => {
    const index = (GRADE_LEVELS as readonly string[]).indexOf(grade.trim().toLowerCase());
    return index === -1 ? GRADE_LEVELS.length : index;
  };
  return [...new Set(grades)].map((grade, index) => ({ grade, index })).sort((a, b) => rank(a.grade) - rank(b.grade) || a.index - b.index).map(item => item.grade);
}
