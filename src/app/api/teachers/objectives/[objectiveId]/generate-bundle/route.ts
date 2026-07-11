import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildDefaultBundleJobs } from '@/lib/lesson-artifacts/authoring';
import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { quotaCategoryForJob } from '@/lib/lesson-artifacts/quota';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

const requestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ objectiveId: string }> },
) {
  try {
    const { objectiveId } = await params;
    const supabase = createServerSupabase();
    const { data: objective, error: objectiveError } = await supabase
      .from('lesson_objectives')
      .select('id,lesson_id,text,revision,archived_at')
      .eq('id', objectiveId)
      .maybeSingle();
    if (objectiveError) throw objectiveError;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');

    const { session, lesson } = await requireLessonManager(objective.lesson_id);
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    let batchId = randomUUID();
    const prefix = body.idempotencyKey ?? batchId;
    const jobs = buildDefaultBundleJobs({
      lessonId: objective.lesson_id,
      objectiveId,
      requestedBy: session.user.id,
      idempotencyPrefix: prefix,
    });
    const keys = jobs.map((job) => job.idempotencyKey);

    const { data: existing, error: existingError } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('requested_by', session.user.id)
      .in('idempotency_key', keys);
    if (existingError) throw existingError;
    if (existing?.length === jobs.length) {
      return NextResponse.json({ batchId: existing[0].batch_id, jobs: existing });
    }
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
      },
    }));

    const { error } = await supabase.rpc('enqueue_content_jobs_with_usage', {
      p_organization_id: lesson.organization_id,
      p_user_id: session.user.id,
      p_rows: rows,
      p_usage_items: missingJobs.map((job) => ({
        category: quotaCategoryForJob(job.jobType), quantity: 1, referenceId: job.idempotencyKey,
      })),
    });
    if (error) throw error;
    const { data: allJobs, error: allJobsError } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('requested_by', session.user.id)
      .in('idempotency_key', keys);
    if (allJobsError) throw allJobsError;
    after(async () => {
      await drainContentWorker({ workerId: `request:${batchId}`, processBatch: processContentJobBatch, batchLimit: 5 }).catch((jobError) => {
        console.error('Background lesson artifact generation failed:', jobError);
      });
    });
    return NextResponse.json({ batchId, jobs: allJobs ?? [] }, { status: 202 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
