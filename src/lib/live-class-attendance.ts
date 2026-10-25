import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserSchoolId, inActiveSchool } from '@/lib/school'
import { inClassAudience } from '@/lib/school-classes'

/** Trim; empty → null */
export function normalizeLiveClassGrade(g: string | null | undefined): string | null {
  if (g == null || typeof g !== 'string') return null
  const t = g.trim()
  return t.length ? t : null
}

export function liveClassGradesEqual(
  eventGrade: string | null | undefined,
  studentGrade: string | null | undefined
): boolean {
  const a = normalizeLiveClassGrade(eventGrade)
  const b = normalizeLiveClassGrade(studentGrade)
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export async function fetchStudentGrade(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  return (await fetchStudentPlacement(supabase, userId)).grade
}

/** A student's grade and school; both null when the user has no student profile. */
export async function fetchStudentPlacement(
  supabase: SupabaseClient,
  userId: string
): Promise<{ grade: string | null; organizationId: string | null; isStudent: boolean }> {
  const [{ data }, organizationId] = await Promise.all([
    supabase.from('students').select('grade').eq('user_id', userId).maybeSingle(),
    // The active membership, not students.organization_id, which outlives a deactivated membership.
    getUserSchoolId(supabase, userId),
  ])
  const row = data as { grade?: string } | null
  return {
    grade: normalizeLiveClassGrade(row?.grade ?? null),
    organizationId,
    isStudent: Boolean(row),
  }
}

/**
 * Host (organizer) always allowed. Otherwise requires a student profile in the event's school
 * whose grade matches the event.
 */
export async function isEligibleLiveClassAttendee(
  supabase: SupabaseClient,
  params: {
    organizerId: string
    attendeeUserId: string
    eventGradeLevel: string | null | undefined
    eventOrganizationId: string | null | undefined
    /** Classes the live class is for; empty means the whole grade. */
    eventClassIds?: string[] | null
  }
): Promise<boolean> {
  const { organizerId, attendeeUserId, eventGradeLevel, eventOrganizationId, eventClassIds } = params
  if (attendeeUserId === organizerId) return true
  const required = normalizeLiveClassGrade(eventGradeLevel)
  if (!required) return false
  const student = await fetchStudentPlacement(supabase, attendeeUserId)
  if (!student.isStudent || !inActiveSchool(student.organizationId, eventOrganizationId)) return false
  if (!liveClassGradesEqual(required, student.grade)) return false
  if (!eventClassIds?.length) return true
  return inClassAudience(eventClassIds, await studentClassOf(supabase, attendeeUserId))
}

/** The class a student is in, or null. */
export async function studentClassOf(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('school_class_students').select('class_id').eq('student_id', userId).limit(1).maybeSingle()
  if (error) throw error
  return (data as { class_id?: string } | null)?.class_id ?? null
}

/** Class ids of the live class's audience, from its row. */
export function eventClassIds(ev: { audience_class_ids?: unknown }): string[] {
  return Array.isArray(ev.audience_class_ids) ? ev.audience_class_ids.filter((id): id is string => typeof id === 'string') : []
}
