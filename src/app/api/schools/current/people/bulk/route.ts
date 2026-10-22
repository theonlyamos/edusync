import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { normalizeGradeLevel } from '@/lib/school-people'
import { peopleErrorResponse, setMemberActive, type MemberRecord } from '@/lib/school-people.server'

const ACTIONS = ['deactivate', 'reactivate', 'set-grade'] as const
type Action = (typeof ACTIONS)[number]
const MAX_PER_REQUEST = 500

/**
 * Acts on many students or teachers at once: { memberIds, action, gradeLevel? }.
 * "set-grade" moves students to another grade (e.g. at the end of the year).
 * Administrators are left out; change them one at a time.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership, userId } = guard.context
    const body = await request.json().catch(() => null)
    const action = body?.action as Action
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const ids: string[] = Array.isArray(body?.memberIds) ? body.memberIds.filter((id: unknown) => typeof id === 'string') : []
    if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
    if (ids.length > MAX_PER_REQUEST) return NextResponse.json({ error: `Pick at most ${MAX_PER_REQUEST} people at once` }, { status: 400 })

    const school = membership.school
    let gradeLevel: string | null = null
    if (action === 'set-grade') {
      gradeLevel = normalizeGradeLevel(body?.gradeLevel)
      const grades = school.grade_levels ?? []
      if (!gradeLevel || (grades.length > 0 && !grades.includes(gradeLevel))) {
        return NextResponse.json({ error: 'Pick one of your school’s grades' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select('id, user_id, role, is_active')
      .eq('organization_id', school.id)
      .in('id', ids)
    if (error) throw error
    const members = ((data ?? []) as MemberRecord[]).filter((m) => m.role === 'student' || m.role === 'teacher')
    if (members.length !== ids.length) {
      return NextResponse.json({ error: 'Some of these people are not students or teachers in your school' }, { status: 400 })
    }

    if (action === 'set-grade') {
      if (members.some((m) => m.role !== 'student')) {
        return NextResponse.json({ error: 'Only students have a grade' }, { status: 400 })
      }
      const { error: updateError } = await supabase
        .from('students')
        .update({ grade: gradeLevel })
        .eq('organization_id', school.id)
        .in('user_id', members.map((m) => m.user_id))
      if (updateError) throw updateError
      return NextResponse.json({ updated: members.length })
    }

    const active = action === 'reactivate'
    let updated = 0
    const failed: Array<{ memberId: string; error: string }> = []
    for (const member of members) {
      if (member.is_active === active || member.user_id === userId) continue
      try {
        await setMemberActive(supabase, school.id, member, active)
        updated += 1
      } catch (err) {
        failed.push({ memberId: member.id, error: err instanceof Error ? err.message : 'Failed' })
      }
    }
    return NextResponse.json({ updated, failed })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to update these people', 'POST /api/schools/current/people/bulk')
    return NextResponse.json(body, { status })
  }
}
