import { NextResponse } from 'next/server'
import { adminErrorResponse, listActivity, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** What platform admins have done, newest first. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json({ activity: await listActivity(access.context.supabase, { limit: 500 }) })
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load the activity log', 'GET /api/admin/activity')
  }
}
