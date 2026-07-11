import { describe, expect, it } from 'vitest';

import { formatLessonDate, mapLessonRecord } from '../lesson-record';

describe('lesson record mapping', () => {
  it('maps database field names to the lesson UI contract', () => {
    expect(mapLessonRecord({
      id: 'lesson-1',
      gradelevel: 'jhs 1',
      created_at: '2026-07-11T10:00:00.000Z',
      updated_at: '2026-07-11T11:00:00.000Z',
    })).toMatchObject({
      _id: 'lesson-1',
      gradeLevel: 'jhs 1',
      createdAt: '2026-07-11T10:00:00.000Z',
      updatedAt: '2026-07-11T11:00:00.000Z',
    });
  });

  it('formats missing or invalid historical timestamps safely', () => {
    expect(formatLessonDate(undefined)).toBe('Not available');
    expect(formatLessonDate('not-a-date')).toBe('Not available');
    expect(formatLessonDate('2026-07-11T10:00:00.000Z')).not.toBe('Invalid Date');
  });
});
