import { NextResponse } from 'next/server'
import { parseGrantCredits, parseReason, parseTrialDays } from '@/lib/platform-admin'
import {
  adminErrorResponse,
  extendSchoolTrial,
  grantSchoolCredits,
  requirePlatformAdmin,
  setSchoolActive,
  transferSchoolOwnership,
} from '@/lib/platform-admin.server'

type Params = { params: Promise<{ schoolId: string }> }

/**
 * Support actions on a school. Body: { action, reason, ... }:
 * grant_credits { credits }, extend_trial { days }, suspend, reactivate,
 * transfer_owner { userId }. Every action needs a reason and is logged.
 */
export async function POST(request: Request, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { schoolId } = await params
    const body = await request.json().catch(() => null)
    const reason = parseReason(body?.reason)
    if (!reason) return NextResponse.json({ error: 'Say why, in a few words (up to 300 characters).' }, { status: 400 })
    switch (body?.action) {
      case 'grant_credits': {
        const credits = parseGrantCredits(body.credits)
        if (!credits) return NextResponse.json({ error: 'Enter a whole number of credits from 1 to 100,000.' }, { status: 400 })
        return NextResponse.json(await grantSchoolCredits(access.context, schoolId, credits, reason))
      }
      case 'extend_trial': {
        const days = parseTrialDays(body.days)
        if (!days) return NextResponse.json({ error: 'Enter a number of days from 1 to 90.' }, { status: 400 })
        return NextResponse.json(await extendSchoolTrial(access.context, schoolId, days, reason))
      }
      case 'suspend':
      case 'reactivate':
        await setSchoolActive(access.context, schoolId, body.action === 'reactivate', reason)
        return NextResponse.json({ ok: true })
      case 'transfer_owner':
        await transferSchoolOwnership(access.context, schoolId, String(body.userId ?? ''), reason)
        return NextResponse.json({ ok: true })
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    return adminErrorResponse(error, 'That didn’t work. Please try again.', 'POST /api/admin/schools/[schoolId]/actions')
  }
}
