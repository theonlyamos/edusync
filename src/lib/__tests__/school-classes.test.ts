import { describe, expect, it } from 'vitest'
import { classLabel, inClassAudience, normalizeRoom, parseClassNames } from '@/lib/school-classes'
import { addClassStudents } from '@/lib/school-classes.server'
import { findTeacherClashes, type Timetable } from '@/lib/timetable'
import { audienceSummary } from '@/lib/lesson-artifacts/studio-state'
import { fakeSupabase } from './helpers/fake-supabase'

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS_A = '22222222-2222-4222-8222-222222222222'
const CLASS_B = '33333333-3333-4333-8333-333333333333'
const S1 = '44444444-4444-4444-8444-444444444444'
const S2 = '55555555-5555-4555-8555-555555555555'

describe('class names', () => {
  it('splits a comma list, drops blanks and repeats', () => {
    expect(parseClassNames('A, b,  , B ,C')).toEqual({ ok: true, names: ['A', 'b', 'C'] })
    expect(parseClassNames(' ')).toMatchObject({ ok: false })
    expect(parseClassNames('x'.repeat(61))).toMatchObject({ ok: false })
    expect(parseClassNames(Array.from({ length: 27 }, (_, i) => `C${i}`).join(','))).toMatchObject({ ok: false })
  })

  it('labels a class with its grade unless the name already says it', () => {
    expect(classLabel('JHS 1', 'A')).toBe('JHS 1 A')
    expect(classLabel('JHS 1', 'jhs 1 gold')).toBe('jhs 1 gold')
  })

  it('cleans rooms', () => {
    expect(normalizeRoom('  Lab  2 ')).toBe('Lab 2')
    expect(normalizeRoom('')).toBeNull()
    expect(normalizeRoom(5)).toBe('invalid')
  })
})

describe('class audiences', () => {
  it('treats an empty audience as the whole grade', () => {
    expect(inClassAudience([], null)).toBe(true)
    expect(inClassAudience(null, 'c1')).toBe(true)
    expect(inClassAudience(['c1'], 'c1')).toBe(true)
    expect(inClassAudience(['c1'], 'c2')).toBe(false)
    expect(inClassAudience(['c1'], null)).toBe(false)
  })

  it('names the chosen classes on the publish step', () => {
    const fmt = (g: string) => g.toUpperCase()
    const classes = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    expect(audienceSummary({ schoolName: 'Hillside', gradeLevel: 'jhs 1', students: 30, classes, classIds: ['a', 'b'] }, fmt))
      .toBe('The 30 students in JHS 1 A and JHS 1 B at Hillside')
    expect(audienceSummary({ schoolName: null, gradeLevel: 'jhs 1', students: 0, classes, classIds: ['a'] }, fmt)).toContain('No one is in it yet')
    expect(audienceSummary({ schoolName: null, gradeLevel: 'jhs 1', students: 12, classes, classIds: [] }, fmt)).toBe('All 12 JHS 1 students')
  })
})

describe('adding students to a class', () => {
  const db = () => fakeSupabase({
    school_classes: [
      { id: CLASS_A, organization_id: SCHOOL, grade: 'jhs 1', name: 'A' },
      { id: CLASS_B, organization_id: SCHOOL, grade: 'jhs 2', name: 'B' },
    ],
    organization_members: [
      { organization_id: SCHOOL, user_id: S1, role: 'student', is_active: true },
      { organization_id: SCHOOL, user_id: S2, role: 'student', is_active: true },
    ],
    students: [
      { user_id: S1, organization_id: SCHOOL, grade: 'jhs 2' },
      { user_id: S2, organization_id: SCHOOL, grade: 'jhs 1' },
    ],
    school_class_students: [{ class_id: CLASS_B, student_id: S1, organization_id: SCHOOL }],
  })

  it('moves students out of their old class and into the class grade', async () => {
    const fake = db()
    const result = await addClassStudents(fake.client, SCHOOL, CLASS_A, [S1, S2])
    expect(result).toEqual({ added: 2, movedGrade: 1 })
    expect(fake.tables.school_class_students.map((r) => [r.class_id, r.student_id]).sort()).toEqual([[CLASS_A, S1], [CLASS_A, S2]].sort())
    expect(fake.tables.students.find((s) => s.user_id === S1)?.grade).toBe('jhs 1')
  })

  it('refuses people who are not active students', async () => {
    const fake = db()
    fake.tables.organization_members[1].is_active = false
    await expect(addClassStudents(fake.client, SCHOOL, CLASS_A, [S1, S2])).rejects.toThrow(/not active students/)
  })

  it('refuses a class from another school', async () => {
    await expect(addClassStudents(db().client, '99999999-9999-4999-8999-999999999999', CLASS_A, [S1])).rejects.toThrow(/Class not found/)
  })
})

describe('teacher double-booking', () => {
  const period = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime })
  it('finds a teacher booked at an overlapping time on the same day', () => {
    const a: Timetable = { periods: [period('p1', '08:00', '09:00')], schedule: { monday: { p1: { subject: 'Maths', teacherId: 't1' } } } }
    const b: Timetable = { periods: [period('x', '08:30', '09:30')], schedule: { monday: { x: { subject: 'Maths', teacherId: 't1' } } } }
    const c: Timetable = { periods: [period('x', '09:00', '10:00')], schedule: { monday: { x: { subject: 'Maths', teacherId: 't1' } } } }
    const d: Timetable = { periods: [period('x', '08:00', '09:00')], schedule: { tuesday: { x: { subject: 'Maths', teacherId: 't1' } } } }
    expect(findTeacherClashes(a, [{ label: 'JHS 1 B', timetable: b }, { label: 'JHS 2', timetable: c }, { label: 'JHS 3', timetable: d }]))
      .toEqual([{ day: 'monday', teacherId: 't1', time: '08:00–09:00', otherLabel: 'JHS 1 B' }])
  })
})
