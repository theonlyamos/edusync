import { NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { peopleErrorResponse } from '@/lib/school-people.server'
import { validateSubject } from '@/lib/school-subjects'
import { createSubjects, listSubjects, standardSubjects } from '@/lib/school-subjects.server'

/** The school's subjects, archived ones included, with how many lessons use each. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const subjects = await listSubjects(supabase, membership.school.id, { includeArchived: true })
    const { data, error } = await supabase.from('lessons').select('subject_id').eq('organization_id', membership.school.id).not('subject_id', 'is', null).is('archived_at', null).limit(20000)
    if (error) throw error
    const lessons = new Map<string, number>()
    for (const l of data ?? []) lessons.set(l.subject_id as string, (lessons.get(l.subject_id as string) ?? 0) + 1)
    return NextResponse.json({ subjects: subjects.map((s) => ({ ...s, lessonCount: lessons.get(s.id) ?? 0 })) })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load subjects', 'GET /api/schools/current/subjects')
    return NextResponse.json(body, { status })
  }
}

/** Adds a subject { name, code?, color?, grades? }, or the standard list with { standard: true }. */
export async function POST(request: Request) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const body = await request.json().catch(() => null)
    if (body?.standard === true) {
      const added = await createSubjects(supabase, membership.school, standardSubjects())
      return NextResponse.json({ added }, { status: 201 })
    }
    const parsed = validateSubject(body ?? {}, membership.school.grade_levels ?? [], true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const added = await createSubjects(supabase, membership.school, [parsed.value])
    return NextResponse.json({ added }, { status: 201 })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to add the subject', 'POST /api/schools/current/subjects')
    return NextResponse.json(body, { status })
  }
}
