import { NextRequest, NextResponse } from 'next/server'
import { adminErrorResponse, getUsage, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** AI use over ?days= (7, 30 or 90): minutes, visuals, images, top schools and failed jobs. */
export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const requested = Number(request.nextUrl.searchParams.get('days'))
    const days = [7, 30, 90].includes(requested) ? requested : 30
    return NextResponse.json(await getUsage(access.context.supabase, days))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load AI usage', 'GET /api/admin/usage')
  }
}
