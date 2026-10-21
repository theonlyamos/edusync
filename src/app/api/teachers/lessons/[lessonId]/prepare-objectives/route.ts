import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';

import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { creativeConceptSchema } from '@/lib/lesson-artifacts/creative-concept';
import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { enqueueObjectiveBundle, suggestObjectiveConcept } from '@/lib/lesson-artifacts/objective-bundle.server';
import { PREPARE_OBJECTIVES_LIMIT as PREPARE_LIMIT } from '@/lib/lesson-artifacts/studio-state';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';

// Concept suggestions run in parallel, then generation continues in the background.
export const maxDuration = 300;


const prepareSchema = z.object({
  objectives: z.array(z.object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    // A concept the teacher already wrote or accepted; otherwise the AI suggests one.
    creativeConcept: creativeConceptSchema.optional(),
  })).min(1).max(PREPARE_LIMIT),
});

/**
 * Prepares several objectives at once: suggests a concept where one is missing
 * and queues all five materials for each, under one batch the Studio can follow.
 * The teacher still reviews and approves every material.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase, session, lesson } = await requireLessonManager(lessonId);
    const input = prepareSchema.parse(await request.json());
    const ids = input.objectives.map((item) => item.id);
    const { data: objectives, error } = await supabase.from('lesson_objectives')
      .select('id,lesson_id,text,revision,archived_at,visual_instructions')
      .eq('lesson_id', lessonId).is('archived_at', null).in('id', ids);
    if (error) throw error;
    const byId = new Map((objectives ?? []).map((objective) => [objective.id, objective]));
    for (const item of input.objectives) {
      if (byId.get(item.id)?.revision !== item.revision) {
        throw new LessonArtifactHttpError(409, 'An objective changed. Refresh the Studio and try again.');
      }
    }

    const batchId = randomUUID();
    const outcomes = await Promise.allSettled(input.objectives.map(async (item) => {
      const objective = byId.get(item.id)!;
      const creativeConcept = item.creativeConcept
        ?? await suggestObjectiveConcept(supabase, { userId: session.user.id, lesson, objective });
      await enqueueObjectiveBundle(supabase, {
        userId: session.user.id, lesson, objective, creativeConcept, batchId,
        idempotencyKey: `prepare:${batchId}:${objective.id}`,
      });
      return objective.id;
    }));

    const prepared = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : []);
    const failed = outcomes.flatMap((outcome, index) => outcome.status === 'rejected' ? [{
      id: input.objectives[index].id,
      error: outcome.reason instanceof LessonArtifactHttpError ? outcome.reason.message
        : String((outcome.reason as { message?: unknown })?.message ?? '').includes('AI_QUOTA_EXCEEDED')
          ? 'Your school has reached its AI content limit' : 'Could not prepare this objective',
    }] : []);
    if (!prepared.length) {
      if (failed.some((item) => item.error.includes('AI content limit'))) throw new LessonArtifactHttpError(429, 'Your school has reached its AI content limit');
      throw new LessonArtifactHttpError(502, failed[0]?.error ?? 'Could not prepare these objectives');
    }

    after(async () => {
      await drainContentWorker({ workerId: `request:${batchId}`, processBatch: processContentJobBatch, batchLimit: 5, maxBatches: prepared.length + 1 }).catch((jobError) => {
        console.error('Background lesson artifact generation failed:', jobError);
      });
    });
    return NextResponse.json({ batchId, prepared, failed }, { status: 202 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
