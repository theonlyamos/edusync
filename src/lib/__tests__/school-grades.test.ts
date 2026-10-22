import { describe, expect, it } from 'vitest'
import { defaultPromotionPlan, planPromotion, sortGrades, validatePromotionPlan } from '@/lib/school-grades'
import { promoteStudents } from '@/lib/school-grades.server'
import { fakeSupabase } from './helpers/fake-supabase'

describe('promotion plans', () => {
  it('sorts grades youngest first and moves each up one, graduating the top grade', () => {
    expect(sortGrades(['jhs 2', 'primary 6', 'jhs 1'])).toEqual(['primary 6', 'jhs 1', 'jhs 2'])
    expect(defaultPromotionPlan(['jhs 3', 'jhs 1', 'jhs 2'])).toEqual({ 'jhs 1': 'jhs 2', 'jhs 2': 'jhs 3', 'jhs 3': 'graduate' })
  })

  it('rejects grades the school does not teach', () => {
    expect(validatePromotionPlan({ 'jhs 1': 'jhs 2' }, ['jhs 1', 'jhs 2'])).toBeNull()
    expect(validatePromotionPlan({ 'jhs 1': 'shs 1' }, ['jhs 1', 'jhs 2'])).toMatch(/isn’t one of/)
    expect(validatePromotionPlan({ 'shs 1': 'keep' }, ['jhs 1'])).toMatch(/isn’t one of/)
    expect(validatePromotionPlan([], ['jhs 1'])).toMatch(/plan/)
    expect(validatePromotionPlan({ 'jhs 1': 3 }, ['jhs 1'])).toMatch(/somewhere/)
  })

  it('plans from one snapshot so nobody moves twice', () => {
    const students = [
      { memberId: 'm1', userId: 'u1', grade: 'jhs 1' },
      { memberId: 'm2', userId: 'u2', grade: 'jhs 2' },
      { memberId: 'm3', userId: 'u3', grade: 'jhs 3' },
      { memberId: 'm4', userId: 'u4', grade: null },
      { memberId: 'm5', userId: 'u5', grade: 'primary 1' },
    ]
    const result = planPromotion(students, { 'jhs 1': 'jhs 2', 'jhs 2': 'jhs 3', 'jhs 3': 'graduate' })
    expect(result.moves.get('jhs 2')?.map((s) => s.userId)).toEqual(['u1'])
    expect(result.moves.get('jhs 3')?.map((s) => s.userId)).toEqual(['u2'])
    expect(result.graduates.map((s) => s.userId)).toEqual(['u3'])
    expect(result.unchanged).toBe(2)
  })
})

describe('promoteStudents', () => {
  it('moves grades, deactivates graduates and revokes their open links', async () => {
    const fake = fakeSupabase({
      organization_members: [
        { id: 'm1', organization_id: 's1', user_id: 'u1', role: 'student', is_active: true },
        { id: 'm2', organization_id: 's1', user_id: 'u2', role: 'student', is_active: true },
        { id: 'm3', organization_id: 's1', user_id: 'u3', role: 'student', is_active: false },
        { id: 'm4', organization_id: 's1', user_id: 'u4', role: 'teacher', is_active: true },
      ],
      students: [
        { user_id: 'u1', grade: 'jhs 1', organization_id: 's1' },
        { user_id: 'u2', grade: 'jhs 2', organization_id: 's1' },
        { user_id: 'u3', grade: 'jhs 1', organization_id: 's1' },
      ],
      users: [
        { id: 'u1', email: 'a@x.test', role: 'student' },
        { id: 'u2', email: 'b@x.test', role: 'student' },
        { id: 'u3', email: 'c@x.test', role: 'learner' },
      ],
      organization_invitations: [
        { organization_id: 's1', email: 'b@x.test', accepted_at: null, revoked_at: null },
      ],
    })
    const result = await promoteStudents(fake.client, 's1', { 'jhs 1': 'jhs 2', 'jhs 2': 'graduate' })
    expect(result).toEqual({ moved: 1, graduated: 1, unchanged: 0 })
    const grade = (id: string) => fake.tables.students.find((s) => s.user_id === id)?.grade
    expect(grade('u1')).toBe('jhs 2')
    // Deactivated students are left alone.
    expect(grade('u3')).toBe('jhs 1')
    expect(fake.tables.organization_members.find((m) => m.id === 'm2')?.is_active).toBe(false)
    expect(fake.tables.users.find((u) => u.id === 'u2')?.role).toBe('learner')
    expect(fake.tables.organization_invitations[0].revoked_at).toBeTruthy()
  })
})
