import type { SupabaseClient } from '@supabase/supabase-js';

import { LessonArtifactHttpError } from './server';

export type LessonRemovalResult = 'deleted' | 'archived';

type StorageObject = { storage_bucket: string | null; storage_path: string | null };

function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
}

/** Groups storage paths by bucket so each bucket needs one remove call. */
export function groupStorageObjects(objects: StorageObject[]) {
  const byBucket = new Map<string, string[]>();
  for (const { storage_bucket: bucket, storage_path: path } of objects) {
    if (!bucket || !path) continue;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }
  return byBucket;
}

export async function setLessonArchived(supabase: SupabaseClient, lessonId: string, archived: boolean) {
  const { error } = await supabase
    .from('lessons')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', lessonId);
  if (error) throw error;
}

/**
 * Deletes a draft that students never received. A lesson with a publication,
 * homework or student runs is archived instead so that history stays intact.
 * The caller must already have checked that the user manages this lesson.
 */
export async function removeLesson(supabase: SupabaseClient, lessonId: string): Promise<LessonRemovalResult> {
  const { data, error } = await supabase.rpc('delete_lesson_draft', { p_lesson_id: lessonId });
  if (error) {
    const message = errorMessage(error);
    if (message.includes('LESSON_HAS_HISTORY')) {
      await setLessonArchived(supabase, lessonId, true);
      return 'archived';
    }
    if (message.includes('LESSON_GENERATING')) {
      throw new LessonArtifactHttpError(409, 'Materials are still generating for this lesson. Try again when they finish.');
    }
    if (message.includes('LESSON_NOT_FOUND')) throw new LessonArtifactHttpError(404, 'Lesson not found');
    throw error;
  }

  // The rows are gone; a leftover file must not turn a successful delete into an error.
  for (const [bucket, paths] of groupStorageObjects((data ?? []) as StorageObject[])) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) console.error('Could not remove lesson files from storage:', storageError);
  }
  return 'deleted';
}
