import { describe, expect, it } from 'vitest';

import { canManageLesson } from '../access';

describe('lesson artifact authorization', () => {
  it('supports both legacy lesson ownership and normalized teacher ownership', () => {
    expect(
      canManageLesson({
        user: { id: 'legacy-teacher', role: 'teacher' },
        lesson: { teacher: 'legacy-teacher', teacher_id: null },
        normalizedTeacherUserId: null,
      }),
    ).toBe(true);

    expect(
      canManageLesson({
        user: { id: 'normalized-teacher', role: 'teacher' },
        lesson: { teacher: null, teacher_id: 'teacher-row' },
        normalizedTeacherUserId: 'normalized-teacher',
      }),
    ).toBe(true);
  });

  it('allows admins and rejects unrelated teachers', () => {
    expect(
      canManageLesson({
        user: { id: 'admin', role: 'admin' },
        lesson: { teacher: null, teacher_id: null },
        normalizedTeacherUserId: null,
      }),
    ).toBe(true);

    expect(
      canManageLesson({
        user: { id: 'other', role: 'teacher' },
        lesson: { teacher: 'owner', teacher_id: 'teacher-row' },
        normalizedTeacherUserId: 'owner',
      }),
    ).toBe(false);
  });
});
