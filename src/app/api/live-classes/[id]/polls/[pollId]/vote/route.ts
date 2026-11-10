import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { castVote, pollAccess } from '@/lib/live-class-polls.server'
import { createServerSupabase } from '@/lib/supabase.server'

type Ctx = { params: Promise<{ id: string; pollId: string }> }

/** A student answers the open poll: { option }. Answering again changes the answer. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id, pollId } = await ctx.params
    const supabase = createServerSupabase()
    const access = await pollAccess(supabase, id, auth.userId)
    if (!access) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (access.isHost) return NextResponse.json({ error: 'The teacher doesn’t answer their own poll' }, { status: 403 })
    const body = (await request.json().catch(() => null)) as { option?: unknown } | null
    const counted = await castVote(supabase, access, pollId, auth.userId, body?.option)
    if (!counted) return NextResponse.json({ error: 'This poll has ended' }, { status: 409 })
    return NextResponse.json({ ok: true, myVote: body?.option })
  } catch (error) {
    console.error('[polls vote]', error)
    return NextResponse.json({ error: 'Could not send your answer' }, { status: 500 })
  }
}
