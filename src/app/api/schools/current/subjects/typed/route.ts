import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { peopleErrorResponse } from '@/lib/school-people.server'
import { mapTypedSubject, typedSubjects } from '@/lib/school-subjects.server'

/** Subjects typed on lessons, timetables and teachers that aren't on the list yet. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    return NextResponse.json({ typed: await typedSubjects(guard.context.supabase, guard.context.membership.school.id) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load typed subjects', 'GET /api/schools/current/subjects/typed')
    return NextResponse.json(body, { status })
  }
}

/** Points typed subjects at listed ones: { matches: [{ text, subjectId }] }. */
export async function POST(request: Request) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const body = await request.json().catch(() => null)
    const matches = Array.isArray(body?.matches) ? body.matches.slice(0, 100) : []
    if (matches.length === 0) return NextResponse.json({ error: 'Pick at least one subject to match' }, { status: 400 })
    for (const m of matches) await mapTypedSubject(guard.context.supabase, guard.context.membership.school.id, m?.text, m?.subjectId)
    return NextResponse.json({ ok: true, matched: matches.length })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to match subjects', 'POST /api/schools/current/subjects/typed')
    return NextResponse.json(body, { status })
  }
}
