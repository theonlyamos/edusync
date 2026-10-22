import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { validatePromotionPlan, type PromotionPlan } from '@/lib/school-grades'
import { promoteStudents } from '@/lib/school-grades.server'

/**
 * End-of-year move: { plan: { [grade]: nextGrade | 'graduate' | 'keep' } }.
 * Graduating students are deactivated.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const body = await request.json().catch(() => null)
    const problem = validatePromotionPlan(body?.plan, membership.school.grade_levels ?? [])
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    return NextResponse.json(await promoteStudents(supabase, membership.school.id, body.plan as PromotionPlan))
  } catch (error) {
    console.error('Error in POST /api/schools/current/grades/promote:', error)
    return NextResponse.json({ error: 'The move stopped part way, so some students may already have moved. Check the Students page before you run it again.' }, { status: 500 })
  }
}
