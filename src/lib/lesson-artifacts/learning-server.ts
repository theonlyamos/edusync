import 'server-only';

import { randomUUID } from 'node:crypto';

import { generateAICompletion } from '@/lib/ai';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { runVisualizeGeneration } from '@/lib/visualize-ai-task';

import { toStudentSafeArtifact, type LessonArtifactRecord } from './domain';
import { parseLearningFallbackLimit } from './fallback-policy';
import { generateArtifactPayload, type ContentJobRecord } from './jobs';
import { embedGroundingText } from './media-provider';
import { consumedArtifactIdsFromEvents, selectNextPublishedArtifact, type LearningArtifactKind } from './resolver';
import { LessonArtifactHttpError, mapArtifactRow } from './server';

export async function requireStudentSession() {
  const session = await getServerSession();
  if (!session?.user?.id || session.user.role !== 'student') {
    throw new LessonArtifactHttpError(401, 'Student access required');
  }
  return session;
}

export async function requireOwnedLearningRun(runId: string) {
  const session = await requireStudentSession();
  const supabase = createServerSupabase();
  const { data: run, error } = await supabase
    .from('learning_runs')
    .select('*')
    .eq('id', runId)
    .eq('student_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!run) throw new LessonArtifactHttpError(404, 'Learning run not found');
  return { session, supabase, run };
}

export async function generateSessionArtifact(input: {
  runId: string;
  lesson: { id: string; title: string; subject: string; gradeLevel: string };
  objective: { id: string; text: string; revision: number };
  studentId: string;
  kind: 'visualization' | 'quiz';
}) {
  const instanceId = randomUUID();
  const job: ContentJobRecord = {
    id: `session:${instanceId}`,
    lessonId: input.lesson.id,
    objectiveId: input.objective.id,
    requestedBy: input.studentId,
    jobType: input.kind === 'quiz' ? 'generate_structured_quiz' : 'generate_interactive',
    attemptCount: 1,
    maxAttempts: 1,
    input: {
      lessonTitle: input.lesson.title,
      subject: input.lesson.subject,
      gradeLevel: input.lesson.gradeLevel,
      objectiveText: input.objective.text,
      objectiveRevision: input.objective.revision,
      position: 999,
    },
  };
  const payload = await generateArtifactPayload(job, {
    visualize: (taskDescription) => runVisualizeGeneration({
      task_description: taskDescription,
      panel_dimensions: { width: 704, height: 504 },
      theme: 'light',
    }),
    generateText: async (systemPrompt, userPrompt) => {
      const result = await generateAICompletion(systemPrompt, userPrompt, undefined, true, 0.4);
      if (!result) throw new Error('The text model returned an empty response');
      return result;
    },
    generateImage: async () => { throw new Error('Session visual fallback uses an interactive'); },
  });
  const record: LessonArtifactRecord = {
    id: instanceId,
    lessonId: input.lesson.id,
    objectiveId: input.objective.id,
    seriesId: instanceId,
    version: 1,
    objectiveRevision: input.objective.revision,
    kind: payload.kind,
    status: 'approved',
    position: 999,
    payload,
    source: 'ai_generated',
  };
  return { instanceId, fullArtifact: record, studentArtifact: toStudentSafeArtifact(record) };
}

export async function resolveNextLearningArtifact(input: {
  runId: string;
  kind: LearningArtifactKind;
  requestId: string;
}) {
  const { session, supabase, run } = await requireOwnedLearningRun(input.runId);
  const { data: existing } = await supabase.from('learning_events').select('payload').eq('run_id', run.id).eq('request_id', input.requestId).maybeSingle();
  if (existing) return existing.payload;

  const { data: publication, error: publicationError } = await supabase.from('lesson_publications').select('manifest').eq('id', run.publication_id).single();
  if (publicationError) throw publicationError;
  const objective = publication.manifest?.objectives?.find((item: any) => item.id === run.active_objective_id);
  if (!objective) throw new LessonArtifactHttpError(409, 'Select an active objective first');
  const artifactIds: string[] = objective.artifactIds ?? [];
  const [{ data: artifactRows, error: artifactError }, { data: eventRows, error: eventError }] = await Promise.all([
    artifactIds.length
      ? supabase.from('lesson_artifacts').select('*').in('id', artifactIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('learning_events').select('artifact_id,event_type').eq('student_id', session.user.id).eq('objective_id', objective.id).in('event_type', ['artifact_rendered', 'quiz_submitted', 'visual_quiz_completed']),
  ]);
  if (artifactError) throw artifactError;
  if (eventError) throw eventError;
  const artifacts = (artifactRows ?? []).map(mapArtifactRow);
  const consumed = consumedArtifactIdsFromEvents((eventRows ?? []).map((event: any) => ({ artifactId: event.artifact_id, eventType: event.event_type })));
  const selected = selectNextPublishedArtifact({ artifacts, publishedArtifactIds: new Set(artifactIds), consumedArtifactIds: consumed, kind: input.kind });
  let instanceId = randomUUID();
  let artifactId: string | null = null;
  let source: 'teacher_approved' | 'session_generated' = 'teacher_approved';
  let studentArtifact;

  if (selected) {
    artifactId = selected.id;
    studentArtifact = toStudentSafeArtifact(selected);
  } else {
    const { data: lessonScope, error: lessonScopeError } = await supabase
      .from('lessons')
      .select('organization_id')
      .eq('id', run.lesson_id)
      .single();
    if (lessonScopeError) throw lessonScopeError;
    const { error: reservationError } = await supabase.rpc('reserve_learning_fallback', {
      p_run_id: run.id,
      p_student_id: session.user.id,
      p_objective_id: objective.id,
      p_request_id: input.requestId,
      p_limit: parseLearningFallbackLimit(process.env.STUDENT_FALLBACK_PER_OBJECTIVE_LIMIT),
      p_organization_id: lessonScope.organization_id,
    });
    if (reservationError?.message.includes('LEARNING_FALLBACK_LIMIT_EXCEEDED')) {
      throw new LessonArtifactHttpError(429, 'You have used the generated-content allowance for this objective');
    }
    if (reservationError?.message.includes('STUDENT_FALLBACK_DISABLED')) {
      throw new LessonArtifactHttpError(403, 'Your organization has disabled student-generated fallback content');
    }
    if (reservationError) throw reservationError;
    source = 'session_generated';
    const generated = await generateSessionArtifact({
      runId: run.id,
      lesson: publication.manifest.lesson,
      objective,
      studentId: session.user.id,
      kind: input.kind,
    });
    instanceId = generated.instanceId;
    studentArtifact = generated.studentArtifact;
    if (generated.fullArtifact.payload.kind === 'structured_quiz') {
      const { error: keyError } = await supabase.from('learning_quiz_keys').insert({
        instance_id: instanceId, run_id: run.id, payload: generated.fullArtifact.payload,
      });
      if (keyError) throw keyError;
    }
  }

  const response = { instanceId, source, artifact: studentArtifact, exhausted: !selected };
  const { error: insertError } = await supabase.from('learning_events').insert({
    run_id: run.id, student_id: session.user.id, lesson_id: run.lesson_id,
    objective_id: objective.id, objective_revision: objective.revision,
    artifact_id: artifactId, instance_id: instanceId, event_type: 'artifact_resolved',
    source, request_id: input.requestId, payload: response,
  });
  if (insertError) throw insertError;
  return response;
}

export async function retrieveLearningGrounding(runId: string, query: string) {
  const { supabase, run } = await requireOwnedLearningRun(runId);
  const { data: publication, error: publicationError } = await supabase.from('lesson_publications').select('manifest').eq('id', run.publication_id).single();
  if (publicationError) throw publicationError;
  const objective = publication.manifest?.objectives?.find((item: any) => item.id === run.active_objective_id);
  if (!objective) return [];
  const artifactIds: string[] = objective.artifactIds ?? [];
  if (!artifactIds.length) return [];
  const { data: artifacts, error: artifactError } = await supabase.from('lesson_artifacts').select('payload').in('id', artifactIds).eq('kind', 'uploaded_media').eq('status', 'approved');
  if (artifactError) throw artifactError;
  const assetIds = (artifacts ?? []).map((artifact: any) => artifact.payload?.assetId).filter(Boolean);
  if (!assetIds.length) return [];
  const embedding = await embedGroundingText(query);
  const { data, error } = await supabase.rpc('match_lesson_asset_chunks', {
    p_query_embedding: embedding,
    p_lesson_id: run.lesson_id,
    p_objective_id: objective.id,
    p_asset_ids: assetIds,
    p_match_count: 5,
  });
  if (error) throw error;
  return data ?? [];
}
