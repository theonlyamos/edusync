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

type PublishedObjective = { id: string; text: string; position: number; artifactIds: string[] };
type Published = { title: string; subject: string; gradeLevel: string; content: string | null; objectives: PublishedObjective[] };

/** Reads the objectives out of a publication snapshot, in order. Null when the snapshot can't be used. */
export function publishedObjectives(value: unknown): PublishedObjective[] | null {
  if (!Array.isArray(value)) return null;
  const out: PublishedObjective[] = [];
  for (const item of value) {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (typeof raw.id !== 'string' || !text) return null;
    out.push({
      id: raw.id,
      text,
      position: Number(raw.position) || 0,
      artifactIds: Array.isArray(raw.artifactIds) ? raw.artifactIds.filter((id): id is string => typeof id === 'string') : [],
    });
  }
  return out.sort((a, b) => a.position - b.position);
}

type Summary = { title: string; subject: string; gradeLevel: string; objectives: string[]; publishedAt: string | null };

/** Title, subject and objectives of each publication, without the lesson bodies. */
async function publishedSummaries(supabase: ServiceSupabase, publicationIds: string[]): Promise<Map<string, Summary>> {
  const out = new Map<string, Summary>();
  for (let i = 0; i < publicationIds.length; i += 100) {
    const { data, error } = await supabase
      .from('lesson_publications')
      .select('id, published_at, title:manifest->lesson->>title, subject:manifest->lesson->>subject, gradeLevel:manifest->lesson->>gradeLevel, objectives:manifest->objectives')
      .in('id', publicationIds.slice(i, i + 100));
    if (error) throw error;
    for (const row of (data ?? []) as unknown as { id: string; published_at: string | null; title: string | null; subject: string | null; gradeLevel: string | null; objectives: unknown }[]) {
      const objectives = publishedObjectives(row.objectives);
      if (!row.title || !objectives) continue;
      out.set(row.id, { title: row.title, subject: row.subject ?? '', gradeLevel: row.gradeLevel ?? '', objectives: objectives.map((objective) => objective.text), publishedAt: row.published_at });
    }
  }
  return out;
}

/** The full published snapshot of one lesson. */
async function publishedLesson(supabase: ServiceSupabase, publicationId: string, lessonId: string): Promise<Published | null> {
  const { data, error } = await supabase.from('lesson_publications').select('manifest').eq('id', publicationId).eq('lesson_id', lessonId).maybeSingle();
  if (error) throw error;
  const manifest = (data?.manifest ?? null) as { lesson?: Record<string, unknown>; objectives?: unknown } | null;
  const objectives = publishedObjectives(manifest?.objectives);
  const lesson = manifest?.lesson;
  if (!lesson || typeof lesson.title !== 'string' || !objectives) return null;
  return { title: lesson.title, subject: String(lesson.subject ?? ''), gradeLevel: String(lesson.gradeLevel ?? ''), content: typeof lesson.content === 'string' ? lesson.content : null, objectives };
}

/** Published lessons by the other teachers at this school, newest first. */
export async function listLibraryLessons(supabase: ServiceSupabase, schoolId: string, userId: string): Promise<LibraryLesson[]> {
  const mine = await teacherRecordId(supabase, userId);
  let query = supabase
    .from('lessons')
    .select('id, teacher_id, current_publication_id, updated_at')
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
  const published = await publishedSummaries(supabase, rows.map((row) => row.current_publication_id as string));
  return rows.flatMap((row) => {
    // What colleagues see is what was published, not edits the author hasn't published yet.
    const snapshot = published.get(row.current_publication_id as string);
    if (!snapshot) return [];
    return [{
      id: row.id as string,
      title: snapshot.title,
      subject: snapshot.subject,
      gradeLevel: snapshot.gradeLevel,
      teacherName: names.get(row.teacher_id as string) ?? 'A teacher',
      objectives: snapshot.objectives,
      updatedAt: snapshot.publishedAt,
    }];
  });
}

export type LessonCopy = { id: string; title: string; copiedActivities: number; skippedMedia: number };

const copyTitle = (title: string) => {
  const suffix = ' (copy)';
  return `${title.trim().slice(0, TITLE_MAX - suffix.length)}${suffix}`;
};

const ARTIFACT_FIELDS = 'id, objective_id, series_id, version, objective_revision, kind, position, payload, source, validation_report';
type ArtifactRow = { id: string; objective_id: string | null; series_id: string; version: number; objective_revision: number; kind: string; position: number; payload: unknown; source: unknown; validation_report: unknown };
type CopyPlan = {
  title: string;
  subject: string;
  gradeLevel: string;
  content: string | null;
  notes: unknown;
  objectives: { text: string; notes: unknown; artifacts: ArtifactRow[] }[];
  /** Images and uploads that belong to the lesson but can't be copied. */
  media: number;
};

type SourceLesson = { id: string; title: string; subject: string; gradelevel: string; objectives: unknown; content: string | null; visual_instructions: unknown; current_publication_id: string | null };

/** A colleague's lesson exactly as they last published it: later edits they haven't published stay theirs. */
async function planFromPublication(supabase: ServiceSupabase, source: SourceLesson): Promise<CopyPlan> {
  const published = source.current_publication_id ? await publishedLesson(supabase, source.current_publication_id, source.id) : null;
  if (!published) throw new LessonLibraryError('This lesson needs to be published again before it can be copied', 409);
  const ids = [...new Set(published.objectives.flatMap((objective) => objective.artifactIds))];
  const byId = new Map<string, ArtifactRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('lesson_artifacts').select(ARTIFACT_FIELDS).eq('lesson_id', source.id).in('id', ids.slice(i, i + 100));
    if (error) throw error;
    for (const row of (data ?? []) as ArtifactRow[]) byId.set(row.id, row);
  }
  let media = 0;
  const objectives = published.objectives.map((objective) => {
    const rows = objective.artifactIds.map((id) => byId.get(id)).filter((row): row is ArtifactRow => Boolean(row));
    media += rows.filter((row) => !COPYABLE_KINDS.includes(row.kind)).length;
    return { text: objective.text, notes: null, artifacts: rows.filter((row) => COPYABLE_KINDS.includes(row.kind)) };
  });
  return { title: published.title, subject: published.subject, gradeLevel: published.gradeLevel, content: published.content, notes: null, objectives, media };
}

/** The teacher's own lesson as it stands now, drafts included. */
async function planFromWorkingCopy(supabase: ServiceSupabase, source: SourceLesson): Promise<CopyPlan> {
  const { data: objectiveRows, error: objectiveError } = await supabase
    .from('lesson_objectives')
    .select('id, text, position, revision, visual_instructions')
    .eq('lesson_id', source.id)
    .is('archived_at', null)
    .order('position');
  if (objectiveError) throw objectiveError;
  const rows = objectiveRows ?? [];
  const base = { title: String(source.title), subject: source.subject, gradeLevel: source.gradelevel, content: source.content, notes: source.visual_instructions };
  if (rows.length === 0) {
    const texts = (Array.isArray(source.objectives) ? (source.objectives as unknown[]).map(String) : []).filter((text) => text.trim());
    return { ...base, objectives: texts.map((text) => ({ text, notes: null, artifacts: [] })), media: 0 };
  }
  const { data: artifacts, error: artifactError } = await supabase
    .from('lesson_artifacts')
    .select(ARTIFACT_FIELDS)
    .eq('lesson_id', source.id)
    .eq('status', 'approved')
    .order('version', { ascending: false })
    .limit(2000);
  if (artifactError) throw artifactError;
  const revisionOf = new Map(rows.map((row) => [row.id as string, Number(row.revision)]));
  const perObjective = new Map<string, ArtifactRow[]>();
  const seen = new Set<string>();
  let media = 0;
  for (const artifact of (artifacts ?? []) as ArtifactRow[]) {
    // Newest approved version of each activity, and only if it still matches its objective's wording.
    if (seen.has(artifact.series_id)) continue;
    seen.add(artifact.series_id);
    const copyable = COPYABLE_KINDS.includes(artifact.kind);
    if (!artifact.objective_id) { if (!copyable) media += 1; continue; }
    if (revisionOf.get(artifact.objective_id) !== Number(artifact.objective_revision)) continue;
    if (!copyable) { media += 1; continue; }
    perObjective.set(artifact.objective_id, [...(perObjective.get(artifact.objective_id) ?? []), artifact]);
  }
  return {
    ...base,
    objectives: rows.map((row) => ({ text: String(row.text), notes: row.visual_instructions, artifacts: perObjective.get(row.id as string) ?? [] })),
    media,
  };
}

/**
 * Makes the caller their own draft of a lesson from their school, with its
 * objectives and its visuals and quizzes. A colleague's lesson is copied as it
 * was last published; a teacher's own lesson is copied as it stands now.
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

  const plan = own ? await planFromWorkingCopy(supabase, source as SourceLesson) : await planFromPublication(supabase, source as SourceLesson);
  if (plan.objectives.length === 0) throw new LessonLibraryError('This lesson has no objectives to copy', 409);

  const title = copyTitle(plan.title);
  const { data: newId, error: createError } = await supabase.rpc('create_lesson_draft', {
    p_title: title,
    p_subject: plan.subject,
    p_grade_level: plan.gradeLevel,
    p_content: plan.content,
    p_objectives: plan.objectives.map((objective) => objective.text),
    p_organization_id: viewer.schoolId,
    p_owner_user_id: viewer.userId,
  });
  if (createError || typeof newId !== 'string') throw createError ?? new Error('No lesson id returned');

  try {
    if (plan.notes) {
      const { error: notesError } = await supabase.from('lessons').update({ visual_instructions: plan.notes }).eq('id', newId);
      if (notesError) throw notesError;
    }
    const { data: created, error: createdError } = await supabase.from('lesson_objectives').select('id, position, revision').eq('lesson_id', newId).order('position');
    if (createdError) throw createdError;
    const now = new Date().toISOString();
    const copies: Record<string, unknown>[] = [];
    // The draft's objectives are in the same order as the ones copied.
    for (const [index, objective] of plan.objectives.entries()) {
      const twin = created?.[index];
      if (!twin) continue;
      if (objective.notes) {
        const { error: styleError } = await supabase.from('lesson_objectives').update({ visual_instructions: objective.notes }).eq('id', twin.id);
        if (styleError) throw styleError;
      }
      for (const artifact of objective.artifacts) {
        copies.push({
          lesson_id: newId,
          objective_id: twin.id,
          series_id: randomUUID(),
          version: 1,
          objective_revision: Number(twin.revision) || 1,
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
    }
    // One statement, so either every activity arrives or none does and the draft can still be removed.
    if (copies.length) {
      const { error: insertError } = await supabase.from('lesson_artifacts').insert(copies);
      if (insertError) throw insertError;
    }
    return { id: newId, title, copiedActivities: copies.length, skippedMedia: plan.media };
  } catch (failure) {
    // Don't leave a half-copied lesson behind.
    const { error: cleanupError } = await supabase.from('lessons').delete().eq('id', newId);
    if (cleanupError) console.error('Could not remove a half-copied lesson:', cleanupError);
    throw failure;
  }
}
