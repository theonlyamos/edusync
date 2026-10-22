import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { parseReportRange } from '@/lib/school-reports'
import { getSchoolReport } from '@/lib/school-reports.server'

/** Usage and activity for the school over ?days=7|30|90|365 (default 30). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const days = parseReportRange(request.nextUrl.searchParams.get('days'))
    return NextResponse.json(await getSchoolReport(supabase, membership.school, { days }))
  } catch (error) {
    console.error('Error in GET /api/schools/current/reports:', error)
    return NextResponse.json({ error: 'Failed to load the report' }, { status: 500 })
  }
}
