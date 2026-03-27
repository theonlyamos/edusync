import type { SupabaseClient } from '@supabase/supabase-js'

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
  const { data } = await supabase.from('students').select('grade').eq('user_id', userId).maybeSingle()
  return normalizeLiveClassGrade((data as { grade?: string } | null)?.grade ?? null)
}

/**
 * Host (organizer) always allowed. Otherwise requires a student profile whose grade matches the event.
 */
export async function isEligibleLiveClassAttendee(
  supabase: SupabaseClient,
  params: {
    organizerId: string
    attendeeUserId: string
    eventGradeLevel: string | null | undefined
  }
): Promise<boolean> {
  const { organizerId, attendeeUserId, eventGradeLevel } = params
  if (attendeeUserId === organizerId) return true
  const required = normalizeLiveClassGrade(eventGradeLevel)
  if (!required) return false
  const studentGrade = await fetchStudentGrade(supabase, attendeeUserId)
  return liveClassGradesEqual(required, studentGrade)
}
