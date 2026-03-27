import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { isEligibleLiveClassAttendee, normalizeLiveClassGrade } from '@/lib/live-class-attendance'

type Ctx = { params: Promise<{ id: string }> }

/** Logged-in student enrolls themselves when their grade matches the class (host does not enroll here). */
export async function POST(_request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(_request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: evErr } = await supabase
    .from('live_class_events')
    .select('id, organizer_id, max_attendees, status, grade_level')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr || !ev) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (ev.status === 'cancelled' || ev.status === 'ended') {
    return NextResponse.json({ error: 'Event is not open for enrollment' }, { status: 400 })
  }

  if (ev.organizer_id === auth.userId) {
    return NextResponse.json({ ok: true, already: true })
  }

  if (!normalizeLiveClassGrade(ev.grade_level as string | null)) {
    return NextResponse.json({ error: 'This class has no grade set; ask the teacher to fix it' }, { status: 400 })
  }

  const eligible = await isEligibleLiveClassAttendee(supabase, {
    organizerId: ev.organizer_id as string,
    attendeeUserId: auth.userId,
    eventGradeLevel: ev.grade_level as string | null,
  })
  if (!eligible) {
    return NextResponse.json({ error: 'Only students in this class grade can join' }, { status: 403 })
  }

  if (ev.max_attendees != null) {
    const { count } = await supabase
      .from('live_class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('live_class_event_id', eventId)
    if ((count ?? 0) >= ev.max_attendees) {
      return NextResponse.json({ error: 'Class is full' }, { status: 400 })
    }
  }

  const { error } = await supabase.from('live_class_enrollments').upsert(
    {
      live_class_event_id: eventId,
      user_id: auth.userId,
      role: 'student',
    },
    { onConflict: 'live_class_event_id,user_id' }
  )

  if (error) {
    console.error('[live-classes join]', error)
    return NextResponse.json({ error: 'Could not enroll' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
