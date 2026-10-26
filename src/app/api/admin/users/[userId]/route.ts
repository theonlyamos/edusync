import { NextResponse } from 'next/server'
import { adminErrorResponse, getUserDetail, requirePlatformAdmin } from '@/lib/platform-admin.server'

type Params = { params: Promise<{ userId: string }> }

/** One account: school, credits, recent tutor sessions, feedback and admin activity. */
export async function GET(_request: Request, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { userId } = await params
    return NextResponse.json(await getUserDetail(access.context.supabase, userId))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load the account', 'GET /api/admin/users/[userId]')
  }
}
