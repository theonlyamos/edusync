import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { getUserSchoolId } from '@/lib/school'
import { subjectInGrade } from '@/lib/school-subjects'
import { listAssignments, listSubjects } from '@/lib/school-subjects.server'

/**
 * The teacher's school's subjects (only those taught in ?grade= when given),
 * and what this teacher is assigned to teach.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.userRole !== 'teacher' && auth.userRole !== 'admin') {
    return NextResponse.json({ error: 'Teacher access required' }, { status: 403 })
  }
  try {
    const supabase = createServerSupabase()
    const schoolId = await getUserSchoolId(supabase, auth.userId)
    if (!schoolId) return NextResponse.json({ subjects: [], mine: [] })
    const grade = request.nextUrl.searchParams.get('grade')?.trim().toLowerCase() || null
    const [subjects, assignments, classes] = await Promise.all([
      listSubjects(supabase, schoolId),
      listAssignments(supabase, schoolId),
      supabase.from('school_classes').select('id, name').eq('organization_id', schoolId).limit(2000),
    ])
    if (classes.error) throw classes.error
    const className = new Map((classes.data ?? []).map((c) => [c.id as string, c.name as string]))
    const subjectName = new Map(subjects.map((s) => [s.id, s]))
    const mine = assignments
      .filter((a) => a.teacherId === auth.userId && subjectName.has(a.subjectId))
      .map((a) => ({
        subjectId: a.subjectId,
        subject: subjectName.get(a.subjectId)!.name,
        color: subjectName.get(a.subjectId)!.color,
        grade: a.grade,
        classId: a.classId,
        className: a.classId ? className.get(a.classId) ?? null : null,
      }))
    return NextResponse.json({
      subjects: grade ? subjects.filter((s) => subjectInGrade(s, grade)) : subjects,
      mine,
    })
  } catch (error) {
    console.error('GET /api/teachers/subjects', error)
    return NextResponse.json({ error: 'Failed to load subjects' }, { status: 500 })
  }
}
