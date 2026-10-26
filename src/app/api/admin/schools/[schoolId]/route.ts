import { NextResponse } from 'next/server'
import { adminErrorResponse, getSchoolDetail, requirePlatformAdmin } from '@/lib/platform-admin.server'

type Params = { params: Promise<{ schoolId: string }> }

/** One school: members, credit history, usage, lessons and admin activity. */
export async function GET(_request: Request, { params }: Params) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const { schoolId } = await params
    return NextResponse.json(await getSchoolDetail(access.context.supabase, schoolId))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load the school', 'GET /api/admin/schools/[schoolId]')
  }
}
