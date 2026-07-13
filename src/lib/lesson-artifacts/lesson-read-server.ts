import 'server-only';

import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

import { canManageLesson } from './access';
import { LessonArtifactHttpError } from './server';

export async function requireLessonViewer(lessonId: string) {
  const session = await getServerSession();
  if (!session?.user?.id) throw new LessonArtifactHttpError(401, 'Authentication required');

  const supabase = createServerSupabase();
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id,gradelevel,teacher_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) throw lessonError;
  if (!lesson) throw new LessonArtifactHttpError(404, 'Lesson not found');

  if (session.user.role === 'student') {
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('grade')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (studentError) throw studentError;
    const lessonGrade = lesson.gradelevel?.trim().toLowerCase();
    const studentGrade = student?.grade?.trim().toLowerCase();
    if (!lessonGrade || !studentGrade || lessonGrade !== studentGrade) {
      throw new LessonArtifactHttpError(403, 'This lesson is not assigned to your grade');
    }
    return { session, supabase, lesson };
  }

  let normalizedTeacherUserId: string | null = null;
  if (lesson.teacher_id) {
    const { data: teacher, error: teacherError } = await supabase
      .from('teachers')
      .select('user_id')
      .eq('id', lesson.teacher_id)
      .maybeSingle();
    if (teacherError) throw teacherError;
    normalizedTeacherUserId = teacher?.user_id ?? null;
  }
  if (!canManageLesson({ user: session.user, lesson, normalizedTeacherUserId })) {
    throw new LessonArtifactHttpError(403, 'Not authorized to view this lesson');
  }
  return { session, supabase, lesson };
}
