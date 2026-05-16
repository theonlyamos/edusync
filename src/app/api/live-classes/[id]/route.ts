import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { validateLiveClassGradeAndLesson } from '@/lib/live-class-lesson-validation'
import { isEligibleLiveClassAttendee } from '@/lib/live-class-attendance'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error } = await supabase
    .from('live_class_events')
    .select('*, lessons(title)')
    .eq('id', id)
    .maybeSingle()

  if (error || !ev) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isOrganizer = ev.organizer_id === auth.userId
  const { data: enr } = await supabase
    .from('live_class_enrollments')
    .select('id')
    .eq('live_class_event_id', id)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (!isOrganizer && !enr) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isOrganizer) {
    const ok = await isEligibleLiveClassAttendee(supabase, {
      organizerId: ev.organizer_id as string,
      attendeeUserId: auth.userId,
      eventGradeLevel: ev.grade_level as string | null,
    })
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.json({ event: ev })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: loadErr } = await supabase
    .from('live_class_events')
    .select('organizer_id, grade_level, lesson_id')
    .eq('id', id)
    .maybeSingle()

  if (loadErr || !ev || ev.organizer_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const allowed = [
    'title',
    'description',
    'lesson_id',
    'grade_level',
    'scheduled_start_at',
    'scheduled_end_at',
    'timezone',
    'status',
    'livekit_room_name',
    'max_attendees',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) patch[k] = body[k]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  if ('grade_level' in body || 'lesson_id' in body) {
    const nextGrade =
      body.grade_level !== undefined ? (body.grade_level as string | null) : (ev.grade_level as string | null)
    const nextLesson =
      body.lesson_id !== undefined ? (body.lesson_id as string | null) : (ev.lesson_id as string | null)

    const v = await validateLiveClassGradeAndLesson(supabase, {
      userId: auth.userId,
      userRole: auth.userRole ?? null,
      gradeLevel: nextGrade,
      lessonId: nextLesson,
    })
    if (!v.ok) {
      return NextResponse.json({ error: v.message }, { status: v.status })
    }
  }

  if (typeof patch.grade_level === 'string') {
    patch.grade_level = patch.grade_level.trim()
  }

  const { error } = await supabase.from('live_class_events').update(patch).eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: loadErr } = await supabase
    .from('live_class_events')
    .select('organizer_id')
    .eq('id', id)
    .maybeSingle()

  if (loadErr || !ev || ev.organizer_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('live_class_events').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
