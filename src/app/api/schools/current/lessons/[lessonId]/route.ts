import { NextRequest, NextResponse } from 'next/server'
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { setLessonArchived } from '@/lib/lesson-artifacts/lesson-lifecycle'
import { findSchoolLesson } from '@/lib/school-lessons.server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Archives a school lesson (hiding it from students) or restores it: { archived }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership } = guard.context
    const { lessonId } = await params
    const body = await request.json().catch(() => null)
    if (typeof body?.archived !== 'boolean') return NextResponse.json({ error: 'Say whether to archive or restore' }, { status: 400 })
    if (!UUID.test(lessonId)) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    const lesson = await findSchoolLesson(supabase, membership.school.id, lessonId)
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    await setLessonArchived(supabase, lessonId, body.archived)
    return NextResponse.json({ archived: body.archived })
  } catch (error) {
    console.error('Error in PATCH /api/schools/current/lessons/[lessonId]:', error)
    return NextResponse.json({ error: 'Failed to update the lesson' }, { status: 500 })
  }
}
