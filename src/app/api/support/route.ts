import { after, NextResponse, type NextRequest } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { parseNewRequest } from '@/lib/support'
import { alertStaff, createSupportRequest, listMyRequests, requireSupportUser, supportErrorResponse } from '@/lib/support.server'

/** The signed-in person's own help requests, newest activity first. */
export async function GET() {
  const access = await requireSupportUser()
  if (!access.ok) return access.response
  try {
    return NextResponse.json({ requests: await listMyRequests(access.supabase, access.user.id) })
  } catch (error) {
    return supportErrorResponse(error, 'Could not load your requests', 'GET /api/support')
  }
}

/** Sends a new request to the InsyteAI team and emails support about it. */
export async function POST(request: NextRequest) {
  const access = await requireSupportUser()
  if (!access.ok) return access.response
  try {
    const parsed = parseNewRequest(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const created = await createSupportRequest(access.supabase, access.user, { ...parsed.value, userAgent: request.headers.get('user-agent') })
    const origin = appOrigin(request)
    after(() =>
      alertStaff(access.supabase, origin, {
        requestId: created.id,
        kind: 'new',
        category: parsed.value.category,
        subject: parsed.value.subject,
        message: parsed.value.message,
        user: access.user,
        schoolName: created.schoolName,
      }),
    )
    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch (error) {
    return supportErrorResponse(error, 'Could not send your request', 'POST /api/support')
  }
}
