import { NextResponse } from 'next/server';

import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { keepSketchSchema, SKETCH_ROLE_SLOTS } from '@/lib/lesson-artifacts/sketch';
import { verifySketch } from '@/lib/lesson-artifacts/sketch.server';
import { createServerSupabase } from '@/lib/supabase.server';

/**
 * Turns a co-author sketch into a draft material for one objective. No AI runs
 * and nothing is charged again (the sketch was paid for when it was drawn).
 * Students only see it after it passes the sandbox check and is approved.
 */
export async function POST(request: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const { objectiveId } = await params;
    const supabase = createServerSupabase();
    const { data: objective, error } = await supabase.from('lesson_objectives')
      .select('id,lesson_id,revision,archived_at').eq('id', objectiveId).maybeSingle();
    if (error) throw error;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');
    const { session } = await requireLessonManager(objective.lesson_id);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new LessonArtifactHttpError(400, 'Invalid JSON request'); }
    const input = keepSketchSchema.parse(body);

    const signed = verifySketch({
      lessonId: objective.lesson_id, objectiveId, objectiveRevision: input.objectiveRevision, role: input.role,
      taskDescription: input.taskDescription, library: input.library, code: input.code, explanation: input.explanation,
    }, input.signature);
    if (!signed) throw new LessonArtifactHttpError(400, 'This sketch could not be verified. Draw it again.');
    if (input.objectiveRevision !== objective.revision) {
      throw new LessonArtifactHttpError(409, 'The objective changed since this sketch was drawn. Draw it again.');
    }

    const slot = SKETCH_ROLE_SLOTS[input.role];
    const { data: artifact, error: insertError } = await supabase.from('lesson_artifacts').insert({
      lesson_id: objective.lesson_id,
      objective_id: objective.id,
      objective_revision: objective.revision,
      kind: slot.kind,
      status: 'draft',
      position: slot.position,
      payload: { kind: slot.kind, library: input.library, code: input.code, explanation: input.explanation || input.taskDescription, taskDescription: input.taskDescription },
      source: 'ai_generated',
      validation_report: { status: 'pending', validator: 'sandbox-runtime' },
      generation_metadata: {
        ...(slot.kind === 'interactive_visualization' ? { materialRole: input.role } : {}),
        fromSketch: true,
        keptBy: session.user.id,
      },
      created_by: session.user.id,
    }).select('*').single();
    if (insertError) throw insertError;
    return NextResponse.json({ artifact, materialKey: slot.materialKey });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
