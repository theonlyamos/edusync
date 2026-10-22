import { NextRequest, NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { findSchoolMember, peopleErrorResponse, sendAccountLink } from '@/lib/school-people.server'

type Params = { params: Promise<{ memberId: string }> }

/**
 * Emails a fresh link: an activation link for someone who never activated,
 * otherwise a link to set a new password.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership, userId, userName } = guard.context
    const { memberId } = await params
    const member = await findSchoolMember(supabase, membership.school.id, memberId)
    if (!member) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    if ((member.role === 'admin' || member.role === 'owner') && membership.role !== 'owner' && member.user_id !== userId) {
      return NextResponse.json({ error: 'Only the school owner can do this for other administrators' }, { status: 403 })
    }
    const result = await sendAccountLink(
      { supabase, school: membership.school, actor: { id: userId, name: userName }, origin: appOrigin(request) },
      member,
    )
    return NextResponse.json(result)
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to send the link', 'POST /api/schools/current/people/[memberId]/link')
    return NextResponse.json(body, { status })
  }
}
