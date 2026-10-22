import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { listSchoolLessons } from '@/lib/school-lessons.server'

/** Every lesson in the school, for its administrators. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    return NextResponse.json({ lessons: await listSchoolLessons(supabase, membership.school.id) })
  } catch (error) {
    console.error('Error in GET /api/schools/current/lessons:', error)
    return NextResponse.json({ error: 'Failed to load lessons' }, { status: 500 })
  }
}
