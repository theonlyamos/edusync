import { NextRequest, NextResponse } from 'next/server'
import { validateAgentSecret, UUID_RE } from '@/lib/live-class-agent-auth'
import { billLiveClassMinute } from '@/lib/school-billing.server'

/**
 * Called by the LiveKit co-teacher agent (shared secret) about every 20 seconds
 * while a class runs. Pays the next minute when the paid one is about to end.
 * `stop: true` tells the agent the class has run out of credits.
 */
export async function POST(request: NextRequest) {
  const authErr = validateAgentSecret(request)
  if (authErr) return authErr

  const body = await request.json().catch(() => ({}))
  const sid = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  if (!sid || !UUID_RE.test(sid)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
  }

  try {
    const bill = await billLiveClassMinute(sid)
    if (bill.status === 'not_found') {
      return NextResponse.json({ error: 'Invalid live class session' }, { status: 404 })
    }
    return NextResponse.json({
      status: bill.status,
      stop: bill.status === 'insufficient_credits',
      paidUntil: bill.paidUntil,
      remainingCredits: bill.remainingCredits,
      payer: bill.payer,
    })
  } catch (error) {
    console.error('[live-class billing-tick]', error)
    return NextResponse.json({ error: 'Billing failed' }, { status: 500 })
  }
}
