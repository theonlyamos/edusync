import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireOwnedLearningRun } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';

const schema = z.object({ objectiveId: z.string().uuid() });

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const input = schema.parse(await request.json());
    const { session, supabase, run } = await requireOwnedLearningRun(runId);
    const { data: publication, error } = await supabase.from('lesson_publications').select('manifest').eq('id', run.publication_id).single();
    if (error) throw error;
    const objective = publication.manifest?.objectives?.find((item: any) => item.id === input.objectiveId);
    if (!objective) throw new LessonArtifactHttpError(400, 'Objective is not part of this publication');
    const { data: updated, error: updateError } = await supabase.from('learning_runs').update({
      active_objective_id: objective.id,
      updated_at: new Date().toISOString(),
    }).eq('id', run.id).select('*').single();
    if (updateError) throw updateError;
    await supabase.from('learning_events').insert({
      run_id: run.id, student_id: session.user.id, lesson_id: run.lesson_id,
      objective_id: objective.id, objective_revision: objective.revision,
      event_type: 'objective_changed', payload: { position: objective.position },
    });
    return NextResponse.json({ run: updated, objective });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
