import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ServiceSupabase } from '@/lib/school-access.server';

/** Artifacts that are plain data and can be copied. Images and uploads point at stored files and are left behind. */
const COPYABLE_KINDS = ['interactive_visualization', 'structured_quiz', 'visual_quiz'];
const LIBRARY_LIMIT = 300;
const TITLE_MAX = 160;

export class LessonLibraryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type LibraryLesson = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  teacherName: string;
  objectives: string[];
  updatedAt: string | null;
};

async function teacherRecordId(supabase: ServiceSupabase, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('teachers').select('id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** Published lessons by the other teachers at this school, newest first. */
export async function listLibraryLessons(supabase: ServiceSupabase, schoolId: string, userId: string): Promise<LibraryLesson[]> {
  const mine = await teacherRecordId(supabase, userId);
  let query = supabase
    .from('lessons')
    .select('id, title, subject, gradelevel, objectives, teacher_id, updated_at')
    .eq('organization_id', schoolId)
    .is('archived_at', null)
    .not('current_publication_id', 'is', null);
  if (mine) query = query.neq('teacher_id', mine);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(LIBRARY_LIMIT);
  if (error) throw error;
  const rows = data ?? [];

  const teacherIds = [...new Set(rows.map((row) => row.teacher_id as string | null).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  for (let i = 0; i < teacherIds.length; i += 100) {
    const { data: teachers, error: teacherError } = await supabase.from('teachers').select('id, users!inner(name)').in('id', teacherIds.slice(i, i + 100));
    if (teacherError) throw teacherError;
    for (const teacher of teachers ?? []) {
      const user = (Array.isArray(teacher.users) ? teacher.users[0] : teacher.users) as { name: string | null } | undefined;
      names.set(teacher.id as string, user?.name || 'A teacher');
    }
  }
  return rows.map((row) => ({
    id: row.id as string,
    title: String(row.title ?? ''),
    subject: String(row.subject ?? ''),
    gradeLevel: String(row.gradelevel ?? ''),
    teacherName: names.get(row.teacher_id as string) ?? 'A teacher',
    objectives: Array.isArray(row.objectives) ? (row.objectives as unknown[]).map(String) : [],
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
}

export type LessonCopy = { id: string; title: string; copiedActivities: number; skippedMedia: number };

const copyTitle = (title: string) => {
  const suffix = ' (copy)';
  return `${title.trim().slice(0, TITLE_MAX - suffix.length)}${suffix}`;
};

/**
 * Makes the caller their own draft of a lesson from their school: the
 * objectives, teaching notes, and the approved visuals and quizzes. A teacher
 * can copy a colleague's published lesson or any lesson of their own.
 */
export async function copyLesson(supabase: ServiceSupabase, viewer: { userId: string; schoolId: string }, lessonId: string): Promise<LessonCopy> {
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) throw new LessonLibraryError('Lesson not found', 404);
  const mine = await teacherRecordId(supabase, viewer.userId);
  if (!mine) throw new LessonLibraryError('Only teachers can copy lessons', 403);

  const { data: source, error } = await supabase
    .from('lessons')
    .select('id, title, subject, gradelevel, objectives, content, teacher_id, visual_instructions, current_publication_id, archived_at')
    .eq('id', lessonId)
    .eq('organization_id', viewer.schoolId)
    .maybeSingle();
  if (error) throw error;
  const own = source?.teacher_id === mine;
  // A colleague's drafts and archived lessons stay private to them.
  if (!source || (!own && (!source.current_publication_id || source.archived_at))) throw new LessonLibraryError('Lesson not found', 404);

  const { data: objectiveRows, error: objectiveError } = await supabase
    .from('lesson_objectives')
    .select('id, text, position, revision, visual_instructions')
    .eq('lesson_id', lessonId)
    .is('archived_at', null)
    .order('position');
  if (objectiveError) throw objectiveError;
  const objectives = objectiveRows ?? [];
  const texts = objectives.length ? objectives.map((row) => String(row.text)) : (Array.isArray(source.objectives) ? (source.objectives as unknown[]).map(String) : []).filter((text) => text.trim());
  if (texts.length === 0) throw new LessonLibraryError('This lesson has no objectives to copy', 409);

  const title = copyTitle(String(source.title));
  const { data: newId, error: createError } = await supabase.rpc('create_lesson_draft', {
    p_title: title,
    p_subject: source.subject,
    p_grade_level: source.gradelevel,
    p_content: source.content,
    p_objectives: texts,
    p_organization_id: viewer.schoolId,
    p_owner_user_id: viewer.userId,
  });
  if (createError || typeof newId !== 'string') throw createError ?? new Error('No lesson id returned');

  try {
    if (source.visual_instructions) {
      const { error: notesError } = await supabase.from('lessons').update({ visual_instructions: source.visual_instructions }).eq('id', newId);
      if (notesError) throw notesError;
    }
    const { data: created, error: createdError } = await supabase.from('lesson_objectives').select('id, position, revision').eq('lesson_id', newId).order('position');
    if (createdError) throw createdError;
    // The draft's objectives are in the same order as the ones copied.
    const twin = new Map<string, { id: string; revision: number }>();
    for (const [index, objective] of objectives.entries()) {
      const match = created?.[index];
      if (!match) continue;
      twin.set(objective.id as string, { id: match.id as string, revision: Number(match.revision) || 1 });
      if (objective.visual_instructions) {
        const { error: styleError } = await supabase.from('lesson_objectives').update({ visual_instructions: objective.visual_instructions }).eq('id', match.id);
        if (styleError) throw styleError;
      }
    }

    const { data: artifacts, error: artifactError } = await supabase
      .from('lesson_artifacts')
      .select('id, objective_id, series_id, version, objective_revision, kind, position, payload, source, validation_report')
      .eq('lesson_id', lessonId)
      .eq('status', 'approved')
      .order('version', { ascending: false })
      .limit(2000);
    if (artifactError) throw artifactError;
    const revisionOf = new Map(objectives.map((row) => [row.id as string, Number(row.revision)]));
    const seen = new Set<string>();
    let skippedMedia = 0;
    const copies: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    for (const artifact of artifacts ?? []) {
      // Newest approved version of each activity, and only if it still matches its objective's wording.
      const series = artifact.series_id as string;
      if (seen.has(series)) continue;
      seen.add(series);
      const target = artifact.objective_id ? twin.get(artifact.objective_id as string) : null;
      if (!target || revisionOf.get(artifact.objective_id as string) !== Number(artifact.objective_revision)) {
        if (!artifact.objective_id && !COPYABLE_KINDS.includes(artifact.kind as string)) skippedMedia += 1;
        continue;
      }
      if (!COPYABLE_KINDS.includes(artifact.kind as string)) { skippedMedia += 1; continue; }
      copies.push({
        lesson_id: newId,
        objective_id: target.id,
        series_id: randomUUID(),
        version: 1,
        objective_revision: target.revision,
        kind: artifact.kind,
        status: 'approved',
        position: artifact.position,
        payload: artifact.payload,
        source: artifact.source,
        validation_report: artifact.validation_report,
        generation_metadata: { copiedFromArtifact: artifact.id, copiedFromLesson: lessonId },
        created_by: viewer.userId,
        approved_by: viewer.userId,
        approved_at: now,
      });
    }
    // One statement, so either every activity arrives or none does and the draft can still be removed.
    if (copies.length) {
      const { error: insertError } = await supabase.from('lesson_artifacts').insert(copies);
      if (insertError) throw insertError;
    }
    return { id: newId, title, copiedActivities: copies.length, skippedMedia };
  } catch (failure) {
    // Don't leave a half-copied lesson behind.
    const { error: cleanupError } = await supabase.from('lessons').delete().eq('id', newId);
    if (cleanupError) console.error('Could not remove a half-copied lesson:', cleanupError);
    throw failure;
  }
}
