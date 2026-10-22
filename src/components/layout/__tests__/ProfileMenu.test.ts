import { describe, expect, it } from 'vitest';
import { initials, profileMenuLinks } from '../ProfileMenu';

const labels = (links: { label: string; href: string }[]) => links.map((l) => `${l.label} ${l.href}`);
const managed = { id: 's1', name: 'Hill School', canManage: true };
const member = { id: 's1', name: 'Hill School', canManage: false };

describe('profileMenuLinks', () => {
  it('gives school managers school billing and the school page', () => {
    expect(labels(profileMenuLinks('teacher', managed))).toEqual([
      'Billing /learn/org/s1?tab=billing',
      'Settings /teachers/profile',
      'My school /learn/org/s1',
    ]);
  });

  it('hides billing and the school page from ordinary school members', () => {
    expect(labels(profileMenuLinks('teacher', member))).toEqual(['Settings /teachers/profile']);
    expect(profileMenuLinks('student', member)).toEqual([]);
  });

  it('sends people without a school to their own credits', () => {
    expect(labels(profileMenuLinks('student', null))).toEqual(['Billing /learn/credits']);
  });

  it('shows nothing school-related while the school is still loading', () => {
    expect(profileMenuLinks('student', undefined)).toEqual([]);
  });

  it('gives platform admins the organizations list', () => {
    expect(labels(profileMenuLinks('admin', null))).toEqual(['Organizations /admin/organizations']);
  });
});

describe('initials', () => {
  it('uses the first letter of the name', () => {
    expect(initials('amos amissah')).toBe('A');
    expect(initials('')).toBe('U');
  });
});
