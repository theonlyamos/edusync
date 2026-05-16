import type { SupabaseClient } from '@supabase/supabase-js'
import { isWithinLiveClassJoinWindow, parseLobbyMinutes } from '@/lib/live-class-window'

/** Stable LiveKit room name for a scheduled class. */
export function liveClassRoomName(eventId: string, storedName?: string | null): string {
  if (storedName && storedName.trim().length > 0) return storedName.trim()
  return `live_class_${eventId.replace(/-/g, '')}`
}

const serverLobbyMinutes = () => parseLobbyMinutes(process.env.LIVE_CLASS_LOBBY_MINUTES)

export function isWithinLiveClassWindow(
  start: string,
  end: string,
  now: Date = new Date()
): { ok: boolean; reason?: string } {
  return isWithinLiveClassJoinWindow(start, end, { now, lobbyMinutes: serverLobbyMinutes() })
}

/** First active learning_session for this live class, or create one owned by organizer. */
export async function ensureRoomLearningSession(
  supabase: SupabaseClient,
  params: {
    liveClassEventId: string
    organizerId: string
    topic: string
  }
): Promise<{ sessionId: string; created: boolean }> {
  const { liveClassEventId, organizerId, topic } = params

  const { data: existing } = await supabase
    .from('learning_sessions')
    .select('id')
    .eq('live_class_event_id', liveClassEventId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return { sessionId: existing.id, created: false }
  }

  const { data: inserted, error } = await supabase
    .from('learning_sessions')
    .insert({
      user_id: organizerId,
      live_class_event_id: liveClassEventId,
      status: 'active',
      topic: topic || null,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || 'Failed to create room learning session')
  }

  return { sessionId: inserted.id, created: true }
}
