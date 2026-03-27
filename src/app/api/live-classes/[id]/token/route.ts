import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { liveClassRoomName, isWithinLiveClassWindow, ensureRoomLearningSession } from '@/lib/live-class'
import { ensureLiveKitRoomSessionMetadata, getLiveKitWsUrl, mintLiveKitParticipantToken } from '@/lib/livekit-token'
import { deductCreditsForMinute, hasEnoughCredits } from '@/lib/credits'
import { isEligibleLiveClassAttendee } from '@/lib/live-class-attendance'

type Ctx = { params: Promise<{ id: string }> }

/** Mint LiveKit token for an enrolled user or organizer; ensure room learning session. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: evErr } = await supabase.from('live_class_events').select('*').eq('id', eventId).maybeSingle()

  if (evErr || !ev) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const isOrganizer = ev.organizer_id === auth.userId
  const { data: enr } = await supabase
    .from('live_class_enrollments')
    .select('id')
    .eq('live_class_event_id', eventId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (!isOrganizer && !enr) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  if (!isOrganizer) {
    const okGrade = await isEligibleLiveClassAttendee(supabase, {
      organizerId: ev.organizer_id as string,
      attendeeUserId: auth.userId,
      eventGradeLevel: ev.grade_level as string | null,
    })
    if (!okGrade) {
      return NextResponse.json({ error: 'Only the host or students in this grade can join the live room' }, { status: 403 })
    }
  }

  const window = isWithinLiveClassWindow(ev.scheduled_start_at, ev.scheduled_end_at)
  if (!window.ok) {
    return NextResponse.json({ error: window.reason || 'Outside class window' }, { status: 403 })
  }

  const { data: userRow } = await supabase.from('users').select('name').eq('id', auth.userId).maybeSingle()
  const displayName = (userRow as { name?: string } | null)?.name || auth.userId

  let learningSessionId: string
  try {
    const ensured = await ensureRoomLearningSession(supabase, {
      liveClassEventId: eventId,
      organizerId: ev.organizer_id as string,
      topic: (ev.title as string) || 'Live class',
    })
    learningSessionId = ensured.sessionId

    if (ensured.created) {
      const okCredits = await hasEnoughCredits(ev.organizer_id as string, 1)
      if (!okCredits) {
        await supabase.from('learning_sessions').delete().eq('id', learningSessionId)
        return NextResponse.json({ error: 'Organizer has insufficient credits' }, { status: 402 })
      }
      const deduct = await deductCreditsForMinute(ev.organizer_id as string, learningSessionId)
      if (!deduct.success) {
        await supabase.from('learning_sessions').delete().eq('id', learningSessionId)
        return NextResponse.json({ error: deduct.error || 'Credit deduction failed' }, { status: 402 })
      }
    }
  } catch (e: unknown) {
    console.error('[token ensure session]', e)
    return NextResponse.json({ error: 'Session setup failed' }, { status: 500 })
  }

  const roomName = liveClassRoomName(eventId, ev.livekit_room_name as string | null)

  // Idempotent: ensures agent-visible metadata even if a prior LiveKit call failed.
  await ensureLiveKitRoomSessionMetadata(roomName, learningSessionId)

  try {
    const url = getLiveKitWsUrl()
    const token = await mintLiveKitParticipantToken({
      roomName,
      participantIdentity: auth.userId,
      participantName: displayName,
    })

    if (enr) {
      await supabase
        .from('live_class_enrollments')
        .update({ joined_at: new Date().toISOString() })
        .eq('live_class_event_id', eventId)
        .eq('user_id', auth.userId)
    }

    return NextResponse.json({
      url,
      token,
      roomName,
      learningSessionId,
    })
  } catch (e: unknown) {
    console.error('[token mint]', e)
    return NextResponse.json({ error: 'Could not connect to live room' }, { status: 500 })
  }
}
