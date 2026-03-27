import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { runVisualizeGeneration } from '@/lib/visualize-ai-task'

const HEADER = 'x-live-class-agent-secret'
const MAX_TASK_LEN = 12_000
const MAX_DESC_LEN = 2_000
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function agentSecretOk(received: string | null, expected: string): boolean {
  if (!received) return false
  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Called by the LiveKit agent worker (shared secret). Generates code from a task
 * description and inserts a learning_visualizations row for the room session.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get(HEADER)
  const expected = process.env.LIVE_CLASS_AGENT_SECRET
  if (!expected || !agentSecretOk(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { session_id, task_description, panel_dimensions, theme, theme_colors, description } = body

  if (!session_id || !task_description) {
    return NextResponse.json({ error: 'session_id and task_description required' }, { status: 400 })
  }
  const sid = typeof session_id === 'string' ? session_id.trim() : ''
  if (!UUID_RE.test(sid)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
  }

  const taskStr = typeof task_description === 'string' ? task_description : String(task_description)
  if (taskStr.length > MAX_TASK_LEN) {
    return NextResponse.json({ error: 'task_description too long' }, { status: 400 })
  }
  const descStr =
    description != null ? (typeof description === 'string' ? description : String(description)) : null
  if (descStr && descStr.length > MAX_DESC_LEN) {
    return NextResponse.json({ error: 'description too long' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: sess, error: sErr } = await supabase
    .from('learning_sessions')
    .select('id, live_class_event_id')
    .eq('id', sid)
    .maybeSingle()

  if (sErr || !sess?.live_class_event_id) {
    return NextResponse.json({ error: 'Invalid live class session' }, { status: 404 })
  }

  let viz: { explanation: string; code: string; library: string }
  try {
    viz = await runVisualizeGeneration({
      task_description: taskStr,
      panel_dimensions,
      theme,
      theme_colors,
    })
  } catch (e: any) {
    console.error('[persist-visualization]', e)
    return NextResponse.json({ error: e.message || 'Visualize failed' }, { status: 500 })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('learning_visualizations')
    .insert({
      session_id: sid,
      library: viz.library,
      explanation: viz.explanation,
      code: viz.code,
      description: descStr ?? null,
      panel_dimensions: panel_dimensions ?? null,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.error('[persist-visualization insert]', insErr)
    return NextResponse.json({ error: 'Failed to save visualization' }, { status: 500 })
  }

  return NextResponse.json({ id: inserted.id })
}
