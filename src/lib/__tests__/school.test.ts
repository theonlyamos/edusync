import { describe, expect, it } from 'vitest'
import { inSameSchool, newAccountUserRole, organizationMemberRole } from '@/lib/school'

describe('inSameSchool', () => {
  it('matches equal schools and two rows with no school', () => {
    expect(inSameSchool('a', 'a')).toBe(true)
    expect(inSameSchool(null, undefined)).toBe(true)
  })

  it('rejects different schools and one-sided nulls', () => {
    expect(inSameSchool('a', 'b')).toBe(false)
    expect(inSameSchool('a', null)).toBe(false)
  })
})

describe('organizationMemberRole', () => {
  it('keeps teacher and student roles inside schools', () => {
    expect(organizationMemberRole('teacher', 'school')).toBe('teacher')
    expect(organizationMemberRole('student', 'school')).toBe('student')
    expect(organizationMemberRole('learner', 'school')).toBe('student')
  })

  it('uses member for other organizations', () => {
    expect(organizationMemberRole('teacher', 'developer')).toBe('member')
    expect(organizationMemberRole('owner', 'developer')).toBe('owner')
  })
})

describe('newAccountUserRole', () => {
  it('never creates platform admins for organization owners or admins', () => {
    expect(newAccountUserRole('owner')).toBe('learner')
    expect(newAccountUserRole('admin')).toBe('learner')
    expect(newAccountUserRole('teacher')).toBe('teacher')
  })
})
