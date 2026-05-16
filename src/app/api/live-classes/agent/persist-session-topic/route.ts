import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { validateAgentSecret, UUID_RE } from '@/lib/live-class-agent-auth'

const MAX_TOPIC_LEN = 500

/**
 * Called by the LiveKit agent worker (shared secret). Updates learning_sessions.topic
 * for a live-class session (same session row as persist-visualization).
 */
export async function POST(request: NextRequest) {
  const authErr = validateAgentSecret(request)
  if (authErr) return authErr

  const body = await request.json().catch(() => ({}))
  const { session_id, topic } = body

  const sid = typeof session_id === 'string' ? session_id.trim() : ''
  if (!sid || !UUID_RE.test(sid)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
  }

  const topicStr = typeof topic === 'string' ? topic.trim() : ''
  if (!topicStr) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 })
  }
  if (topicStr.length > MAX_TOPIC_LEN) {
    return NextResponse.json({ error: 'topic too long' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { count, error } = await supabase
    .from('learning_sessions')
    .update({ topic: topicStr }, { count: 'exact' })
    .eq('id', sid)
    .not('live_class_event_id', 'is', null)

  if (error) {
    console.error('[persist-session-topic]', error)
    return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 })
  }
  if (!count) {
    return NextResponse.json({ error: 'Invalid live class session' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
