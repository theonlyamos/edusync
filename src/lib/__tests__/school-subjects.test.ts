import { describe, expect, it } from 'vitest'
import { matchSubject, subjectInGrade, teacherFor, validateSubject, type SubjectTeacherAssignment } from '@/lib/school-subjects'
import { mapTypedSubjects, setAssignment, updateSubject } from '@/lib/school-subjects.server'
import { subjectActivity } from '@/lib/school-reports.server'
import { fakeSupabase } from './helpers/fake-supabase'

const list = [
  { id: 's-math', name: 'Mathematics', code: 'MATH' },
  { id: 's-eng', name: 'English Language', code: 'ENG' },
  { id: 's-rme', name: 'Religious and Moral Education', code: 'RME' },
]

describe('validateSubject', () => {
  it('tidies the name and code', () => {
    const r = validateSubject({ name: '  Core   Maths ', code: ' cm ', color: '#AABBCC', grades: ['jhs 1', 'jhs 1'] }, ['jhs 1', 'jhs 2'], true)
    expect(r).toEqual({ ok: true, value: { name: 'Core Maths', code: 'CM', color: '#aabbcc', grades: ['jhs 1'] } })
  })
  it('needs a name when adding', () => {
    expect(validateSubject({}, [], true).ok).toBe(false)
    expect(validateSubject({ code: 'X' }, [], false)).toEqual({ ok: true, value: { code: 'X' } })
  })
  it('refuses grades the school does not teach and bad colours', () => {
    expect(validateSubject({ name: 'Art', grades: ['shs 3'] }, ['jhs 1'], true).ok).toBe(false)
    expect(validateSubject({ name: 'Art', color: 'red' }, [], true).ok).toBe(false)
  })
})

describe('matchSubject', () => {
  it('matches names and codes in any case', () => {
    expect(matchSubject('mathematics', list)?.id).toBe('s-math')
    expect(matchSubject('eng', list)?.id).toBe('s-eng')
  })
  it('matches common other spellings', () => {
    expect(matchSubject('Maths', list)?.id).toBe('s-math')
    expect(matchSubject('English', list)?.id).toBe('s-eng')
    expect(matchSubject('R.M.E', list)?.id).toBe('s-rme')
  })
  it('returns null when nothing fits', () => {
    expect(matchSubject('Chemistry', list)).toBeNull()
    expect(matchSubject('', list)).toBeNull()
  })
})

describe('subjectInGrade and teacherFor', () => {
  it('treats no grades as every grade', () => {
    expect(subjectInGrade({ grades: [] }, 'jhs 1')).toBe(true)
    expect(subjectInGrade({ grades: ['jhs 2'] }, 'JHS 2')).toBe(true)
    expect(subjectInGrade({ grades: ['jhs 2'] }, 'jhs 1')).toBe(false)
  })
  it("uses the class's own teacher, else the grade's", () => {
    const a: SubjectTeacherAssignment[] = [
      { id: '1', subjectId: 's', grade: 'jhs 1', classId: null, teacherId: 'grade-teacher' },
      { id: '2', subjectId: 's', grade: 'jhs 1', classId: 'class-b', teacherId: 'b-teacher' },
    ]
    expect(teacherFor(a, 's', 'jhs 1', 'class-b')).toBe('b-teacher')
    expect(teacherFor(a, 's', 'jhs 1', 'class-a')).toBe('grade-teacher')
    expect(teacherFor(a, 's', 'jhs 2', null)).toBeNull()
  })
})

describe('setAssignment', () => {
  const SUBJ = '11111111-1111-4111-8111-111111111111'
  const T1 = '22222222-2222-4222-8222-222222222222'
  const T2 = '33333333-3333-4333-8333-333333333333'
  const school = { id: 'school', grade_levels: ['jhs 1'] }

  function setup() {
    return fakeSupabase({
      school_subjects: [
        { id: SUBJ, organization_id: 'school', name: 'Mathematics', code: 'MATH', color: null, grades: [], archived_at: null },
        { id: 'sci', organization_id: 'school', name: 'Integrated Science', code: 'SCI', color: null, grades: [], archived_at: null },
      ],
      organization_members: [
        { organization_id: 'school', user_id: T1, role: 'teacher', is_active: true },
        { organization_id: 'school', user_id: T2, role: 'teacher', is_active: true },
      ],
      teachers: [
        { user_id: T1, organization_id: 'school', subjects: ['Integrated Science', 'Drama'], grades: ['jhs 2'] },
        { user_id: T2, organization_id: 'school', subjects: [], grades: [] },
      ],
      school_subject_teachers: [],
    })
  }

  it('assigns, moves and clears a teacher and keeps their profile in step', async () => {
    const fake = setup()
    await setAssignment(fake.client as never, school, { subjectId: SUBJ, grade: 'jhs 1', classId: null, teacherId: T1 })
    expect(fake.tables.school_subject_teachers).toHaveLength(1)
    // Listed subjects follow who teaches what; typed extras and grades stay.
    expect(fake.tables.teachers[0]).toMatchObject({ subjects: ['Mathematics', 'Drama'], grades: ['jhs 2', 'jhs 1'] })

    await setAssignment(fake.client as never, school, { subjectId: SUBJ, grade: 'jhs 1', classId: null, teacherId: T2 })
    expect(fake.tables.school_subject_teachers).toHaveLength(1)
    expect(fake.tables.teachers[0].subjects).toEqual(['Drama'])
    expect(fake.tables.teachers[1].subjects).toEqual(['Mathematics'])

    await setAssignment(fake.client as never, school, { subjectId: SUBJ, grade: 'jhs 1', classId: null, teacherId: null })
    expect(fake.tables.school_subject_teachers).toHaveLength(0)
    expect(fake.tables.teachers[1].subjects).toEqual([])
  })

  it('refuses other grades and people who are not teachers here', async () => {
    const fake = setup()
    await expect(setAssignment(fake.client as never, school, { subjectId: SUBJ, grade: 'shs 1', classId: null, teacherId: T1 })).rejects.toThrow()
    await expect(
      setAssignment(fake.client as never, school, { subjectId: SUBJ, grade: 'jhs 1', classId: null, teacherId: '44444444-4444-4444-8444-444444444444' }),
    ).rejects.toThrow()
  })
})

describe('report by subject', () => {
  it('counts lessons by link or matched name, and homework by name', () => {
    const subjects = [
      { id: 'm', name: 'Mathematics', code: 'MATH', color: '#2563eb', grades: [], archived: false },
      { id: 'e', name: 'English Language', code: 'ENG', color: null, grades: [], archived: false },
    ]
    const rows = subjectActivity(subjects, {
      lessons: [
        { id: 'l1', subject_id: 'm', subject: 'Core maths' },
        { id: 'l2', subject_id: null, subject: 'Maths' },
        { id: 'l3', subject_id: null, subject: 'Chemistry' },
      ],
      publications: [{ lesson_id: 'l1' }, { lesson_id: 'l1' }],
      runs: [{ lesson_id: 'l1', student_id: 'a' }, { lesson_id: 'l2', student_id: 'a' }, { lesson_id: 'l3', student_id: 'b' }],
      homeworks: [{ id: 'h1', subject: 'math', status: 'published', published_at: '2026-10-20T00:00:00Z' }],
      attempts: [{ homework_id: 'h1' }, { homework_id: 'h1' }],
      fromIso: '2026-10-01T00:00:00Z',
      toIso: '2026-10-25T00:00:00Z',
    })
    expect(rows.map((r) => r.name)).toEqual(['English Language', 'Mathematics', 'Other'])
    expect(rows[1]).toMatchObject({ lessons: 2, lessonsPublished: 1, studentsStudying: 1, homeworkSet: 1, homeworkSubmitted: 2 })
    expect(rows[2]).toMatchObject({ subjectId: null, lessons: 1, studentsStudying: 1 })
  })
})

describe('mapTypedSubjects', () => {
  const MATH = '55555555-5555-4555-8555-555555555555'
  const SCI = '66666666-6666-4666-8666-666666666666'
  it('links lessons and renames homework, timetables and teachers in one pass', async () => {
    const fake = fakeSupabase({
      school_subjects: [
        { id: MATH, organization_id: 'school', name: 'Mathematics', code: null, color: null, grades: [], archived_at: null },
        { id: SCI, organization_id: 'school', name: 'Integrated Science', code: null, color: null, grades: [], archived_at: null },
      ],
      lessons: [
        { id: 'l1', organization_id: 'school', subject: 'Core  maths', subject_id: null },
        { id: 'l2', organization_id: 'school', subject: 'Biology', subject_id: null },
        { id: 'l3', organization_id: 'other', subject: 'Core maths', subject_id: null },
      ],
      homeworks: [{ id: 'h1', organization_id: 'school', subject: 'core maths' }],
      timetables: [{ id: 't1', organization_id: 'school', schedule: { Monday: { '1': { subject: 'Biology' } } } }],
      teachers: [{ id: 'tr1', organization_id: 'school', subjects: ['Core Maths', 'Biology', 'Drama'] }],
    })
    await mapTypedSubjects(fake.client as never, 'school', [
      { text: 'Core Maths', subjectId: MATH },
      { text: 'Biology', subjectId: SCI },
    ])
    // Lesson text is kept so approvals aren't reset.
    expect(fake.tables.lessons[0]).toMatchObject({ subject: 'Core  maths', subject_id: MATH })
    expect(fake.tables.lessons[1]).toMatchObject({ subject: 'Biology', subject_id: SCI })
    expect(fake.tables.lessons[2].subject_id).toBeNull()
    expect(fake.tables.homeworks[0].subject).toBe('Mathematics')
    expect(fake.tables.timetables[0].schedule.Monday['1'].subject).toBe('Integrated Science')
    expect(fake.tables.teachers[0].subjects).toEqual(['Mathematics', 'Integrated Science', 'Drama'])
  })

  it('refuses a subject from another school', async () => {
    const fake = fakeSupabase({ school_subjects: [{ id: MATH, organization_id: 'other', name: 'Mathematics', grades: [], archived_at: null }] })
    await expect(mapTypedSubjects(fake.client as never, 'school', [{ text: 'Maths', subjectId: MATH }])).rejects.toThrow('Subject not found')
  })
})

describe('updateSubject', () => {
  const SUBJ = '77777777-7777-4777-8777-777777777777'
  it('drops who-teaches-what in grades the subject is no longer taught in', async () => {
    const fake = fakeSupabase({
      school_subjects: [{ id: SUBJ, organization_id: 'school', name: 'Physics', code: null, color: null, grades: [], archived_at: null }],
      school_subject_teachers: [
        { id: 'a1', organization_id: 'school', subject_id: SUBJ, grade: 'jhs 1', class_id: null, teacher_id: 'tea1' },
        { id: 'a2', organization_id: 'school', subject_id: SUBJ, grade: 'jhs 2', class_id: null, teacher_id: 'tea2' },
      ],
      teachers: [
        { user_id: 'tea1', organization_id: 'school', subjects: ['Physics'], grades: ['jhs 1'] },
        { user_id: 'tea2', organization_id: 'school', subjects: ['Physics'], grades: ['jhs 2'] },
      ],
    })
    await updateSubject(fake.client as never, 'school', SUBJ, { grades: ['jhs 1'] })
    expect(fake.tables.school_subject_teachers.map((a) => a.id)).toEqual(['a1'])
    expect(fake.tables.teachers[1].subjects).toEqual([])
    expect(fake.tables.teachers[0].subjects).toEqual(['Physics'])
  })
})
