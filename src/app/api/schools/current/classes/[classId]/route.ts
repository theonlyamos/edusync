import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { normalizeRoom, parseClassNames } from '@/lib/school-classes'
import { deleteSchoolClass, getSchoolClass, updateSchoolClass } from '@/lib/school-classes.server'
import { peopleErrorResponse } from '@/lib/school-people.server'

type Params = { params: Promise<{ classId: string }> }

/** One class with its students and teachers. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { classId } = await params
    return NextResponse.json({ class: await getSchoolClass(guard.context.supabase, guard.context.membership.school.id, classId) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load the class', 'GET /api/schools/current/classes/[classId]')
    return NextResponse.json(body, { status })
  }
}

/** Renames a class or changes its room or class teacher: { name?, room?, classTeacherId? }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { classId } = await params
    const body = await request.json().catch(() => null)
    const update: { name?: string; room?: string | null; classTeacherId?: unknown } = {}
    if (body?.name !== undefined) {
      const parsed = parseClassNames(body.name)
      if (!parsed.ok || parsed.names.length !== 1) return NextResponse.json({ error: parsed.ok ? 'Give one name' : parsed.error }, { status: 400 })
      update.name = parsed.names[0]
    }
    if (body?.room !== undefined) {
      const room = normalizeRoom(body.room)
      if (room === 'invalid') return NextResponse.json({ error: 'Keep the room under 60 characters' }, { status: 400 })
      update.room = room
    }
    if (body?.classTeacherId !== undefined) update.classTeacherId = body.classTeacherId
    await updateSchoolClass(guard.context.supabase, guard.context.membership.school.id, classId, update)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to update the class', 'PATCH /api/schools/current/classes/[classId]')
    return NextResponse.json(body, { status })
  }
}

/** Deletes a class. Its students stay in their grade. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { classId } = await params
    await deleteSchoolClass(guard.context.supabase, guard.context.membership.school.id, classId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to delete the class', 'DELETE /api/schools/current/classes/[classId]')
    return NextResponse.json(body, { status })
  }
}
