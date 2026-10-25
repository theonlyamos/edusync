import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server'
import { planPromotion, sortGrades, type PromotionPlan, type PromotionStudent } from '@/lib/school-grades'

export type GradeSummary = {
  grade: string
  /** False for a grade students are still in after it was removed from the school's list. */
  inSchoolList: boolean
  students: number
  teachers: Array<{ userId: string; name: string }>
  publishedLessons: number
}

const CHUNK = 200

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function activeStudents(supabase: ServiceSupabase, schoolId: string): Promise<PromotionStudent[]> {
  const [members, students] = await Promise.all([
    supabase.from('organization_members').select('id, user_id').eq('organization_id', schoolId).eq('role', 'student').eq('is_active', true).limit(20000),
    supabase.from('students').select('user_id, grade').eq('organization_id', schoolId).limit(20000),
  ])
  if (members.error) throw members.error
  if (students.error) throw students.error
  const gradeOf = new Map((students.data ?? []).map((s) => [s.user_id as string, (s.grade as string | null) ?? null]))
  return (members.data ?? []).map((m) => ({
    memberId: m.id as string,
    userId: m.user_id as string,
    grade: gradeOf.get(m.user_id as string) ?? null,
  }))
}

/** Each grade with its students, teachers and lessons. Callers must check the viewer manages this school. */
export async function getGradesSummary(supabase: ServiceSupabase, school: Pick<SchoolRecord, 'id' | 'grade_levels'>): Promise<GradeSummary[]> {
  const [students, teachersResult, teacherMembers, lessonsResult] = await Promise.all([
    activeStudents(supabase, school.id),
    supabase.from('teachers').select('user_id, grades').eq('organization_id', school.id).limit(5000),
    supabase.from('organization_members').select('user_id').eq('organization_id', school.id).eq('role', 'teacher').eq('is_active', true).limit(5000),
    supabase.from('lessons').select('gradelevel, current_publication_id').eq('organization_id', school.id).is('archived_at', null).limit(20000),
  ])
  for (const result of [teachersResult, teacherMembers, lessonsResult]) if (result.error) throw result.error

  const activeTeachers = new Set((teacherMembers.data ?? []).map((m) => m.user_id as string))
  const teachers = (teachersResult.data ?? []).filter((t) => activeTeachers.has(t.user_id as string))
  const names = new Map<string, string>()
  if (teachers.length > 0) {
    for (const ids of chunks(teachers.map((t) => t.user_id as string))) {
      const { data, error } = await supabase.from('users').select('id, name, email').in('id', ids)
      if (error) throw error
      for (const u of data ?? []) names.set(u.id as string, (u.name as string | null)?.trim() || (u.email as string) || 'Teacher')
    }
  }

  const listed = new Set(school.grade_levels ?? [])
  const all = sortGrades([...listed, ...students.map((s) => s.grade).filter((g): g is string => Boolean(g))])
  return all.map((grade) => ({
    grade,
    inSchoolList: listed.has(grade),
    students: students.filter((s) => s.grade === grade).length,
    teachers: teachers
      .filter((t) => ((t.grades as string[] | null) ?? []).includes(grade))
      .map((t) => ({ userId: t.user_id as string, name: names.get(t.user_id as string) ?? 'Teacher' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    publishedLessons: (lessonsResult.data ?? []).filter((l) => l.gradelevel === grade && l.current_publication_id).length,
  }))
}

export type PromotionOutcome = { moved: number; graduated: number; unchanged: number }

/**
 * Moves every active student along the plan. Graduates are deactivated: they
 * can't sign in to the school any more, and an admin can reactivate them.
 */
export async function promoteStudents(supabase: ServiceSupabase, schoolId: string, plan: PromotionPlan): Promise<PromotionOutcome> {
  const students = await activeStudents(supabase, schoolId)
  const { moves, graduates, unchanged } = planPromotion(students, plan)

  let moved = 0
  for (const [grade, group] of moves) {
    for (const part of chunks(group)) {
      const { error } = await supabase
        .from('students')
        .update({ grade, updated_at: new Date().toISOString() })
        .eq('organization_id', schoolId)
        .in('user_id', part.map((s) => s.userId))
      if (error) throw error
      moved += part.length
    }
  }

  for (const part of chunks(graduates)) {
    const userIds = part.map((s) => s.userId)
    // Same order as setMemberActive: drop the student portal role first.
    const roleUpdate = await supabase.from('users').update({ role: 'learner' }).in('id', userIds).eq('role', 'student')
    if (roleUpdate.error) throw roleUpdate.error
    const memberUpdate = await supabase.from('organization_members').update({ is_active: false }).in('id', part.map((s) => s.memberId))
    if (memberUpdate.error) throw memberUpdate.error
    // Graduates leave their class so it is ready for next year's students.
    const classUpdate = await supabase.from('school_class_students').delete().eq('organization_id', schoolId).in('student_id', userIds)
    if (classUpdate.error) throw classUpdate.error
    const { data: users, error: usersError } = await supabase.from('users').select('email').in('id', userIds)
    if (usersError) throw usersError
    const emails = (users ?? []).map((u) => String(u.email ?? '').toLowerCase()).filter(Boolean)
    if (emails.length > 0) {
      const { error } = await supabase
        .from('organization_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', schoolId)
        .in('email', emails)
        .is('accepted_at', null)
        .is('revoked_at', null)
      if (error) throw error
    }
  }

  return { moved, graduated: graduates.length, unchanged }
}
