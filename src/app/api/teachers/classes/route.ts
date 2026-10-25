import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServerSupabase } from '@/lib/supabase.server'
import { getUserSchoolId } from '@/lib/school'
import { gradeClasses } from '@/lib/lesson-artifacts/audience.server'

/** The teacher's school's classes in a grade (?grade=), for picking who a live class is for. */
export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.userRole !== 'teacher' && auth.userRole !== 'admin') {
    return NextResponse.json({ error: 'Teacher access required' }, { status: 403 })
  }
  const grade = request.nextUrl.searchParams.get('grade')?.trim().toLowerCase()
  if (!grade) return NextResponse.json({ classes: [] })
  try {
    const supabase = createServerSupabase()
    const schoolId = await getUserSchoolId(supabase, auth.userId)
    if (!schoolId) return NextResponse.json({ classes: [] })
    return NextResponse.json({ classes: await gradeClasses(supabase, schoolId, grade) })
  } catch (error) {
    console.error('GET /api/teachers/classes', error)
    return NextResponse.json({ error: 'Failed to load classes' }, { status: 500 })
  }
}
