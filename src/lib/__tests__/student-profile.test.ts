import { describe, expect, it } from 'vitest';

import { resolveStudentDisplayName, studentProfileQueryKey } from '../student-profile';

describe('student profile display name', () => {
  it('prefers the application profile and falls back through auth metadata and email', () => {
    expect(resolveStudentDisplayName({ profileName: 'Ada Lovelace', metadataName: 'Ada', email: 'ada@example.com' })).toBe('Ada Lovelace');
    expect(resolveStudentDisplayName({ profileName: ' ', metadataName: 'Grace', email: 'grace@example.com' })).toBe('Grace');
    expect(resolveStudentDisplayName({ email: 'student@test.com' })).toBe('student');
    expect(resolveStudentDisplayName({})).toBe('there');
  });
});

describe('student profile query key', () => {
  it('isolates cached profiles by authenticated user', () => {
    expect(studentProfileQueryKey('student-1')).not.toEqual(studentProfileQueryKey('student-2'));
    expect(studentProfileQueryKey('student-1')).toEqual(['student-profile', 'student-1']);
  });
});
