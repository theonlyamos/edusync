import { NextRequest, NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES, type SchoolRouteContext } from '@/lib/school-access.server'
import { validatePersonUpdate, type SchoolPersonRole } from '@/lib/school-people'
import {
  findSchoolMember,
  peopleErrorResponse,
  PeopleError,
  setMemberActive,
  updateSchoolPerson,
  type MemberRecord,
} from '@/lib/school-people.server'

type Params = { params: Promise<{ memberId: string }> }

/** Admins (and the owner) can only be changed by the owner. Nobody changes their own role or access here. */
function assertCanManage(context: SchoolRouteContext, member: MemberRecord, { changingAccess }: { changingAccess: boolean }) {
  if (member.role === 'owner' && changingAccess) throw new PeopleError('The school owner cannot be deactivated', 409)
  if (member.user_id === context.userId && changingAccess) throw new PeopleError('You cannot deactivate yourself', 409)
  if ((member.role === 'admin' || member.role === 'owner') && context.membership.role !== 'owner' && member.user_id !== context.userId) {
    throw new PeopleError('Only the school owner can change other administrators', 403)
  }
}

/**
 * Edits a person: { isActive } to deactivate or reactivate, or profile fields
 * (name, email before activation, grade and guardian for students, subjects
 * and grades for teachers).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const context = guard.context
    const { supabase, membership, userId, userName } = context
    const { memberId } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const member = await findSchoolMember(supabase, membership.school.id, memberId)
    if (!member) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

    const { isActive, ...fields } = body as Record<string, unknown>
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'Say whether the person should be active' }, { status: 400 })
    }
    assertCanManage(context, member, { changingAccess: isActive !== undefined })

    let link
    if (Object.keys(fields).length > 0) {
      const pageRole: SchoolPersonRole = member.role === 'owner' ? 'admin' : (member.role as SchoolPersonRole)
      const checked = validatePersonUpdate(pageRole, fields, membership.school.grade_levels ?? [])
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
      const result = await updateSchoolPerson(
        { supabase, school: membership.school, actor: { id: userId, name: userName }, origin: appOrigin(request) },
        member,
        checked.value,
      )
      link = result.link
    }
    if (typeof isActive === 'boolean' && isActive !== member.is_active) {
      await setMemberActive(supabase, membership.school.id, member, isActive)
    }
    return NextResponse.json({ ok: true, link })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to update this person', 'PATCH /api/schools/current/people/[memberId]')
    return NextResponse.json(body, { status })
  }
}
