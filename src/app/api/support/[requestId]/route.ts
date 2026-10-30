import { after, NextResponse, type NextRequest } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { parseMessage } from '@/lib/support'
import { addMyMessage, alertStaff, getMyRequest, requireSupportUser, SupportError, supportErrorResponse } from '@/lib/support.server'
import { isUuid } from '@/lib/platform-admin.server'

type Params = { params: Promise<{ requestId: string }> }

/** One of the person's requests with the whole conversation. Marks replies read. */
export async function GET(_request: NextRequest, { params }: Params) {
  const access = await requireSupportUser()
  if (!access.ok) return access.response
  try {
    const { requestId } = await params
    if (!isUuid(requestId)) throw new SupportError('Request not found', 404)
    return NextResponse.json({ request: await getMyRequest(access.supabase, access.user.id, requestId) })
  } catch (error) {
    return supportErrorResponse(error, 'Could not load this request', 'GET /api/support/[requestId]')
  }
}

/** A follow-up message from the person. Reopens the request if it was resolved. */
export async function POST(request: NextRequest, { params }: Params) {
  const access = await requireSupportUser()
  if (!access.ok) return access.response
  try {
    const { requestId } = await params
    if (!isUuid(requestId)) throw new SupportError('Request not found', 404)
    const body = await request.json().catch(() => null)
    const parsed = parseMessage(body?.message)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const info = await addMyMessage(access.supabase, access.user, requestId, parsed.value)
    const origin = appOrigin(request)
    after(() =>
      alertStaff(access.supabase, origin, { requestId, kind: 'follow_up', category: info.category, subject: info.subject, message: parsed.value, user: access.user, schoolName: info.schoolName }),
    )
    return NextResponse.json({ request: await getMyRequest(access.supabase, access.user.id, requestId) })
  } catch (error) {
    return supportErrorResponse(error, 'Could not send your message', 'POST /api/support/[requestId]')
  }
}
