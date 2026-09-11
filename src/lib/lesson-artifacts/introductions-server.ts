import 'server-only';

import { randomUUID } from 'node:crypto';
import { createServerSupabase } from '@/lib/supabase.server';
import { toStudentSafeArtifact } from './domain';
import { LessonArtifactHttpError, mapArtifactRow } from './server';

// Return a fresh instance on every objective start, even when this student has seen the diagram.
export async function prepareObjectiveIntroduction(
  supabase: ReturnType<typeof createServerSupabase>,
  run: { id: string; student_id: string; lesson_id: string },
  objective: { id: string; revision: number; introductionArtifactId?: string | null; artifactIds?: string[] },
) {
  if (!objective.introductionArtifactId) return null; // Immutable legacy publications remain readable.
  if (!objective.artifactIds?.includes(objective.introductionArtifactId)) {
    throw new LessonArtifactHttpError(409, 'The objective introduction is missing from this publication');
  }
  const { data: row, error } = await supabase.from('lesson_artifacts').select('*')
    .eq('id', objective.introductionArtifactId).eq('lesson_id', run.lesson_id)
    .eq('objective_id', objective.id).eq('objective_revision', objective.revision)
    .eq('status', 'approved').maybeSingle();
  if (error) throw error;
  if (!row || row.kind !== 'generated_image' || row.payload?.introductionFor !== 'objective') {
    throw new LessonArtifactHttpError(409, 'The approved objective introduction is unavailable');
  }
  const response = { instanceId: randomUUID(), source: 'teacher_approved' as const, artifact: toStudentSafeArtifact(mapArtifactRow(row)), exhausted: false };
  const { error: eventError } = await supabase.from('learning_events').insert({
    run_id: run.id, student_id: run.student_id, lesson_id: run.lesson_id,
    objective_id: objective.id, objective_revision: objective.revision,
    artifact_id: row.id, instance_id: response.instanceId, event_type: 'artifact_resolved',
    source: response.source, payload: response,
  });
  if (eventError) throw eventError;
  return response;
}
