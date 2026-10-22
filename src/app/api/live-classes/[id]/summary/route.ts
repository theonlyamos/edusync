import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { buildAttendance, visualLabel, type LiveClassSummary } from '@/lib/live-class-summary'

type Ctx = { params: Promise<{ id: string }> }

const VISUALS_SHOWN = 100

/** Summary of a live class for the teacher who organised it. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const db = createServerSupabase()

  const { data: ev, error } = await db
    .from('live_class_events')
    .select('id,title,grade_level,scheduled_start_at,scheduled_end_at,status,organizer_id,lessons(title)')
    .eq('id', id)
    .maybeSingle()
  if (error || !ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ev.organizer_id !== auth.userId) {
    return NextResponse.json({ error: 'Only the teacher who ran this class can see its summary' }, { status: 403 })
  }

  const [enrollments, sessions, billing] = await Promise.all([
    db.from('live_class_enrollments').select('user_id,role,joined_at').eq('live_class_event_id', id),
    db
      .from('learning_sessions')
      .select('id,topic,created_at,ended_at')
      .eq('live_class_event_id', id)
      .order('created_at', { ascending: true }),
    db.from('live_class_billing').select('minutes_charged').eq('live_class_event_id', id),
  ])
  if (enrollments.error) throw enrollments.error
  if (sessions.error) throw sessions.error
  if (billing.error) throw billing.error

  const userIds = (enrollments.data ?? []).map((e) => e.user_id as string)
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data: users, error: userError } = await db.from('users').select('id,name,email').in('id', userIds)
    if (userError) throw userError
    for (const u of users ?? []) names.set(u.id, u.name || u.email || 'Student')
  }

  const sessionRows = sessions.data ?? []
  const sessionIds = sessionRows.map((s) => s.id as string)
  let visuals: LiveClassSummary['visuals'] = []
  let visualCount = 0
  if (sessionIds.length) {
    const { data: rows, error: vizError, count } = await db
      .from('learning_visualizations')
      .select('id,description,explanation,created_at', { count: 'exact' })
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true })
      .limit(VISUALS_SHOWN)
    if (vizError) throw vizError
    visualCount = count ?? rows?.length ?? 0
    visuals = (rows ?? []).map((v) => ({
      id: v.id as string,
      description: visualLabel(v.description as string | null, v.explanation as string | null),
      createdAt: v.created_at as string,
    }))
  }

  const lessons = ev.lessons as { title?: string } | { title?: string }[] | null
  const lessonTitle = Array.isArray(lessons) ? lessons[0]?.title ?? null : lessons?.title ?? null
  const first = sessionRows[0]
  const last = sessionRows[sessionRows.length - 1]
  const summary: LiveClassSummary = {
    event: {
      id: ev.id as string,
      title: ev.title as string,
      gradeLevel: (ev.grade_level as string | null) ?? null,
      lessonTitle,
      scheduledStart: ev.scheduled_start_at as string,
      scheduledEnd: ev.scheduled_end_at as string,
      status: ev.status as string,
    },
    ...buildAttendance(enrollments.data ?? [], names, ev.organizer_id as string),
    session: first
      ? {
          topic: sessionRows.map((s) => s.topic as string | null).reverse().find(Boolean) ?? null,
          startedAt: first.created_at as string,
          // Only a recorded end counts; updated_at moves on any session change.
          endedAt: (last.ended_at as string | null) ?? null,
          minutesCharged: (billing.data ?? []).reduce((n, b) => n + (Number(b.minutes_charged) || 0), 0),
        }
      : null,
    visuals,
    visualCount,
  }
  return NextResponse.json(summary)
}
