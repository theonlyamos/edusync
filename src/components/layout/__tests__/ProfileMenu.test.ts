import { describe, expect, it } from 'vitest';
import { initials, profileMenuLinks } from '../ProfileMenu';

const labels = (links: { label: string; href: string }[]) => links.map((l) => `${l.label} ${l.href}`);
const managed = { id: 's1', name: 'Hill School', canManage: true };
const member = { id: 's1', name: 'Hill School', canManage: false };

describe('profileMenuLinks', () => {
  it('gives school managers school billing and the school admin portal', () => {
    expect(labels(profileMenuLinks('teacher', managed))).toEqual([
      'Billing /school/billing',
      'Settings /teachers/profile',
      'School admin /school/dashboard',
    ]);
  });

  it('gives the school portal billing and account settings', () => {
    expect(labels(profileMenuLinks('school', managed))).toEqual(['Billing /school/billing', 'Account settings /school/account']);
  });

  it('lets platform admins who run a school open it', () => {
    expect(labels(profileMenuLinks('admin', managed))).toEqual([
      'Billing /school/billing',
      'Settings /admin/settings',
      'School admin /school/dashboard',
    ]);
  });

  it('hides billing and the school page from ordinary school members', () => {
    expect(labels(profileMenuLinks('teacher', member))).toEqual(['Settings /teachers/profile']);
    expect(labels(profileMenuLinks('student', member))).toEqual(['Settings /students/settings']);
  });

  it('sends people without a school to their own credits', () => {
    expect(labels(profileMenuLinks('student', null))).toEqual(['Billing /learn/credits', 'Settings /students/settings']);
  });

  it('shows nothing school-related while the school is still loading', () => {
    expect(labels(profileMenuLinks('student', undefined))).toEqual(['Settings /students/settings']);
  });

  it('gives platform admins their settings (everything else is in the sidebar)', () => {
    expect(labels(profileMenuLinks('admin', null))).toEqual(['Settings /admin/settings']);
  });
});

describe('initials', () => {
  it('uses the first letter of the name', () => {
    expect(initials('amos amissah')).toBe('A');
    expect(initials('')).toBe('U');
  });
});
