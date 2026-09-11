import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { quotaCategoryForJob } from '@/lib/lesson-artifacts/quota';

export async function POST(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  try {
    const { lessonId } = await params;
    const { session, supabase, lesson } = await requireLessonManager(lessonId);
    const { data: objectives, error } = await supabase.from('lesson_objectives').select('text')
      .eq('lesson_id', lessonId).is('archived_at', null).order('position');
    if (error) throw error;
    const batchId = randomUUID();
    // One introduction series per lesson, so regeneration replaces versions predictably.
    const { data: previous, error: previousError } = await supabase.from('lesson_artifacts').select('id,series_id')
      .eq('lesson_id', lessonId).is('objective_id', null).eq('kind', 'generated_image')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (previousError) throw previousError;
    const row = {
      id: randomUUID(), batch_id: batchId, lesson_id: lessonId, objective_id: null,
      requested_by: session.user.id, organization_id: lesson.organization_id,
      job_type: 'generate_image', idempotency_key: `introduction:${batchId}`,
      input: {
        lessonTitle: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel,
        objectiveText: (objectives ?? []).map((objective) => objective.text).join('\n'),
        objectiveRevision: lesson.visual_revision, position: 0, visualInstructions: lesson.visual_instructions,
        ...(previous ? { seriesId: previous.series_id, supersedesId: previous.id } : {}),
      },
    };
    const { error: queueError } = await supabase.rpc('enqueue_content_jobs_with_usage', {
      p_organization_id: lesson.organization_id, p_user_id: session.user.id, p_rows: [row],
      p_usage_items: [{ category: quotaCategoryForJob('generate_image'), quantity: 1, referenceId: row.idempotency_key }],
    });
    if (queueError) throw queueError;
    after(async () => {
      await drainContentWorker({ workerId: `request:${batchId}`, processBatch: processContentJobBatch, batchLimit: 1 })
        .catch((error) => console.error('Lesson introduction generation failed:', error));
    });
    return NextResponse.json({ batchId, jobs: [{ ...row, status: 'queued' }] }, { status: 202 });
  } catch (error) { return lessonArtifactErrorResponse(error); }
}
