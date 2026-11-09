import { describe, expect, it } from 'vitest';
import { daysUntil, groupByTime, holidayOn, overlappingTerm, parseCalendarInput, termOn, type CalendarEntry } from '@/lib/school-calendar';
import { cleanSearchQuery, likePattern } from '@/lib/search';

const entry = (id: string, kind: CalendarEntry['kind'], startsOn: string, endsOn: string): CalendarEntry => ({ id, kind, title: `Entry ${id}`, startsOn, endsOn });
const entries = [
  entry('t1', 'term', '2026-09-07', '2026-12-11'),
  entry('h1', 'holiday', '2026-10-26', '2026-10-30'),
  entry('x1', 'exam', '2026-12-01', '2026-12-05'),
  entry('t2', 'term', '2027-01-11', '2027-04-02'),
  entry('old', 'event', '2026-06-01', '2026-06-01'),
];

describe('school calendar', () => {
  it('accepts a clean entry and defaults a missing last day to the first', () => {
    expect(parseCalendarInput({ kind: 'holiday', title: '  Mid-term   break ', startsOn: '2026-10-26' })).toEqual({ kind: 'holiday', title: 'Mid-term break', startsOn: '2026-10-26', endsOn: '2026-10-26' });
  });

  it('explains what is wrong with a bad entry', () => {
    expect(parseCalendarInput(null)).toMatch(/kind/);
    expect(parseCalendarInput({ kind: 'party', title: 'x', startsOn: '2026-10-26' })).toMatch(/kind/);
    expect(parseCalendarInput({ kind: 'term', title: ' ', startsOn: '2026-10-26' })).toMatch(/name/);
    expect(parseCalendarInput({ kind: 'term', title: 'x'.repeat(81), startsOn: '2026-10-26' })).toMatch(/under 80/);
    expect(parseCalendarInput({ kind: 'term', title: 'T', startsOn: '2026-02-30', endsOn: '2026-03-01' })).toMatch(/valid dates/);
    expect(parseCalendarInput({ kind: 'term', title: 'T', startsOn: '2026-03-02', endsOn: '2026-03-01' })).toMatch(/before/);
    expect(parseCalendarInput({ kind: 'term', title: 'T', startsOn: '2026-01-01', endsOn: '2028-01-01' })).toMatch(/too long/);
  });

  it('finds the term and holiday for a day', () => {
    expect(termOn(entries, '2026-10-27')?.id).toBe('t1');
    expect(termOn(entries, '2026-12-25')).toBeNull();
    expect(holidayOn(entries, '2026-10-30')?.id).toBe('h1');
    expect(holidayOn(entries, '2026-10-31')).toBeNull();
  });

  it('refuses overlapping terms but lets other kinds overlap', () => {
    expect(overlappingTerm(entries, { kind: 'term', title: 'T', startsOn: '2026-12-11', endsOn: '2026-12-20' })?.id).toBe('t1');
    expect(overlappingTerm(entries, { kind: 'term', title: 'T', startsOn: '2026-12-12', endsOn: '2027-01-10' })).toBeNull();
    expect(overlappingTerm(entries, { kind: 'term', title: 'T', startsOn: '2026-09-01', endsOn: '2026-12-20' }, 't1')).toBeNull();
    expect(overlappingTerm(entries, { kind: 'holiday', title: 'H', startsOn: '2026-10-01', endsOn: '2026-10-02' })).toBeNull();
  });

  it('groups entries into now, upcoming and past', () => {
    const groups = groupByTime(entries, '2026-12-02');
    expect(groups.now.map((e) => e.id)).toEqual(['t1', 'x1']);
    expect(groups.upcoming.map((e) => e.id)).toEqual(['t2']);
    expect(groups.past.map((e) => e.id)).toEqual(['h1', 'old']);
    expect(daysUntil(entries[3], '2027-01-10')).toBe(1);
    expect(daysUntil(entries[0], '2026-12-02')).toBe(0);
  });
});

describe('search text', () => {
  it('needs at least two characters and trims long text', () => {
    expect(cleanSearchQuery(' a ')).toBeNull();
    expect(cleanSearchQuery(undefined)).toBeNull();
    expect(cleanSearchQuery('  ama   mensah ')).toBe('ama mensah');
    expect(cleanSearchQuery('x'.repeat(200))).toHaveLength(60);
  });

  it('keeps LIKE wildcards in typed text literal', () => {
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});
