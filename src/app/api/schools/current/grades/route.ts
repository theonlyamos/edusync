import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { getGradesSummary } from '@/lib/school-grades.server'

/** Each grade with its students, teachers and lessons. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    return NextResponse.json({ grades: await getGradesSummary(supabase, membership.school) })
  } catch (error) {
    console.error('Error in GET /api/schools/current/grades:', error)
    return NextResponse.json({ error: 'Failed to load grades' }, { status: 500 })
  }
}
