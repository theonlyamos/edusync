import { NextRequest, NextResponse } from 'next/server'
import { adminErrorResponse, listFeedback, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** Tutor feedback, newest first; ?rating=positive|neutral|negative. */
export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json({ feedback: await listFeedback(access.context.supabase, { rating: request.nextUrl.searchParams.get('rating') }) })
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load feedback', 'GET /api/admin/feedback')
  }
}
