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
