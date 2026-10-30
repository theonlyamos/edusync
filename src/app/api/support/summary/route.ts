import { NextResponse } from 'next/server'
import { myUnreadCount, requireSupportUser, supportErrorResponse } from '@/lib/support.server'

/** How many of the person's requests have a reply they haven't read. */
export async function GET() {
  const access = await requireSupportUser()
  if (!access.ok) return access.response
  try {
    return NextResponse.json({ unread: await myUnreadCount(access.supabase, access.user.id) })
  } catch (error) {
    return supportErrorResponse(error, 'Could not check for replies', 'GET /api/support/summary')
  }
}
