import { NextResponse } from 'next/server'
import { adminErrorResponse, getPlatformOverview, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** Platform-wide numbers for the admin overview. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json(await getPlatformOverview(access.context.supabase))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load the overview', 'GET /api/admin/overview')
  }
}
