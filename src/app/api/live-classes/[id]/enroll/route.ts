import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { liveClassGradesEqual, normalizeLiveClassGrade } from '@/lib/live-class-attendance'

type Ctx = { params: Promise<{ id: string }> }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BATCH = 100

/** Organizer adds enrollments (batch of user UUIDs). */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: evErr } = await supabase
    .from('live_class_events')
    .select('organizer_id, max_attendees, grade_level')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr || !ev || ev.organizer_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requiredGrade = normalizeLiveClassGrade(ev.grade_level as string | null)
  if (!requiredGrade) {
    return NextResponse.json({ error: 'Set a grade level on this class before adding students' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIds: unknown[] = Array.isArray(body.user_ids) ? body.user_ids : []
  if (rawIds.length === 0) {
    return NextResponse.json({ error: 'user_ids required' }, { status: 400 })
  }
  if (rawIds.length > MAX_BATCH) {
    return NextResponse.json({ error: `At most ${MAX_BATCH} user_ids per request` }, { status: 400 })
  }

  const userIds: string[] = []
  for (const u of rawIds) {
    const id = typeof u === 'string' ? u.trim() : ''
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid user_id in list' }, { status: 400 })
    }
    userIds.push(id)
  }

  const roleRaw = typeof body.role === 'string' ? body.role : 'student'
  if (roleRaw !== 'student') {
    return NextResponse.json({ error: 'Only student enrollments are supported' }, { status: 400 })
  }
  const role = 'student' as const

  const { data: studentRows, error: stErr } = await supabase
    .from('students')
    .select('user_id, grade')
    .in('user_id', userIds)

  if (stErr) {
    console.error('[enroll] students lookup', stErr)
    return NextResponse.json({ error: 'Could not verify student grades' }, { status: 500 })
  }

  const gradeByUser = new Map<string, string>()
  for (const row of studentRows || []) {
    const uid = (row as { user_id: string; grade?: string }).user_id
    const g = (row as { grade?: string }).grade
    if (uid && g) gradeByUser.set(uid, g)
  }

  for (const uid of userIds) {
    if (uid === ev.organizer_id) continue
    const g = gradeByUser.get(uid)
    if (!liveClassGradesEqual(requiredGrade, g)) {
      return NextResponse.json(
        { error: 'Each user must be a student whose grade matches this class' },
        { status: 400 }
      )
    }
  }

  if (ev.max_attendees != null) {
    const { count } = await supabase
      .from('live_class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('live_class_event_id', eventId)
    const current = count ?? 0
    if (current + userIds.length > ev.max_attendees) {
      return NextResponse.json({ error: 'Would exceed max_attendees' }, { status: 400 })
    }
  }

  const rows = userIds.map((user_id) => ({
    live_class_event_id: eventId,
    user_id,
    role,
  }))

  const { error } = await supabase.from('live_class_enrollments').upsert(rows, {
    onConflict: 'live_class_event_id,user_id',
  })

  if (error) {
    console.error('[enroll]', error)
    return NextResponse.json({ error: 'Enroll failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
