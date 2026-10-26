import { NextResponse } from 'next/server'
import { adminErrorResponse, listSchools, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** Every school with its owner, members, credits and last activity. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json({ schools: await listSchools(access.context.supabase) })
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load schools', 'GET /api/admin/schools')
  }
}
