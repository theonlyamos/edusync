import { describe, expect, it } from 'vitest';
import { attendanceRate, buildGradebook, csvValue, gradebookCsv, isDay, shiftDay, subjectResults, type MarkItem } from '@/lib/school-records';

const mark = (studentId: string, itemId: string, earned: number, possible: number, extra: Partial<MarkItem> = {}): MarkItem => ({
  studentId, kind: 'homework', itemId, title: `Work ${itemId}`, subject: 'Physics', at: `2026-11-0${itemId}T10:00:00Z`, earned, possible, ...extra,
});

describe('days', () => {
  it('accepts only real calendar days', () => {
    expect(isDay('2026-11-09')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-1-9')).toBe(false);
    expect(isDay('2026-11-09T00:00:00Z')).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it('moves across month and year ends', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('attendance rate', () => {
  it('counts late as in class and has no rate with nothing marked', () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 1, excused: 1, days: 10 })).toBe(80);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0, days: 0 })).toBeNull();
  });
});

describe('gradebook', () => {
  const students = [{ studentId: 'a', name: 'Ama' }, { studentId: 'b', name: 'Kofi' }, { studentId: 'c', name: 'Yaw' }];
  const book = buildGradebook(students, [mark('a', '2', 8, 10), mark('a', '1', 5, 10), mark('b', '1', 10, 10), mark('b', '3', 15, 20, { kind: 'assessment', subject: 'Maths' })]);

  it('has one column per piece of work, oldest first', () => {
    expect(book.columns.map((c) => c.key)).toEqual(['homework:1', 'homework:2', 'assessment:3']);
  });

  it('weights each average by the points available', () => {
    expect(book.rows.map((row) => [row.name, row.average, row.marked])).toEqual([['Ama', 65, 2], ['Kofi', 83, 2], ['Yaw', null, 0]]);
    expect(book.classAverage).toBe(76);
    expect(book.rows[0].cells['homework:2']).toBe(80);
    expect(book.rows[2].cells['homework:1']).toBeUndefined();
  });

  it('exports a CSV that a spreadsheet cannot run as a formula', () => {
    const csv = gradebookCsv(buildGradebook([{ studentId: 'x', name: '=HYPERLINK("http://evil")' }], [mark('x', '1', 5, 10, { title: 'Quiz, part 1' })]));
    const [head, row] = csv.split('\r\n');
    expect(head).toBe('Student,"Quiz, part 1 (Physics)",Average %');
    expect(row.startsWith('"\'=HYPERLINK(""http://evil"")"')).toBe(true);
    expect(csvValue(-5)).toBe('-5');
    expect(csvValue(null)).toBe('');
  });
});

describe('report card subjects', () => {
  it('groups marks by subject, whatever the letter case, and totals them', () => {
    const result = subjectResults([
      mark('a', '1', 5, 10),
      mark('a', '2', 9, 10, { subject: 'physics ' }),
      mark('a', '3', 30, 40, { kind: 'assessment', subject: 'Maths' }),
      mark('a', '4', 1, 2, { subject: '' }),
    ]);
    expect(result.subjects).toEqual([
      { subject: 'General', homework: 1, assessments: 0, percentage: 50 },
      { subject: 'Maths', homework: 0, assessments: 1, percentage: 75 },
      { subject: 'Physics', homework: 2, assessments: 0, percentage: 70 },
    ]);
    expect(result.overall).toBe(73);
    expect(subjectResults([])).toEqual({ subjects: [], overall: null });
  });
});

describe('dayStart', () => {
  it('finds the start of a school day in its own time zone', async () => {
    const { dayStart } = await import('@/lib/school-reports');
    expect(dayStart('2026-11-09', 'UTC')).toBe('2026-11-09T00:00:00.000Z');
    expect(dayStart('2026-11-09', 'America/New_York')).toBe('2026-11-09T05:00:00.000Z');
    expect(dayStart('2026-11-09', 'Africa/Accra')).toBe('2026-11-09T00:00:00.000Z');
    expect(dayStart('2026-11-09', 'Asia/Kolkata')).toBe('2026-11-08T18:30:00.000Z');
    // Clocks go forward and back in New York on these days.
    expect(dayStart('2026-03-08', 'America/New_York')).toBe('2026-03-08T05:00:00.000Z');
    expect(dayStart('2026-03-09', 'America/New_York')).toBe('2026-03-09T04:00:00.000Z');
    expect(dayStart('2026-11-01', 'America/New_York')).toBe('2026-11-01T04:00:00.000Z');
    expect(dayStart('2026-11-02', 'America/New_York')).toBe('2026-11-02T05:00:00.000Z');
    expect(dayStart('2026-11-09', 'Not/AZone')).toBe('2026-11-09T00:00:00.000Z');
    expect(dayStart('2026-11-09', null)).toBe('2026-11-09T00:00:00.000Z');
  });
});
