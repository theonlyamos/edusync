import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { generateAICompletion } from '@/lib/ai';
import { creativeConceptPrompt, creativeConceptRequestSchema, creativeConceptSchema } from '@/lib/lesson-artifacts/creative-concept';
import { reserveOrganizationAiUsage } from '@/lib/lesson-artifacts/quota-server';
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
    await reserveOrganizationAiUsage({
      userId: session.user.id, organizationId: lesson.organization_id,
      category: 'interactive_generation', quantity: 1, referenceId: `creative-concept:${objectiveId}:${randomUUID()}`,
    });
    const generated = await generateAICompletion(
      'You design inventive, accurate and accessible educational experiences. Return only a concise plain-text teaching concept for teacher review.',
      creativeConceptPrompt({
        lessonTitle: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel,
        objectiveText: objective.text, visualInstructions: lesson.visual_instructions,
        objectiveVisualInstructions: objective.visual_instructions, guidance: input.guidance, previousConcept: input.previousConcept,
      }), undefined, false, 0.8,
    );
    const concept = creativeConceptSchema.safeParse(generated);
    if (!concept.success) throw new LessonArtifactHttpError(502, 'The AI returned an invalid concept. Try suggesting again.');
    const { data: current, error: currentError } = await supabase.from('lesson_objectives')
      .select('revision,archived_at').eq('id', objectiveId).maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.archived_at || current.revision !== input.objectiveRevision) {
      throw new LessonArtifactHttpError(409, 'The objective changed while generating. Refresh before suggesting a concept.');
    }
    return NextResponse.json({ creativeConcept: concept.data, objectiveRevision: objective.revision });
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('AI_QUOTA_EXCEEDED')) {
      return lessonArtifactErrorResponse(new LessonArtifactHttpError(429, 'Your organization has reached its monthly AI content limit'));
    }
    return lessonArtifactErrorResponse(error);
  }
}
