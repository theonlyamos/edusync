import type { SupabaseClient } from '@supabase/supabase-js'

export type ValidateLiveClassLessonResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

/**
 * Validates grade_level (required) and optional lesson_id for live class create/update.
 * Lesson must exist, match grade_level, and (for teachers) belong to the organizer's teacher row.
 */
export async function validateLiveClassGradeAndLesson(
  supabase: SupabaseClient,
  opts: {
    userId: string
    userRole: string | null
    gradeLevel: string | null | undefined
    lessonId: string | null | undefined
  }
): Promise<ValidateLiveClassLessonResult> {
  const { userId, userRole, gradeLevel, lessonId } = opts

  if (gradeLevel == null || typeof gradeLevel !== 'string' || !gradeLevel.trim()) {
    return { ok: false, status: 400, message: 'grade_level is required' }
  }

  const g = gradeLevel.trim()

  if (!lessonId) {
    return { ok: true }
  }

  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('id, teacher_id, gradelevel')
    .eq('id', lessonId)
    .maybeSingle()

  if (error || !lesson) {
    return { ok: false, status: 404, message: 'Lesson not found' }
  }

  const lGrade = lesson.gradelevel as string | null | undefined
  if (lGrade !== g) {
    return { ok: false, status: 400, message: 'Lesson grade does not match grade_level' }
  }

  const isAdmin = userRole === 'admin'
  if (!isAdmin) {
    if (userRole !== 'teacher') {
      return { ok: false, status: 403, message: 'Only teachers or admins can link lessons' }
    }
    const { data: teacher } = await supabase.from('teachers').select('id').eq('user_id', userId).maybeSingle()

    if (!teacher?.id) {
      return { ok: false, status: 403, message: 'Teacher profile not found' }
    }
    if (lesson.teacher_id !== teacher.id) {
      return { ok: false, status: 403, message: 'Lesson does not belong to this teacher' }
    }
  }

  return { ok: true }
}
