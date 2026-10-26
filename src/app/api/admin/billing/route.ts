import { NextResponse } from 'next/server'
import { adminErrorResponse, getBilling, requirePlatformAdmin } from '@/lib/platform-admin.server'

/** Purchases, grants and trials over the last 12 months. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json(await getBilling(access.context.supabase))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load billing', 'GET /api/admin/billing')
  }
}
