import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { reserveOrganizationAiUsage } from '@/lib/lesson-artifacts/quota-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { sketchRequestSchema, sketchVisualTask, type SketchResult } from '@/lib/lesson-artifacts/sketch';
import { signSketch } from '@/lib/lesson-artifacts/sketch.server';
import { runVisualizeGeneration } from '@/lib/visualize-ai-task';

export const maxDuration = 120;

/** Draws a quick draft visual for the co-author chat. Uses one visual from the school's allowance. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase, lesson, session } = await requireLessonManager(lessonId);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new LessonArtifactHttpError(400, 'Invalid JSON request'); }
    const input = sketchRequestSchema.parse(body);

    const { data: objective, error } = await supabase.from('lesson_objectives')
      .select('id,text,revision,archived_at').eq('id', input.objectiveId).eq('lesson_id', lessonId).maybeSingle();
    if (error) throw error;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');

    await reserveOrganizationAiUsage({
      userId: session.user.id, organizationId: lesson.organization_id,
      category: 'interactive_generation', quantity: 1, referenceId: `sketch:${objective.id}:${randomUUID()}`,
    });

    let drawn;
    try {
      drawn = await runVisualizeGeneration({
        task_description: sketchVisualTask({ role: input.role, objectiveText: objective.text, taskDescription: input.taskDescription }),
        topic: lesson.title,
        panel_dimensions: { width: 720, height: 480 },
      });
    } catch (generationError) {
      console.error('Sketch generation failed:', generationError);
      throw new LessonArtifactHttpError(502, 'The sketch could not be drawn. Try again or change the description.');
    }

    const result: Omit<SketchResult, 'signature'> = {
      objectiveId: objective.id,
      objectiveRevision: objective.revision,
      role: input.role,
      taskDescription: input.taskDescription,
      library: drawn.library,
      code: drawn.code,
      explanation: drawn.explanation,
    };
    return NextResponse.json({ ...result, signature: signSketch({ lessonId, ...result }) } satisfies SketchResult);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
