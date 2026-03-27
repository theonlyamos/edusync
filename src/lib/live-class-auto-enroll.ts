import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLiveClassGrade } from '@/lib/live-class-attendance'

const UPSERT_BATCH = 250

/**
 * Enrolls every student whose grade matches the event grade (same rules as attendance).
 * Respects max_attendees when set. Skips the organizer if they appear as a student.
 */
export async function enrollAllStudentsForGradeLevel(
  supabase: SupabaseClient,
  params: {
    eventId: string
    gradeLevelRaw: string | null | undefined
    organizerId: string
    maxAttendees: number | null | undefined
  }
): Promise<{ enrolled: number; rpcFailed?: boolean }> {
  const grade = normalizeLiveClassGrade(
    typeof params.gradeLevelRaw === 'string' ? params.gradeLevelRaw : null
  )
  if (!grade) {
    return { enrolled: 0 }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('student_user_ids_for_grade_level', {
    p_grade: grade,
  })

  if (rpcErr) {
    console.error('[live-class auto-enroll] rpc student_user_ids_for_grade_level', rpcErr)
    return { enrolled: 0, rpcFailed: true }
  }

  const raw = rpcData as unknown
  const userIds: string[] = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  const filtered = userIds.filter((id) => id !== params.organizerId).sort((a, b) => a.localeCompare(b))

  let cap = filtered.length
  if (params.maxAttendees != null && Number.isFinite(params.maxAttendees) && params.maxAttendees >= 0) {
    cap = Math.min(cap, params.maxAttendees)
  }
  const picked = filtered.slice(0, cap)

  const rows = picked.map((user_id) => ({
    live_class_event_id: params.eventId,
    user_id,
    role: 'student' as const,
  }))

  let enrolled = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await supabase.from('live_class_enrollments').upsert(chunk, {
      onConflict: 'live_class_event_id,user_id',
    })
    if (error) {
      console.error('[live-class auto-enroll] upsert', error)
      return { enrolled, rpcFailed: false }
    }
    enrolled += chunk.length
  }

  return { enrolled, rpcFailed: false }
}
