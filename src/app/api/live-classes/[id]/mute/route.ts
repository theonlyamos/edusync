import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitHttpHost } from '@/lib/livekit-token'
import { liveClassRoomName } from '@/lib/live-class'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await ctx.params
  const supabase = createServerSupabase()

  const { data: ev, error: evErr } = await supabase
    .from('live_class_events')
    .select('organizer_id, livekit_room_name')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr || !ev) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (ev.organizer_id !== auth.userId) {
    return NextResponse.json({ error: 'Only the host can mute participants' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { participantIdentity, trackSid, muted } = body

  if (!participantIdentity || !trackSid || typeof muted !== 'boolean') {
    return NextResponse.json(
      { error: 'participantIdentity, trackSid, and muted (boolean) are required' },
      { status: 400 },
    )
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 })
  }

  const roomName = liveClassRoomName(eventId, ev.livekit_room_name as string | null)
  const client = new RoomServiceClient(getLiveKitHttpHost(), apiKey, apiSecret)

  try {
    await client.mutePublishedTrack(roomName, participantIdentity, trackSid, muted)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('[mute]', e)
    return NextResponse.json({ error: 'Failed to update track' }, { status: 500 })
  }
}
