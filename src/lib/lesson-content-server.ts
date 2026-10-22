import { createServerSupabase } from '@/lib/supabase.server';
import { getServerSession } from '@/lib/auth';
import { LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';

export const LESSON_CONTENT_TYPES = ['quiz', 'worksheet', 'explanation', 'summary'] as const;

/**
 * Loads one lesson_content row and checks the caller may manage its lesson.
 * Writes then use the service client, so this check is the only gate: keep it.
 */
export async function requireContentManager(contentId: string) {
  const db = createServerSupabase();
  const { data: row, error } = await db.from('lesson_content').select('*').eq('id', contentId).maybeSingle();
  if (error) throw error;
  if (!row) throw new LessonArtifactHttpError(404, 'Content not found');
  const access = await requireLessonManager(row.lesson_id);
  return { ...access, db, row };
}

/**
 * Lessons the signed-in teacher manages (newest first), for library pages that
 * list content or resources across lessons. Admins get the most recent lessons.
 */
export async function listManagedLessons(limit = 500) {
  const session = await getServerSession();
  if (!session?.user?.id || !['admin', 'teacher'].includes(session.user.role ?? '')) {
    throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
  }
  const db = createServerSupabase();
  let query = db.from('lessons').select('id,title').order('created_at', { ascending: false }).limit(limit);
  if (session.user.role === 'teacher') {
    const { data: teacher, error } = await db.from('teachers').select('id').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!teacher) return { session, db, lessons: [] as { id: string; title: string }[] };
    query = query.eq('teacher_id', teacher.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { session, db, lessons: (data ?? []) as { id: string; title: string }[] };
}

/** Adds the field names older pages read (_id, lessonId, createdAt) to a lesson_content row. */
export function mapLessonContent(row: { id: string; lesson_id: string; created_at: string; [key: string]: unknown }, lessonTitle?: string) {
  return { ...row, _id: row.id, lessonId: row.lesson_id, createdAt: row.created_at, ...(lessonTitle ? { lessonTitle } : {}) };
}
