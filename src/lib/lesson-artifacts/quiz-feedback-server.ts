import 'server-only';

import { requireOwnedLearningRun } from './learning-server';
import { buildQuizTutorFeedback } from './quiz-feedback';
import { LessonArtifactHttpError } from './server';

export async function getQuizTutorFeedback(runId: string, expectedLessonId?: string) {
  const { session, supabase, run } = await requireOwnedLearningRun(runId);
  if (expectedLessonId && run.lesson_id !== expectedLessonId) {
    throw new LessonArtifactHttpError(403, 'Learning run does not belong to this lesson');
  }
  const { data: publication, error: publicationError } = await supabase.from('lesson_publications')
    .select('manifest').eq('id', run.publication_id).eq('lesson_id', run.lesson_id).single();
  if (publicationError) throw publicationError;
  const objectives: { id: string; revision: number; text?: string }[] = publication?.manifest?.objectives ?? [];
  const objective = objectives.find((item) => item.id === run.active_objective_id);
  if (!objective || !Number.isInteger(objective.revision) || objective.revision < 1) {
    throw new LessonArtifactHttpError(409, 'Select an active objective from this publication first');
  }
  const { data: events, error } = await supabase.from('learning_events')
    .select('id,source,payload')
    .eq('run_id', run.id).eq('student_id', session.user.id).eq('lesson_id', run.lesson_id)
    .eq('objective_id', objective.id).eq('objective_revision', objective.revision)
    .eq('event_type', 'quiz_submitted').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(3);
  if (error) throw error;
  return buildQuizTutorFeedback({ runId: run.id, objectiveId: objective.id, objectiveRevision: objective.revision }, events ?? [], objective.text);
}
