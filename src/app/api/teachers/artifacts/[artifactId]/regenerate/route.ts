import { regenerationSchema } from '@/lib/lesson-artifacts/authoring';
import { artifactMaterialRole, creativeConceptSchema } from '@/lib/lesson-artifacts/creative-concept';
import { createHash, randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';

import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { quotaCategoryForJob } from '@/lib/lesson-artifacts/quota';
import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { createServerSupabase } from '@/lib/supabase.server';

const jobTypeFor = (kind: string) => {
  if (kind === 'interactive_visualization') return 'generate_interactive';
  if (kind === 'generated_image') return 'generate_image';
  if (kind === 'structured_quiz') return 'generate_structured_quiz';
  if (kind === 'visual_quiz') return 'generate_visual_quiz';
  throw new LessonArtifactHttpError(400, 'This artifact type cannot be regenerated');
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  try {
    const { artifactId } = await params;
    const supabase = createServerSupabase();
    const { data: artifact, error: artifactError } = await supabase
      .from('lesson_artifacts')
      .select('*')
      .eq('id', artifactId)
      .maybeSingle();
    if (artifactError) throw artifactError;
    if (!artifact) throw new LessonArtifactHttpError(404, 'Artifact not found');

    const { session, lesson } = await requireLessonManager(artifact.lesson_id);
    const rawBody = await request.text();
    let body: unknown = {};
    try { body = rawBody.trim() ? JSON.parse(rawBody) : {}; }
    catch { throw new LessonArtifactHttpError(400, 'Invalid JSON request'); }
    const input = regenerationSchema.parse(body);
    const previousFeedback = artifact.generation_metadata?.feedback ?? '';
    const feedback = [previousFeedback, input.feedback].filter(Boolean).join('\n');
    if (feedback.length > 12_000) throw new LessonArtifactHttpError(400, 'Revision feedback is too long; generate a fresh bundle with consolidated visual instructions');
    const { data: objective, error: objectiveError } = artifact.objective_id
      ? await supabase.from('lesson_objectives').select('id,text,revision,archived_at,visual_instructions')
        .eq('id', artifact.objective_id).eq('lesson_id', artifact.lesson_id).maybeSingle()
      : { data: null, error: null };
    if (objectiveError) throw objectiveError;
    if (artifact.objective_id && (!objective || objective.archived_at)) throw new LessonArtifactHttpError(409, 'Objective is no longer active');
    let objectiveText = objective?.text ?? '';
    if (!artifact.objective_id) {
      const { data: objectives, error } = await supabase.from('lesson_objectives').select('text')
        .eq('lesson_id', lesson.id).is('archived_at', null).order('position');
      if (error) throw error;
      objectiveText = (objectives ?? []).map((item) => item.text).join('\n');
    }
    const revision = objective?.revision ?? lesson.visual_revision;
    const creativeConcept = creativeConceptSchema.safeParse(artifact.generation_metadata?.creativeConcept);
    const batchId = randomUUID();
    const jobType = jobTypeFor(artifact.kind);
    const materialRole = artifactMaterialRole(artifact);
    const instructionHash = createHash('sha256').update(JSON.stringify([feedback, revision, lesson.visual_instructions, objective?.visual_instructions, materialRole])).digest('hex').slice(0, 32);
    const idempotencyKey = `regenerate:${artifact.id}:${instructionHash}`;
    const { data: existingJob, error: existingJobError } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('requested_by', session.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingJobError) throw existingJobError;
    if (existingJob) {
      let job = existingJob;
      if (['failed', 'cancelled'].includes(existingJob.status)) {
        const { data: requeued, error: requeueError } = await supabase.from('content_jobs').update({
          status: 'queued', attempt_count: 0, error: null, completed_at: null,
          lease_owner: null, lease_expires_at: null,
        }).eq('id', existingJob.id).select('*').single();
        if (requeueError) throw requeueError;
        job = requeued;
      }
      after(async () => {
        await processContentJobBatch(`request:${existingJob.batch_id}`, 1).catch((jobError) => {
          console.error('Background artifact regeneration failed:', jobError);
        });
      });
      return NextResponse.json({ batchId: existingJob.batch_id, job }, { status: 202 });
    }
    const row = {
        id: randomUUID(),
        batch_id: batchId,
        lesson_id: artifact.lesson_id,
        objective_id: artifact.objective_id,
        requested_by: session.user.id,
        organization_id: lesson.organization_id,
        job_type: jobType,
        idempotency_key: idempotencyKey,
        input: {
          lessonTitle: lesson.title,
          subject: lesson.subject,
          gradeLevel: lesson.gradelevel,
          objectiveText,
          objectiveRevision: revision,
          visualInstructions: lesson.visual_instructions ?? '',
          objectiveVisualInstructions: objective?.visual_instructions ?? '',
          feedback,
          ...(materialRole ? { materialRole } : {}),
          ...(creativeConcept.success ? { creativeConcept: creativeConcept.data } : {}),
          position: artifact.kind === 'generated_image' ? 0 : artifact.position,
          seriesId: artifact.series_id,
          version: artifact.version + 1,
          supersedesId: artifact.id,
        },
      };
    const { error } = await supabase.rpc('enqueue_content_jobs_with_usage', {
      p_organization_id: lesson.organization_id,
      p_user_id: session.user.id,
      p_rows: [row],
      p_usage_items: [{
        category: quotaCategoryForJob(jobType), quantity: 1, referenceId: idempotencyKey,
      }],
    });
    if (error) throw error;
    const { data: job, error: jobError } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('requested_by', session.user.id)
      .eq('idempotency_key', idempotencyKey)
      .single();
    if (jobError) throw jobError;
    after(async () => {
      await drainContentWorker({ workerId: `request:${batchId}`, processBatch: processContentJobBatch, batchLimit: 1 }).catch((jobError) => {
        console.error('Background artifact regeneration failed:', jobError);
      });
    });
    return NextResponse.json({ batchId, job }, { status: 202 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
