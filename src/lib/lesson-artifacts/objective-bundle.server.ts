import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generateAICompletion } from '@/lib/ai';

import { buildDefaultBundleJobs } from './authoring';
import { creativeConceptPrompt, creativeConceptSchema } from './creative-concept';
import { quotaCategoryForJob } from './quota';
import { reserveOrganizationAiUsage } from './quota-server';
import { LessonArtifactHttpError } from './server';

export type BundleLesson = {
  id: string; title: string; subject: string; gradelevel: string;
  organization_id: string | null; visual_instructions?: string | null;
};
export type BundleObjective = { id: string; lesson_id: string; text: string; revision: number; visual_instructions?: string | null };

/** Asks the AI for a teaching concept. Metered like one lesson visual. */
export async function suggestObjectiveConcept(supabase: SupabaseClient, input: {
  userId: string; lesson: BundleLesson; objective: BundleObjective; guidance?: string; previousConcept?: string;
}) {
  const { lesson, objective } = input;
  await reserveOrganizationAiUsage({
    userId: input.userId, organizationId: lesson.organization_id,
    category: 'interactive_generation', quantity: 1, referenceId: `creative-concept:${objective.id}:${randomUUID()}`,
  });
  const generated = await generateAICompletion(
    'You design inventive, accurate and accessible educational experiences. Return only a concise plain-text teaching concept for teacher review.',
    creativeConceptPrompt({
      lessonTitle: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel,
      objectiveText: objective.text, visualInstructions: lesson.visual_instructions,
      objectiveVisualInstructions: objective.visual_instructions, guidance: input.guidance, previousConcept: input.previousConcept,
    }), undefined, false, 0.8,
  );
  const concept = creativeConceptSchema.safeParse(generated);
  if (!concept.success) throw new LessonArtifactHttpError(502, 'The AI returned an invalid concept. Try suggesting again.');
  const { data: current, error } = await supabase.from('lesson_objectives')
    .select('revision,archived_at').eq('id', objective.id).maybeSingle();
  if (error) throw error;
  if (!current || current.archived_at || current.revision !== objective.revision) {
    throw new LessonArtifactHttpError(409, 'The objective changed while generating. Refresh before suggesting a concept.');
  }
  return concept.data;
}

/**
 * Queues the five materials for one objective. Repeating a request with the
 * same idempotency key returns its existing jobs. The caller drains the worker.
 */
export async function enqueueObjectiveBundle(supabase: SupabaseClient, input: {
  userId: string; lesson: BundleLesson; objective: BundleObjective;
  creativeConcept?: string; idempotencyKey?: string; batchId?: string;
}) {
  const { lesson, objective } = input;
  let batchId = input.batchId ?? randomUUID();
  const jobs = buildDefaultBundleJobs({
    lessonId: objective.lesson_id, objectiveId: objective.id, requestedBy: input.userId,
    idempotencyPrefix: input.idempotencyKey ?? batchId,
  });
  const keys = jobs.map((job) => job.idempotencyKey);

  const { data: existing, error: existingError } = await supabase
    .from('content_jobs').select('*').eq('requested_by', input.userId).in('idempotency_key', keys);
  if (existingError) throw existingError;
  if (existing?.some((job) => job.objective_id !== objective.id || job.input?.objectiveRevision !== objective.revision || (job.input?.creativeConcept ?? '') !== (input.creativeConcept ?? ''))) {
    throw new LessonArtifactHttpError(409, 'This generation request already belongs to a different objective revision or creative concept. Start a new generation request.');
  }
  if (existing?.length === jobs.length) return { batchId: existing[0].batch_id as string, jobs: existing, created: false };
  if (existing?.length) batchId = existing[0].batch_id;
  const existingKeys = new Set((existing ?? []).map((job) => job.idempotency_key));
  const missingJobs = jobs.filter((job) => !existingKeys.has(job.idempotencyKey));

  const rows = missingJobs.map((job) => ({
    batch_id: batchId,
    lesson_id: job.lessonId,
    objective_id: job.objectiveId,
    requested_by: job.requestedBy,
    organization_id: lesson.organization_id,
    job_type: job.jobType,
    idempotency_key: job.idempotencyKey,
    input: {
      lessonTitle: lesson.title,
      subject: lesson.subject,
      gradeLevel: lesson.gradelevel,
      objectiveText: objective.text,
      objectiveRevision: objective.revision,
      position: job.position,
      visualInstructions: lesson.visual_instructions ?? '',
      objectiveVisualInstructions: objective.visual_instructions ?? '',
      ...(input.creativeConcept ? { creativeConcept: input.creativeConcept } : {}),
    },
  }));

  const { error } = await supabase.rpc('enqueue_content_jobs_with_usage', {
    p_organization_id: lesson.organization_id,
    p_user_id: input.userId,
    p_rows: rows,
    p_usage_items: missingJobs.map((job) => ({
      category: quotaCategoryForJob(job.jobType), quantity: 1, referenceId: job.idempotencyKey,
    })),
  });
  if (error) throw error;
  const { data: allJobs, error: allJobsError } = await supabase
    .from('content_jobs').select('*').eq('requested_by', input.userId).in('idempotency_key', keys);
  if (allJobsError) throw allJobsError;
  return { batchId, jobs: allJobs ?? [], created: true };
}
