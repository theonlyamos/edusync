import { randomUUID } from 'node:crypto';
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
  _request: Request,
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
    const { data: objective, error: objectiveError } = await supabase
      .from('lesson_objectives')
      .select('id,text,revision,archived_at')
      .eq('id', artifact.objective_id)
      .maybeSingle();
    if (objectiveError) throw objectiveError;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(409, 'Objective is no longer active');

    const batchId = randomUUID();
    const jobType = jobTypeFor(artifact.kind);
    const idempotencyKey = `regenerate:${artifact.id}`;
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
          objectiveText: objective.text,
          objectiveRevision: objective.revision,
          position: artifact.position,
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
