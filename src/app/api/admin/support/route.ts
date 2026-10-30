import { NextResponse, type NextRequest } from 'next/server'
import { isUuid, requirePlatformAdmin } from '@/lib/platform-admin.server'
import { listSupportRequests, supportErrorResponse, supportSummary } from '@/lib/support.server'

/** Help requests, newest activity first. ?status=active|open|in_progress|resolved&category=…&userId=… */
export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const params = request.nextUrl.searchParams
    const userId = params.get('userId')
    const [requests, summary] = await Promise.all([
      listSupportRequests(access.context.supabase, { status: params.get('status'), category: params.get('category'), userId: isUuid(userId) ? userId : null }),
      supportSummary(access.context.supabase),
    ])
    return NextResponse.json({ requests, summary })
  } catch (error) {
    return supportErrorResponse(error, 'Failed to load support requests', 'GET /api/admin/support')
  }
}
