import { NextResponse } from 'next/server';

import { generateAICompletion } from '@/lib/ai';
import { enforceDailyCap } from '@/lib/daily-caps';
import { loadAcceptedConcepts } from '@/lib/lesson-artifacts/accepted-concepts.server';
import {
  buildCoauthorSystemPrompt,
  buildCoauthorUserPrompt,
  coauthorRequestSchema,
  parseCoauthorReply,
  type CoauthorLessonState,
} from '@/lib/lesson-artifacts/coauthor';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';

/**
 * One turn with the lesson co-author. It reads the saved lesson and answers
 * with a reply and proposals; it never writes. The Studio applies proposals
 * through the usual routes, so their checks and credits still apply.
 */
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
    const input = coauthorRequestSchema.parse(body);

    const capped = await enforceDailyCap('coauthor', session.user.id);
    if (capped) return capped;

    const [{ data: objectives, error: objectivesError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      supabase.from('lesson_objectives').select('id,text,position,revision,visual_instructions')
        .eq('lesson_id', lessonId).is('archived_at', null).order('position'),
      supabase.from('lesson_artifacts')
        .select('id,objective_id,objective_revision,series_id,version,kind,status,position,created_at,payload,generation_metadata')
        .eq('lesson_id', lessonId).in('status', ['draft', 'approved']).order('position'),
    ]);
    if (objectivesError) throw objectivesError;
    if (artifactsError) throw artifactsError;

    const state: CoauthorLessonState = {
      lesson: {
        title: lesson.title,
        subject: lesson.subject,
        gradeLevel: lesson.gradelevel,
        content: lesson.content,
        visualInstructions: lesson.visual_instructions ?? '',
      },
      objectives: (objectives ?? []).map((objective) => ({
        id: objective.id,
        text: objective.text,
        position: objective.position,
        revision: objective.revision,
        visualInstructions: objective.visual_instructions ?? '',
      })),
      artifacts: artifacts ?? [],
      concepts: await loadAcceptedConcepts(supabase, lessonId, objectives ?? []),
    };

    let raw: string | null | undefined;
    try {
      raw = await generateAICompletion(buildCoauthorSystemPrompt(), buildCoauthorUserPrompt(state, input.messages, input.focus), undefined, true, 0.6);
    } catch (error) {
      console.error('Co-author model call failed:', error);
      throw new LessonArtifactHttpError(502, 'The co-author is unavailable right now. Try again in a moment.');
    }
    try {
      return NextResponse.json(parseCoauthorReply(raw, state));
    } catch (error) {
      console.error('Co-author reply could not be read:', error);
      throw new LessonArtifactHttpError(502, 'The co-author gave an answer it could not finish. Try asking again.');
    }
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
