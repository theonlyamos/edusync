import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { structuredQuizPayloadSchema } from './domain';
import { LessonArtifactHttpError } from './server';

export const quizEditSchema = z.object({ payload: structuredQuizPayloadSchema });

type QuizArtifactRow = {
  id: string; lesson_id: string; objective_id: string | null; series_id: string; kind: string; position: number;
  generation_metadata?: Record<string, unknown> | null;
};

const UNIQUE_VIOLATION = '23505';

/**
 * Saves a teacher's hand edits to a knowledge check as a new draft version
 * in the same series. Approved versions are never changed, and no AI runs.
 */
export async function saveTeacherQuizEdit(supabase: SupabaseClient, input: {
  artifact: QuizArtifactRow;
  payload: z.infer<typeof structuredQuizPayloadSchema>;
  userId: string;
}) {
  const { artifact } = input;
  if (artifact.kind !== 'structured_quiz') throw new LessonArtifactHttpError(400, 'Only knowledge checks can be edited by hand');
  if (!artifact.objective_id) throw new LessonArtifactHttpError(400, 'This quiz is not linked to an objective');

  const { data: objective, error: objectiveError } = await supabase.from('lesson_objectives')
    .select('revision,archived_at').eq('id', artifact.objective_id).eq('lesson_id', artifact.lesson_id).maybeSingle();
  if (objectiveError) throw objectiveError;
  if (!objective || objective.archived_at) throw new LessonArtifactHttpError(409, 'Objective is no longer active');

  // Two saves at once can pick the same version number; the loser retries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latest, error: latestError } = await supabase.from('lesson_artifacts')
      .select('id,version').eq('series_id', artifact.series_id).order('version', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    const { data, error } = await supabase.from('lesson_artifacts').insert({
      lesson_id: artifact.lesson_id,
      objective_id: artifact.objective_id,
      series_id: artifact.series_id,
      version: (latest?.version ?? 0) + 1,
      // The teacher wrote this version against the current directions.
      objective_revision: objective.revision,
      supersedes_id: latest?.id ?? artifact.id,
      kind: 'structured_quiz',
      status: 'draft',
      position: artifact.position,
      payload: input.payload,
      source: 'teacher_authored',
      validation_report: { status: 'passed', validator: 'schema' },
      generation_metadata: { ...(artifact.generation_metadata ?? {}), editedFrom: artifact.id, editedBy: input.userId },
      created_by: input.userId,
    }).select('*').single();
    if (!error) return data;
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }
  throw new LessonArtifactHttpError(409, 'This quiz changed while you were editing. Reload and try again.');
}
