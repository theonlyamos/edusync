import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { normalizeRoom, parseClassNames } from '@/lib/school-classes'
import { createSchoolClasses, listSchoolClasses } from '@/lib/school-classes.server'
import { normalizeGradeLevel } from '@/lib/school-people'
import { peopleErrorResponse } from '@/lib/school-people.server'

/** The school's classes, optionally for one ?grade=. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const grade = normalizeGradeLevel(request.nextUrl.searchParams.get('grade')) ?? undefined
    return NextResponse.json({ classes: await listSchoolClasses(supabase, membership.school.id, { grade }) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load classes', 'GET /api/schools/current/classes')
    return NextResponse.json(body, { status })
  }
}

/** Adds classes: { grade, names: "A, B, C", room?, classTeacherId? }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const body = await request.json().catch(() => null)
    const grade = normalizeGradeLevel(body?.grade)
    if (!grade) return NextResponse.json({ error: 'Pick a grade' }, { status: 400 })
    const parsed = parseClassNames(body?.names)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const room = normalizeRoom(body?.room)
    if (room === 'invalid') return NextResponse.json({ error: 'Keep the room under 60 characters' }, { status: 400 })
    const ids = await createSchoolClasses(supabase, membership.school, { grade, names: parsed.names, room, classTeacherId: body?.classTeacherId })
    return NextResponse.json({ ids }, { status: 201 })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to add the class', 'POST /api/schools/current/classes')
    return NextResponse.json(body, { status })
  }
}
