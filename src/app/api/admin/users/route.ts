import { NextRequest, NextResponse } from 'next/server'
import { adminErrorResponse, requirePlatformAdmin, searchUsers } from '@/lib/platform-admin.server'

/** Every account, newest first: ?q= matches email or name, ?role= and ?page=. */
export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const params = request.nextUrl.searchParams
    return NextResponse.json(
      await searchUsers(access.context.supabase, { query: params.get('q'), role: params.get('role'), page: Number(params.get('page')) || 1 }),
    )
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load accounts', 'GET /api/admin/users')
  }
}
