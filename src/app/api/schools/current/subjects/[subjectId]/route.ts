import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { peopleErrorResponse } from '@/lib/school-people.server'
import { validateSubject } from '@/lib/school-subjects'
import { deleteSubject, updateSubject } from '@/lib/school-subjects.server'

type Params = { params: Promise<{ subjectId: string }> }

/** Edits a subject: { name?, code?, color?, grades?, archived? }. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const { subjectId } = await params
    const body = await request.json().catch(() => null)
    const parsed = validateSubject(body ?? {}, membership.school.grade_levels ?? [], false)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const archived = typeof body?.archived === 'boolean' ? body.archived : undefined
    await updateSubject(supabase, membership.school.id, subjectId, { ...parsed.value, archived })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to save the subject', 'PATCH /api/schools/current/subjects/[subjectId]')
    return NextResponse.json(body, { status })
  }
}

/** Deletes a subject no lesson uses. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { subjectId } = await params
    await deleteSubject(guard.context.supabase, guard.context.membership.school.id, subjectId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to delete the subject', 'DELETE /api/schools/current/subjects/[subjectId]')
    return NextResponse.json(body, { status })
  }
}
