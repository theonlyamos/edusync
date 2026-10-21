import { NextResponse } from 'next/server';

import { creativeConceptRequestSchema } from '@/lib/lesson-artifacts/creative-concept';
import { suggestObjectiveConcept } from '@/lib/lesson-artifacts/objective-bundle.server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(request: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const { objectiveId } = await params;
    const supabase = createServerSupabase();
    const { data: objective, error } = await supabase.from('lesson_objectives')
      .select('id,lesson_id,text,revision,archived_at,visual_instructions').eq('id', objectiveId).maybeSingle();
    if (error) throw error;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');
    const { session, lesson } = await requireLessonManager(objective.lesson_id);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new LessonArtifactHttpError(400, 'Invalid JSON request'); }
    const input = creativeConceptRequestSchema.parse(body);
    if (input.objectiveRevision !== objective.revision) {
      throw new LessonArtifactHttpError(409, 'The objective changed. Refresh before suggesting a concept.');
    }
    const creativeConcept = await suggestObjectiveConcept(supabase, {
      userId: session.user.id, lesson, objective, guidance: input.guidance, previousConcept: input.previousConcept,
    });
    return NextResponse.json({ creativeConcept, objectiveRevision: objective.revision });
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('AI_QUOTA_EXCEEDED')) {
      return lessonArtifactErrorResponse(new LessonArtifactHttpError(429, 'Your organization has reached its monthly AI content limit'));
    }
    return lessonArtifactErrorResponse(error);
  }
}
