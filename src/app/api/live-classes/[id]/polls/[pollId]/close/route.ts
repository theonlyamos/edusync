import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { closePoll, latestPoll, pollAccess } from '@/lib/live-class-polls.server'
import { createServerSupabase } from '@/lib/supabase.server'

type Ctx = { params: Promise<{ id: string; pollId: string }> }

/** The host ends a poll, which shares the results with the class. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id, pollId } = await ctx.params
    const supabase = createServerSupabase()
    const access = await pollAccess(supabase, id, auth.userId)
    if (!access) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!access.isHost) return NextResponse.json({ error: 'Only the teacher can end a poll' }, { status: 403 })
    // Already ended (a second press): answer with how things stand.
    const poll = (await closePoll(supabase, access, pollId)) ?? (await latestPoll(supabase, access, auth.userId))
    return NextResponse.json({ poll })
  } catch (error) {
    console.error('[polls close]', error)
    return NextResponse.json({ error: 'Could not end the poll' }, { status: 500 })
  }
}
