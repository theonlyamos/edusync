import { createServerSupabase } from '@/lib/supabase.server';
import { LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';

export const LESSON_CONTENT_TYPES = ['quiz', 'worksheet', 'explanation', 'summary'] as const;

/**
 * Loads one lesson_content row and checks the caller may manage its lesson.
 * Writes then use the service client, so this check is the only gate: keep it.
 */
export async function requireContentManager(contentId: string, type?: 'resource' | 'content') {
  const db = createServerSupabase();
  const { data: row, error } = await db.from('lesson_content').select('*').eq('id', contentId).maybeSingle();
  if (error) throw error;
  const isResource = row?.type === 'resource';
  if (!row || (type === 'resource' && !isResource) || (type === 'content' && isResource)) {
    throw new LessonArtifactHttpError(404, type === 'resource' ? 'Resource not found' : 'Content not found');
  }
  const access = await requireLessonManager(row.lesson_id);
  return { ...access, db, row };
}
