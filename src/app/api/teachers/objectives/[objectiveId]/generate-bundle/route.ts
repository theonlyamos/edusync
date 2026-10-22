import { after, NextResponse } from 'next/server';

import { bundleRequestSchema } from '@/lib/lesson-artifacts/creative-concept';
import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { enqueueObjectiveBundle } from '@/lib/lesson-artifacts/objective-bundle.server';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ objectiveId: string }> },
) {
  try {
    const { objectiveId } = await params;
    const supabase = createServerSupabase();
    const { data: objective, error: objectiveError } = await supabase
      .from('lesson_objectives')
      .select('id,lesson_id,text,revision,archived_at,visual_instructions')
      .eq('id', objectiveId)
      .maybeSingle();
    if (objectiveError) throw objectiveError;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');

    const { session, lesson } = await requireLessonManager(objective.lesson_id);
    const rawBody = await request.text();
    let parsedBody: unknown = {};
    try { parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {}; }
    catch { throw new LessonArtifactHttpError(400, 'Invalid JSON request'); }
    const body = bundleRequestSchema.parse(parsedBody);
    if (body.objectiveRevision !== undefined && body.objectiveRevision !== objective.revision) {
      throw new LessonArtifactHttpError(409, 'The objective changed. Refresh and review its creative concept again.');
    }
    const result = await enqueueObjectiveBundle(supabase, {
      userId: session.user.id, lesson, objective,
      creativeConcept: body.creativeConcept, idempotencyKey: body.idempotencyKey,
    });
    if (!result.created) return NextResponse.json({ batchId: result.batchId, jobs: result.jobs });
    after(async () => {
      await drainContentWorker({ workerId: `request:${result.batchId}`, processBatch: processContentJobBatch, batchLimit: 5 }).catch((jobError) => {
        console.error('Background lesson artifact generation failed:', jobError);
      });
    });
    return NextResponse.json({ batchId: result.batchId, jobs: result.jobs }, { status: 202 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
