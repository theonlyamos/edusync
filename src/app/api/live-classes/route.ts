import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { validateLiveClassGradeAndLesson } from '@/lib/live-class-lesson-validation'
import { fetchStudentPlacement, liveClassGradesEqual, normalizeLiveClassGrade } from '@/lib/live-class-attendance'
import { inActiveSchool } from '@/lib/school'
import { enrollAllStudentsForGradeLevel } from '@/lib/live-class-auto-enroll'
import { eventClassIds, studentClassOf } from '@/lib/live-class-attendance'
import { inClassAudience } from '@/lib/school-classes'
import { getUserSchoolId } from '@/lib/school'
import { validAudienceClasses } from '@/lib/lesson-artifacts/audience.server'

function canOrganize(role: string | null | undefined) {
  return role === 'teacher' || role === 'admin'
}

const LIVE_CLASS_LIST_SELECT = '*, lessons(title)'

/** List live classes where the user is organizer or enrolled. */
export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabase()

  const { data: organized } = await supabase
    .from('live_class_events')
    .select(LIVE_CLASS_LIST_SELECT)
    .eq('organizer_id', auth.userId)
    .order('scheduled_start_at', { ascending: true })

  const { data: enrollRows } = await supabase
    .from('live_class_enrollments')
    .select('live_class_event_id')
    .eq('user_id', auth.userId)

  const enrolledIds = Array.from(
    new Set((enrollRows || []).map((r: { live_class_event_id: string }) => r.live_class_event_id))
  )

  let enrolledEvents: Record<string, unknown>[] = []
  if (enrolledIds.length > 0) {
    const { data } = await supabase
      .from('live_class_events')
      .select(LIVE_CLASS_LIST_SELECT)
      .in('id', enrolledIds)
      .order('scheduled_start_at', { ascending: true })
    enrolledEvents = data || []
  }

  const byId = new Map<string, Record<string, unknown>>()
  for (const e of organized || []) byId.set(e.id as string, e as Record<string, unknown>)
  for (const e of enrolledEvents) byId.set(e.id as string, e)

  const me = await fetchStudentPlacement(supabase, auth.userId)

  // Students who joined the school after a class was scheduled were never
  // auto-enrolled. Show them their school's open classes too; Join enrolls them.
  const studentGrade = normalizeLiveClassGrade(me.grade)
  if (me.isStudent && me.organizationId && studentGrade) {
    const { data: open } = await supabase
      .from('live_class_events')
      .select(LIVE_CLASS_LIST_SELECT)
      .eq('organization_id', me.organizationId)
      // Case-insensitive exact match on grade, so other grades can't fill the limit.
      .ilike('grade_level', studentGrade.replace(/[\\%_]/g, (c) => `\\${c}`))
      // Drafts stay hidden until the teacher schedules them.
      .in('status', ['scheduled', 'live'])
      .gt('scheduled_end_at', new Date().toISOString())
      .order('scheduled_start_at', { ascending: true })
      .limit(100)
    for (const e of open || []) {
      if (!byId.has(e.id as string)) byId.set(e.id as string, { ...(e as Record<string, unknown>), enrolled: false })
    }
  }

  const myClass = me.isStudent ? await studentClassOf(supabase, auth.userId) : null
  const enrolledSet = new Set(enrolledIds)
  const merged = Array.from(byId.values()).map((e) =>
    e.enrolled === false ? e : { ...e, enrolled: enrolledSet.has(e.id as string) || e.organizer_id === auth.userId }
  )
  const items = merged.filter((e) => {
    const orgId = e.organizer_id as string
    if (orgId === auth.userId) return true
    if (!me.isStudent || !inActiveSchool(me.organizationId, e.organization_id as string | null | undefined)) return false
    return liveClassGradesEqual(e.grade_level as string | null | undefined, me.grade) && inClassAudience(eventClassIds(e), myClass)
  })

  return NextResponse.json({ items })
}

/** Create a live class (teacher or admin). */
export async function POST(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canOrganize(auth.userRole)) {
    return NextResponse.json({ error: 'Only teachers or admins can create live classes' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const {
    title,
    description,
    lesson_id,
    grade_level,
    scheduled_start_at,
    scheduled_end_at,
    timezone,
    max_attendees,
    audience_class_ids,
  } = body

  if (!title || !scheduled_start_at || !scheduled_end_at) {
    return NextResponse.json(
      { error: 'Missing title, scheduled_start_at, or scheduled_end_at' },
      { status: 400 }
    )
  }

  const supabase = createServerSupabase()

  const v = await validateLiveClassGradeAndLesson(supabase, {
    userId: auth.userId,
    userRole: auth.userRole ?? null,
    gradeLevel: grade_level,
    lessonId: lesson_id ?? null,
  })
  if (!v.ok) {
    return NextResponse.json({ error: v.message }, { status: v.status })
  }

  const requestedClasses: string[] = Array.isArray(audience_class_ids)
    ? audience_class_ids.filter((id: unknown): id is string => typeof id === 'string')
    : []
  const classIds = requestedClasses.length
    ? await validAudienceClasses(
        supabase,
        await getUserSchoolId(supabase, auth.userId),
        typeof grade_level === 'string' ? grade_level.trim().toLowerCase() : null,
        requestedClasses,
      )
    : []
  if (!classIds) {
    return NextResponse.json({ error: 'Pick classes from this grade at your school' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('live_class_events')
    .insert({
      organizer_id: auth.userId,
      title,
      description: description ?? null,
      lesson_id: lesson_id ?? null,
      grade_level: typeof grade_level === 'string' ? grade_level.trim() : null,
      scheduled_start_at,
      scheduled_end_at,
      timezone: timezone || 'UTC',
      max_attendees: max_attendees ?? null,
      audience_class_ids: classIds,
      status: 'scheduled',
    })
    .select('id, organization_id')
    .single()

  if (error || !data) {
    console.error('[live-classes POST]', error)
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  const gl =
    typeof grade_level === 'string' ? grade_level.trim() : (grade_level as string | null | undefined)
  const maxCap = max_attendees != null && Number.isFinite(Number(max_attendees)) ? Number(max_attendees) : null

  const { enrolled, rpcFailed } = await enrollAllStudentsForGradeLevel(supabase, {
    eventId: data.id,
    gradeLevelRaw: gl,
    organizationId: (data as { organization_id?: string | null }).organization_id ?? null,
    organizerId: auth.userId,
    maxAttendees: maxCap,
    classIds,
  })

  return NextResponse.json({
    id: data.id,
    auto_enrolled: enrolled,
    auto_enroll_lookup_failed: rpcFailed,
  })
}
