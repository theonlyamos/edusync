import { describe, expect, it } from 'vitest';
import { buildAttendance, visualLabel } from '@/lib/live-class-summary';

describe('live class summary', () => {
  it('counts students who joined and leaves out the host', () => {
    const result = buildAttendance(
      [
        { user_id: 't', role: 'host', joined_at: '2026-10-22T15:00:00Z' },
        { user_id: 'a', role: 'student', joined_at: '2026-10-22T15:05:00Z' },
        { user_id: 'b', role: 'student', joined_at: null },
        { user_id: 'c', role: null, joined_at: '2026-10-22T15:01:00Z' },
      ],
      new Map([['a', 'Ama'], ['b', 'Kofi'], ['c', 'Esi']]),
      't',
    );
    expect(result.attendance).toEqual({ joined: 2, invited: 3 });
    expect(result.students.map((s) => s.name)).toEqual(['Esi', 'Ama', 'Kofi']);
  });

  it('labels visuals', () => {
    expect(visualLabel('Number line for 0.5', null)).toBe('Number line for 0.5');
    expect(visualLabel(null, 'First line\nsecond')).toBe('First line');
    expect(visualLabel(null, null)).toBe('Visual');
    expect(visualLabel('x'.repeat(200), null)).toHaveLength(158);
  });
});
