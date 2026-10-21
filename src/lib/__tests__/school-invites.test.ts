import { describe, expect, it } from 'vitest'
import {
  homeForSchoolRole,
  inviteState,
  isJoinCodeFormat,
  normalizeGradeLevel,
  normalizeJoinCode,
  parseCsv,
  parseInviteCsv,
  schoolJoinErrorStatus,
  validateInvite,
} from '@/lib/school-invites'
import { buildInviteEmail } from '@/lib/school-invite-email'

describe('normalizeGradeLevel', () => {
  it('reads grades the way people type them', () => {
    expect(normalizeGradeLevel('Primary 4')).toBe('primary 4')
    expect(normalizeGradeLevel('P4')).toBe('primary 4')
    expect(normalizeGradeLevel('basic-2')).toBe('primary 2')
    expect(normalizeGradeLevel('JHS1')).toBe('jhs 1')
    expect(normalizeGradeLevel(' shs  3 ')).toBe('shs 3')
  })

  it('rejects grades the app does not have', () => {
    expect(normalizeGradeLevel('primary 7')).toBeNull()
    expect(normalizeGradeLevel('Grade 5')).toBeNull()
    expect(normalizeGradeLevel('')).toBeNull()
    expect(normalizeGradeLevel(4)).toBeNull()
  })
})

describe('validateInvite', () => {
  it('normalizes a valid invite', () => {
    expect(validateInvite({ email: ' Ama@Example.COM ', name: ' Ama ', role: 'Student', gradeLevel: 'P4' })).toEqual({
      ok: true,
      value: { email: 'ama@example.com', name: 'Ama', role: 'student', gradeLevel: 'primary 4' },
    })
    expect(validateInvite({ email: 'kofi@example.com', role: 'teacher', gradeLevel: 'P4' })).toEqual({
      ok: true,
      value: { email: 'kofi@example.com', name: null, role: 'teacher', gradeLevel: null },
    })
  })

  it('needs a valid email, a known role and a grade for students', () => {
    expect(validateInvite({ email: 'nope', role: 'teacher' }).ok).toBe(false)
    expect(validateInvite({ email: 'a@b.co', role: 'owner' }).ok).toBe(false)
    expect(validateInvite({ email: 'a@b.co', role: 'student' }).ok).toBe(false)
  })

  it('keeps students to the school’s grades once it has picked them', () => {
    expect(validateInvite({ email: 'a@b.co', role: 'student', gradeLevel: 'jhs 1' }, ['primary 1']).ok).toBe(false)
    expect(validateInvite({ email: 'a@b.co', role: 'student', gradeLevel: 'primary 1' }, ['primary 1']).ok).toBe(true)
  })
})

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and blank lines', () => {
    expect(parseCsv('﻿name,email\r\n"Mensah, Ama","a@b.co"\r\n\r\n"Say ""hi""",x@y.z')).toEqual([
      ['name', 'email'],
      ['Mensah, Ama', 'a@b.co'],
      ['Say "hi"', 'x@y.z'],
    ])
  })
})

describe('parseInviteCsv', () => {
  it('maps header columns in any order and flags bad rows', () => {
    const csv = 'Email,Role,Grade,Name\nama@example.com,student,P4,Ama\nkofi@example.com,teacher,,Kofi\nAMA@example.com,student,P4,Ama again\nbad,student,P4,Bad'
    const { rows, error } = parseInviteCsv(csv)
    expect(error).toBeNull()
    expect(rows.map((r) => [r.line, r.invite?.email ?? null, r.error])).toEqual([
      [2, 'ama@example.com', null],
      [3, 'kofi@example.com', null],
      [4, null, 'This email is already in the file.'],
      [5, null, 'Enter a valid email address.'],
    ])
    expect(rows[0].invite).toEqual({ email: 'ama@example.com', name: 'Ama', role: 'student', gradeLevel: 'primary 4' })
  })

  it('assumes name, email, role, grade without a header', () => {
    const { rows } = parseInviteCsv('Ama,ama@example.com,student,JHS 2')
    expect(rows[0]).toMatchObject({ line: 1, error: null, invite: { gradeLevel: 'jhs 2' } })
  })

  it('reports empty and oversized files', () => {
    expect(parseInviteCsv('').error).toBe('The file is empty.')
    expect(parseInviteCsv('name,email,role,grade\n').error).toBe('The file has no people in it.')
    const big = Array.from({ length: 501 }, (_, i) => `P${i},p${i}@example.com,teacher,`).join('\n')
    expect(parseInviteCsv(big).error).toMatch(/at most 500/)
  })
})

describe('inviteState', () => {
  const now = new Date('2026-10-21T12:00:00Z')
  it('prefers accepted, then cancelled, then expiry', () => {
    expect(inviteState({ accepted_at: '2026-10-20', revoked_at: '2026-10-20', expires_at: '2026-10-01' }, now)).toBe('accepted')
    expect(inviteState({ revoked_at: '2026-10-20', expires_at: '2026-10-30' }, now)).toBe('revoked')
    expect(inviteState({ expires_at: '2026-10-21T11:59:59Z' }, now)).toBe('expired')
    expect(inviteState({ expires_at: '2026-10-28T12:00:00Z' }, now)).toBe('pending')
  })
})

describe('join codes', () => {
  it('normalizes and checks codes', () => {
    expect(normalizeJoinCode(' hk7m-2qpx ')).toBe('HK7M2QPX')
    expect(isJoinCodeFormat('HK7M2QPX')).toBe(true)
    expect(isJoinCodeFormat('HK7')).toBe(false)
    expect(isJoinCodeFormat("HK7M2QPX';--")).toBe(false)
  })
})

describe('schoolJoinErrorStatus', () => {
  it('maps database error codes', () => {
    expect(schoolJoinErrorStatus('42501')).toBe(403)
    expect(schoolJoinErrorStatus('P0002')).toBe(404)
    expect(schoolJoinErrorStatus('P0001')).toBe(409)
    expect(schoolJoinErrorStatus('22023')).toBe(400)
    expect(schoolJoinErrorStatus('XX000')).toBeNull()
  })
})

describe('homeForSchoolRole', () => {
  it('sends each role to its portal', () => {
    expect(homeForSchoolRole('teacher', 's1')).toBe('/teachers/dashboard')
    expect(homeForSchoolRole('student', 's1')).toBe('/students/dashboard')
    expect(homeForSchoolRole('admin', 's1')).toBe('/learn/org/s1')
  })
})

describe('buildInviteEmail', () => {
  it('escapes names and includes the link in both versions', () => {
    const email = buildInviteEmail({
      schoolName: 'St. <Mary>',
      inviterName: 'Mrs "A"',
      inviteeName: null,
      role: 'student',
      gradeLevel: 'jhs 1',
      url: 'https://app.example.com/join/abc',
      expiresAt: new Date('2026-10-28T00:00:00Z'),
    })
    expect(email.subject).toBe('Join St. <Mary> on InsyteAI')
    expect(email.html).toContain('St. &lt;Mary&gt;')
    expect(email.html).toContain('Mrs &quot;A&quot;')
    expect(email.html).not.toContain('<Mary>')
    expect(email.text).toContain('as a student in JHS 1')
    expect(email.text).toContain('https://app.example.com/join/abc')
    expect(email.text).toContain('28 October 2026')
  })
})
