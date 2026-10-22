import { describe, expect, it } from 'vitest'
import {
  accountStatus,
  csvCell,
  homeForSchoolRole,
  normalizeGradeLevel,
  parseCsv,
  parseDateOfBirth,
  parseGradeList,
  parsePeopleCsv,
  parsePersonRole,
  parseSubjects,
  schoolDbErrorStatus,
  validateNewPerson,
  validatePersonUpdate,
} from '@/lib/school-people'
import { buildSchoolAccountEmail } from '@/lib/school-account-email'

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

describe('lists in cells', () => {
  it('splits subjects and drops repeats', () => {
    expect(parseSubjects('Maths; Science, maths |  English ')).toEqual(['Maths', 'Science', 'English'])
    expect(parseSubjects(['Art'])).toEqual(['Art'])
    expect(parseSubjects(undefined)).toEqual([])
    expect(parseSubjects('x'.repeat(61))).toBeNull()
  })

  it('reads grade lists in the app order', () => {
    expect(parseGradeList('JHS 2; P1')).toEqual(['primary 1', 'jhs 2'])
    expect(parseGradeList(['shs 1', ''])).toEqual(['shs 1'])
    expect(parseGradeList('Grade 9')).toBeNull()
  })

  it('accepts real past dates of birth only', () => {
    expect(parseDateOfBirth('2012-04-18')).toBe('2012-04-18')
    expect(parseDateOfBirth('')).toBeNull()
    expect(parseDateOfBirth('2012-02-30')).toBeUndefined()
    expect(parseDateOfBirth('18/04/2012')).toBeUndefined()
    expect(parseDateOfBirth('2999-01-01')).toBeUndefined()
  })
})

describe('validateNewPerson', () => {
  it('needs a name, an email and a school grade for students', () => {
    expect(validateNewPerson('student', { name: 'A', email: 'a@b.co', gradeLevel: 'jhs 1' })).toEqual({ ok: false, error: 'Enter a name (2 to 120 characters).' })
    expect(validateNewPerson('student', { name: 'Ama', email: 'nope', gradeLevel: 'jhs 1' }).ok).toBe(false)
    expect(validateNewPerson('student', { name: 'Ama', email: 'a@b.co' }).ok).toBe(false)
    expect(validateNewPerson('student', { name: 'Ama', email: 'a@b.co', gradeLevel: 'shs 1' }, ['jhs 1'])).toEqual({
      ok: false,
      error: 'That grade is not one of your school’s grades.',
    })
  })

  it('cleans up a student', () => {
    const result = validateNewPerson('student', {
      name: '  Ama   Mensah ',
      email: ' AMA@Example.com ',
      gradeLevel: 'JHS1',
      guardianName: 'Kofi',
      guardianContact: '',
      dateOfBirth: '2012-04-18',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        role: 'student',
        name: 'Ama Mensah',
        email: 'ama@example.com',
        gradeLevel: 'jhs 1',
        guardianName: 'Kofi',
        guardianContact: null,
        dateOfBirth: '2012-04-18',
        subjects: [],
        grades: [],
      },
    })
  })

  it('keeps teacher subjects and grades, and ignores student fields for staff', () => {
    const result = validateNewPerson('teacher', { name: 'Yaw', email: 'yaw@x.co', subjects: 'Maths; Science', grades: 'JHS 1; JHS 2', gradeLevel: 'shs 1' })
    expect(result.ok && result.value).toMatchObject({ subjects: ['Maths', 'Science'], grades: ['jhs 1', 'jhs 2'], gradeLevel: null })
  })
})

describe('validatePersonUpdate', () => {
  it('only changes what was sent and refuses fields of another role', () => {
    expect(validatePersonUpdate('student', { gradeLevel: 'p2' })).toEqual({ ok: true, value: { gradeLevel: 'primary 2' } })
    expect(validatePersonUpdate('teacher', { gradeLevel: 'p2' }).ok).toBe(false)
    expect(validatePersonUpdate('student', { subjects: 'Maths' }).ok).toBe(false)
    expect(validatePersonUpdate('admin', {})).toEqual({ ok: false, error: 'Nothing to change.' })
    expect(validatePersonUpdate('student', { guardianName: '', dateOfBirth: '' })).toEqual({ ok: true, value: { guardianName: null, dateOfBirth: null } })
  })
})

describe('parsePeopleCsv', () => {
  it('reads a header in any order and flags bad rows', () => {
    const csv = 'Email,Grade,Name\nama@x.co,JHS 1,Ama\nbad,JHS 1,Bad Email\nAMA@x.co,JHS 2,Again\n'
    const { rows, error } = parsePeopleCsv(csv, 'student')
    expect(error).toBeNull()
    expect(rows.map((r) => [r.line, r.email, r.person?.gradeLevel ?? null, r.error])).toEqual([
      [2, 'ama@x.co', 'jhs 1', null],
      [3, 'bad', null, 'Enter a valid email address.'],
      [4, 'AMA@x.co', null, 'This email is already in the file.'],
    ])
  })

  it('uses the role’s default columns without a header', () => {
    const { rows } = parsePeopleCsv('Yaw Boateng,yaw@x.co,"Maths; Science",JHS 1', 'teacher')
    expect(rows[0].person).toMatchObject({ name: 'Yaw Boateng', subjects: ['Maths', 'Science'], grades: ['jhs 1'] })
  })

  it('says when the file is empty', () => {
    expect(parsePeopleCsv('', 'admin').error).toBe('The file is empty.')
    expect(parsePeopleCsv('name,email\n', 'admin').error).toBe('The file has no people in it.')
  })
})

describe('accountStatus', () => {
  const now = new Date('2026-10-22T12:00:00Z')
  const link = (over: Partial<{ accepted_at: string | null; revoked_at: string | null; expires_at: string }>) => ({
    accepted_at: null,
    revoked_at: null,
    expires_at: '2026-10-29T12:00:00Z',
    ...over,
  })

  it('treats people without links as active (they joined before links existed)', () => {
    expect(accountStatus({ is_active: true }, [], now)).toBe('active')
  })

  it('is pending until a link is used, and expired when no link is open', () => {
    expect(accountStatus({ is_active: true }, [link({})], now)).toBe('pending')
    expect(accountStatus({ is_active: true }, [link({ revoked_at: '2026-10-21T00:00:00Z' }), link({ expires_at: '2026-10-21T00:00:00Z' })], now)).toBe('link_expired')
    expect(accountStatus({ is_active: true }, [link({ accepted_at: '2026-10-20T00:00:00Z' }), link({})], now)).toBe('active')
  })

  it('shows deactivated first', () => {
    expect(accountStatus({ is_active: false }, [], now)).toBe('deactivated')
  })
})

describe('small helpers', () => {
  it('parses roles, statuses and homes', () => {
    expect(parsePersonRole('Administrator')).toBe('admin')
    expect(parsePersonRole('owner')).toBeNull()
    expect(schoolDbErrorStatus('P0001')).toBe(409)
    expect(schoolDbErrorStatus('42501')).toBe(403)
    expect(schoolDbErrorStatus(undefined)).toBeNull()
    expect(homeForSchoolRole('teacher')).toBe('/teachers/dashboard')
    expect(homeForSchoolRole('student')).toBe('/students/dashboard')
    expect(homeForSchoolRole('admin')).toBe('/school/dashboard')
  })

  it('quotes CSV cells and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('=cmd')).toBe("'=cmd")
    expect(parseCsv('a,"b ""c"""\r\n1,2')).toEqual([['a', 'b "c"'], ['1', '2']])
  })
})

describe('buildSchoolAccountEmail', () => {
  const base = {
    schoolName: 'Hilltop <School>',
    senderName: 'Mrs Owusu',
    personName: 'Ama',
    role: 'student',
    gradeLevel: 'jhs 1',
    email: 'ama@x.co',
    url: 'https://app.test/activate/abc',
    expiresAt: new Date('2026-10-29T12:00:00Z'),
  }

  it('invites the person to activate and escapes HTML', () => {
    const email = buildSchoolAccountEmail({ ...base, kind: 'activate' })
    expect(email.subject).toBe('Activate your Hilltop <School> account on InsyteAI')
    expect(email.text).toContain('as a student in JHS 1')
    expect(email.text).toContain('https://app.test/activate/abc')
    expect(email.text).toContain('29 October 2026')
    expect(email.html).toContain('Hilltop &lt;School&gt;')
    expect(email.html).not.toContain('<School>')
  })

  it('words a password reset differently', () => {
    const email = buildSchoolAccountEmail({ ...base, kind: 'reset' })
    expect(email.subject).toBe('Set a new InsyteAI password')
    expect(email.text).toContain('your password stays the same')
  })
})
