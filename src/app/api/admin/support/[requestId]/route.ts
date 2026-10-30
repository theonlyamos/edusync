import { NextResponse, type NextRequest } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { isUuid, requirePlatformAdmin } from '@/lib/platform-admin.server'
import { isSupportStatus, parseMessage } from '@/lib/support'
import { answerSupportRequest, getSupportRequest, SupportError, supportErrorResponse } from '@/lib/support.server'

type Params = { params: Promise<{ requestId: string }> }

/** One request with the whole conversation. Marks it read for support. */
export async function GET(_request: NextRequest, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { requestId } = await params
    if (!isUuid(requestId)) throw new SupportError('Request not found', 404)
    return NextResponse.json({ request: await getSupportRequest(access.context.supabase, requestId) })
  } catch (error) {
    return supportErrorResponse(error, 'Failed to load the request', 'GET /api/admin/support/[requestId]')
  }
}

/** Reply to the person (emailed to them) and/or change the status. Body: { message?, status? } */
export async function PATCH(request: NextRequest, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { requestId } = await params
    if (!isUuid(requestId)) throw new SupportError('Request not found', 404)
    const body = (await request.json().catch(() => null)) ?? {}
    const hasMessage = typeof body.message === 'string' && body.message.trim() !== ''
    const parsed = hasMessage ? parseMessage(body.message) : null
    if (parsed && !parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const status = body.status === undefined || body.status === null ? null : body.status
    if (status !== null && !isSupportStatus(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    if (!parsed && !status) return NextResponse.json({ error: 'Write a reply or choose a status.' }, { status: 400 })
    const result = await answerSupportRequest(
      access.context.supabase,
      access.context.adminId,
      requestId,
      { message: parsed?.ok ? parsed.value : null, status },
      appOrigin(request),
    )
    return NextResponse.json({ ...result, request: await getSupportRequest(access.context.supabase, requestId) })
  } catch (error) {
    return supportErrorResponse(error, 'Failed to update the request', 'PATCH /api/admin/support/[requestId]')
  }
}
