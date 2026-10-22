import 'server-only';

import { createServerSupabase } from '@/lib/supabase.server';
import { LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { requireLessonViewer } from '@/lib/lesson-artifacts/lesson-read-server';
import type { LessonResourceRow } from '@/lib/lesson-resources';

const RESOURCE_COLUMNS = 'id,lesson_id,kind,title,description,url,storage_path,filename,mime_type,byte_size,created_at';

async function loadResource(resourceId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) throw new LessonArtifactHttpError(404, 'Resource not found');
  const db = createServerSupabase();
  const { data, error } = await db.from('lesson_resources').select(RESOURCE_COLUMNS).eq('id', resourceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new LessonArtifactHttpError(404, 'Resource not found');
  return { db, row: data as LessonResourceRow };
}

/** The lesson's teacher (or an admin) only. Writes use the service client, so this is the gate. */
export async function requireResourceManager(resourceId: string) {
  const { db, row } = await loadResource(resourceId);
  const access = await requireLessonManager(row.lesson_id);
  return { ...access, db, row };
}

/** Anyone who may open the lesson: its teacher, an admin, or a student in its school and grade. */
export async function requireResourceViewer(resourceId: string) {
  const { db, row } = await loadResource(resourceId);
  const access = await requireLessonViewer(row.lesson_id);
  return { ...access, db, row };
}

export { RESOURCE_COLUMNS };
