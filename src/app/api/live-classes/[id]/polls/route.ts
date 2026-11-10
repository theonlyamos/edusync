import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { parsePollInput } from '@/lib/live-class-polls'
import { createPoll, latestPoll, pollAccess } from '@/lib/live-class-polls.server'
import { createServerSupabase } from '@/lib/supabase.server'

type Ctx = { params: Promise<{ id: string }> }

/** The class's latest poll, as the caller may see it. `poll` is null when there has been none. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = createServerSupabase()
    const access = await pollAccess(supabase, (await ctx.params).id, auth.userId)
    if (!access) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    return NextResponse.json({ poll: await latestPoll(supabase, access, auth.userId), isHost: access.isHost })
  } catch (error) {
    console.error('[polls GET]', error)
    return NextResponse.json({ error: 'Could not load the poll' }, { status: 500 })
  }
}

/** The host starts a poll: { question, options }. A poll still open is ended first. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = createServerSupabase()
    const access = await pollAccess(supabase, (await ctx.params).id, auth.userId)
    if (!access) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!access.isHost) return NextResponse.json({ error: 'Only the teacher can start a poll' }, { status: 403 })
    const parsed = parsePollInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    return NextResponse.json({ poll: await createPoll(supabase, access, auth.userId, parsed.poll) })
  } catch (error) {
    // Two "start" presses at the same moment: the class already has its poll.
    if ((error as { code?: string })?.code === '23505') return NextResponse.json({ error: 'A poll was just started. End it before starting another.' }, { status: 409 })
    console.error('[polls POST]', error)
    return NextResponse.json({ error: 'Could not start the poll' }, { status: 500 })
  }
}
