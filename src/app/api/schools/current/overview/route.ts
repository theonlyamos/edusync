import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { getSchoolOverview } from '@/lib/school-overview.server'

/** Numbers for the school admin dashboard. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    return NextResponse.json(await getSchoolOverview(supabase, membership.school.id))
  } catch (error) {
    console.error('Error in GET /api/schools/current/overview:', error)
    return NextResponse.json({ error: 'Failed to load the school overview' }, { status: 500 })
  }
}
