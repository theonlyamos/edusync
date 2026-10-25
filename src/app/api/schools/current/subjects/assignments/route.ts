import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { peopleErrorResponse } from '@/lib/school-people.server'
import { listAssignments, setAssignment } from '@/lib/school-subjects.server'

/** Who teaches each subject in each grade and class. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    return NextResponse.json({ assignments: await listAssignments(guard.context.supabase, guard.context.membership.school.id) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load who teaches what', 'GET /api/schools/current/subjects/assignments')
    return NextResponse.json(body, { status })
  }
}

/** Sets who teaches a subject: { subjectId, grade, classId?: null for the whole grade, teacherId: null to clear }. */
export async function PUT(request: Request) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const body = await request.json().catch(() => null)
    await setAssignment(guard.context.supabase, guard.context.membership.school, {
      subjectId: body?.subjectId,
      grade: body?.grade,
      classId: body?.classId ?? null,
      teacherId: body?.teacherId ?? null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to save who teaches this', 'PUT /api/schools/current/subjects/assignments')
    return NextResponse.json(body, { status })
  }
}
