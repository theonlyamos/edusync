import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-admin.server'
import { supportErrorResponse, supportSummary } from '@/lib/support.server'

/** Unread, open and in-progress counts for the sidebar badge. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json(await supportSummary(access.context.supabase))
  } catch (error) {
    return supportErrorResponse(error, 'Failed to load support counts', 'GET /api/admin/support/summary')
  }
}
