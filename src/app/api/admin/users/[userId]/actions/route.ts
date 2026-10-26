import { NextResponse } from 'next/server'
import { parseGrantCredits, parseReason } from '@/lib/platform-admin'
import { adminErrorResponse, grantUserCredits, requirePlatformAdmin, setUserActive } from '@/lib/platform-admin.server'

type Params = { params: Promise<{ userId: string }> }

/** Support actions on an account: grant_credits { credits }, deactivate, reactivate. Each needs a reason. */
export async function POST(request: Request, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { userId } = await params
    const body = await request.json().catch(() => null)
    const reason = parseReason(body?.reason)
    if (!reason) return NextResponse.json({ error: 'Say why, in a few words (up to 300 characters).' }, { status: 400 })
    switch (body?.action) {
      case 'grant_credits': {
        const credits = parseGrantCredits(body.credits)
        if (!credits) return NextResponse.json({ error: 'Enter a whole number of credits from 1 to 100,000.' }, { status: 400 })
        return NextResponse.json(await grantUserCredits(access.context, userId, credits, reason))
      }
      case 'deactivate':
      case 'reactivate':
        await setUserActive(access.context, userId, body.action === 'reactivate', reason)
        return NextResponse.json({ ok: true })
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    return adminErrorResponse(error, 'That didn’t work. Please try again.', 'POST /api/admin/users/[userId]/actions')
  }
}
