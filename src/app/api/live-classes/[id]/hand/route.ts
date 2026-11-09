import { NextRequest, NextResponse } from 'next/server'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getAuthContext } from '@/lib/get-auth-context'
import { env } from '@/lib/env'
import { liveClassRoomName } from '@/lib/live-class'
import { canSetHand, handAttribute } from '@/lib/live-class-hand'
import { getLiveKitHttpHost } from '@/lib/livekit-token'
import { createServerSupabase } from '@/lib/supabase.server'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Raises or lowers a hand in a live class: { raised, participantIdentity? }.
 * Everyone sets their own; the host can lower anyone's. Only someone who is in
 * the room has a hand to change, so the room itself is the membership check.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: eventId } = await ctx.params
  const body = (await request.json().catch(() => null)) as { raised?: unknown; participantIdentity?: unknown } | null
  if (typeof body?.raised !== 'boolean') return NextResponse.json({ error: 'raised (boolean) is required' }, { status: 400 })
  const targetId = typeof body.participantIdentity === 'string' && body.participantIdentity ? body.participantIdentity.slice(0, 200) : auth.userId

  const supabase = createServerSupabase()
  const { data: ev, error: evErr } = await supabase
    .from('live_class_events')
    .select('organizer_id, livekit_room_name')
    .eq('id', eventId)
    .maybeSingle()
  if (evErr || !ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (!canSetHand({ callerId: auth.userId, hostId: (ev.organizer_id as string | null) ?? null, targetId, raised: body.raised })) {
    return NextResponse.json({ error: 'Only the host can lower someone else’s hand' }, { status: 403 })
  }

  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env()
  if (!apiKey || !apiSecret) return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 })

  try {
    const client = new RoomServiceClient(getLiveKitHttpHost(), apiKey, apiSecret)
    await client.updateParticipant(liveClassRoomName(eventId, ev.livekit_room_name as string | null), targetId, { attributes: handAttribute(body.raised) })
    return NextResponse.json({ ok: true, raised: body.raised })
  } catch (e: unknown) {
    console.error('[hand]', e)
    // Not in the room (or the room has ended): there is no hand to change.
    return NextResponse.json({ error: 'Join the class to raise your hand' }, { status: 409 })
  }
}
