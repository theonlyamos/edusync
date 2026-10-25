import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { addClassTeachers, removeClassTeachers } from '@/lib/school-classes.server'
import { peopleErrorResponse } from '@/lib/school-people.server'

const MAX = 500
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

/** Adds or removes teachers: { add?: userIds, remove?: userIds }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const { classId } = await params
    const body = await request.json().catch(() => null)
    const add = ids(body?.add)
    const remove = ids(body?.remove)
    if (add.length + remove.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
    if (add.length + remove.length > MAX) return NextResponse.json({ error: `Pick at most ${MAX} people at once` }, { status: 400 })
    if (remove.length) await removeClassTeachers(supabase, membership.school.id, classId, remove)
    const result = add.length ? await addClassTeachers(supabase, membership.school.id, classId, add) : undefined
    return NextResponse.json({ ok: true, ...(result ?? {}) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to update the class', 'POST /api/schools/current/classes/[classId]/teachers')
    return NextResponse.json(body, { status })
  }
}
