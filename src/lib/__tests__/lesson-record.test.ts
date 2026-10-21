import { describe, expect, it } from 'vitest';

import { formatGradeLevel, formatLessonDate, lessonObjectiveList, lessonStatus, mapLessonRecord } from '../lesson-record';

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

describe('lesson list helpers', () => {
  it('derives draft, live and archived status', () => {
    expect(lessonStatus({})).toBe('draft');
    expect(lessonStatus({ current_publication_id: 'pub-1' })).toBe('live');
    expect(lessonStatus({ current_publication_id: 'pub-1', archived_at: '2026-10-21T19:00:00Z' })).toBe('archived');
  });

  it('reads objectives from arrays and older newline strings', () => {
    expect(lessonObjectiveList(['Define force.', ' ', 'Calculate net force.'])).toEqual(['Define force.', 'Calculate net force.']);
    expect(lessonObjectiveList('Define force.\nCalculate net force.\n')).toEqual(['Define force.', 'Calculate net force.']);
    expect(lessonObjectiveList(null)).toEqual([]);
  });

  it('formats grade levels for display', () => {
    expect(formatGradeLevel('jhs 1')).toBe('JHS 1');
    expect(formatGradeLevel('primary 3')).toBe('Primary 3');
    expect(formatGradeLevel('')).toBe('No grade');
  });
});
