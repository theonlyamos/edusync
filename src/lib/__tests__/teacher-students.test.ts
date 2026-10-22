import { describe, expect, it } from 'vitest';
import { latestActivity, rosterRows, studentHomework, studentObjectives } from '@/lib/teacher-students';

const now = new Date('2026-10-22T12:00:00Z');
const homeworks = [
  {
    id: 'h1', title: 'Fractions', due_at: '2026-10-20T12:00:00Z', close_at: null,
    questions: [{ id: 'q1', points: 2, objectiveId: 'o1' }, { id: 'q2', points: 2, objectiveId: 'o2' }],
    objectives: [{ id: 'o1', text: 'Add fractions' }, { id: 'o2', text: 'Compare fractions' }],
  },
  {
    id: 'h2', title: 'Decimals', due_at: '2026-10-25T12:00:00Z', close_at: null,
    questions: [{ id: 'q1', points: 4, objectiveId: 'o3' }],
    objectives: [{ id: 'o3', text: 'Round decimals' }],
  },
];
const recipients = [
  { homework_id: 'h1', student_id: 'ama', extension_at: null },
  { homework_id: 'h2', student_id: 'ama', extension_at: null },
  { homework_id: 'h1', student_id: 'kofi', extension_at: null },
];
const attempts = [
  { id: 'a1', homework_id: 'h1', student_id: 'ama', attempt_number: 1, submitted_at: '2026-10-21T09:00:00Z', late: true },
];
const grades = [
  { attempt_id: 'a1', marks: { q1: { score: 2 }, q2: { score: 0 } }, released_at: '2026-10-21T10:00:00Z', released_marks: { q1: { score: 2 }, q2: { score: 0 } } },
];

describe('teacher students', () => {
  it('builds a homework history per student', () => {
    const rows = studentHomework({ studentId: 'ama', homeworks, recipients, attempts, grades, now });
    expect(rows.map((r) => [r.title, r.state, r.score, r.late])).toEqual([
      ['Decimals', 'open', null, false],
      ['Fractions', 'released', 50, true],
    ]);
    const kofi = studentHomework({ studentId: 'kofi', homeworks, recipients, attempts, grades, now });
    expect(kofi[0].state).toBe('missed');
  });

  it('summarises the roster', () => {
    const rows = rosterRows({
      students: [{ id: 'kofi', name: 'Kofi', grade: 'jhs 1' }, { id: 'ama', name: 'Ama', grade: 'jhs 1' }],
      homeworks, recipients, attempts, grades, now,
      lastActive: new Map([['ama', '2026-10-21T09:00:00Z']]),
    });
    expect(rows[0]).toMatchObject({ name: 'Ama', assigned: 2, submitted: 1, late: 1, missed: 0, averageScore: 50, lastActive: '2026-10-21T09:00:00Z' });
    expect(rows[1]).toMatchObject({ name: 'Kofi', assigned: 1, submitted: 0, missed: 1, averageScore: null, lastActive: null });
  });

  it('scores objectives from marked work, lowest first', () => {
    const rows = studentObjectives({ studentId: 'ama', homeworks, attempts, grades });
    expect(rows.map((r) => [r.text, r.percentage])).toEqual([['Compare fractions', 0], ['Add fractions', 100]]);
  });

  it('keeps the latest activity per student', () => {
    const map = latestActivity([
      { student_id: 'a', at: '2026-10-01T00:00:00Z' },
      { student_id: 'a', at: '2026-10-05T00:00:00Z' },
      { student_id: 'b', at: null },
    ]);
    expect(map.get('a')).toBe('2026-10-05T00:00:00Z');
    expect(map.has('b')).toBe(false);
  });
});
