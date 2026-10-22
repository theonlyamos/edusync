import { NextRequest, NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { parsePersonRole, validateNewPerson } from '@/lib/school-people'
import { createSchoolPerson, listSchoolPeople, peopleErrorResponse } from '@/lib/school-people.server'
import { isEmailConfigured } from '@/lib/email'

/** Everyone in the school with one role: ?role=student|teacher|admin. School managers only. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const role = parsePersonRole(request.nextUrl.searchParams.get('role'))
    if (!role) return NextResponse.json({ error: 'Say which people to list: student, teacher or admin' }, { status: 400 })
    const { supabase, membership, userId } = guard.context
    const people = await listSchoolPeople(supabase, membership.school.id, role)
    return NextResponse.json({
      people,
      gradeLevels: membership.school.grade_levels ?? [],
      emailConfigured: isEmailConfigured(),
      viewer: { userId, role: membership.role },
    })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load people', 'GET /api/schools/current/people')
    return NextResponse.json(body, { status })
  }
}

/** Creates one account in the school and sends its activation link. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership, userId, userName } = guard.context
    const body = await request.json().catch(() => null)
    const role = parsePersonRole(body?.role)
    if (!role) return NextResponse.json({ error: 'Role must be student, teacher or admin' }, { status: 400 })
    if (role === 'admin' && membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the school owner can add administrators' }, { status: 403 })
    }
    const checked = validateNewPerson(role, body ?? {}, membership.school.grade_levels ?? [])
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

    const created = await createSchoolPerson(
      { supabase, school: membership.school, actor: { id: userId, name: userName }, origin: appOrigin(request) },
      checked.value,
    )
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to add this person', 'POST /api/schools/current/people')
    return NextResponse.json(body, { status })
  }
}
