import { NextResponse } from 'next/server';

import { quizEditSchema, saveTeacherQuizEdit } from '@/lib/lesson-artifacts/quiz-edit';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

/** Saves a hand-edited knowledge check as a new draft version. No AI and no credits. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  try {
    const { artifactId } = await params;
    const supabase = createServerSupabase();
    const { data: artifact, error } = await supabase.from('lesson_artifacts').select('*').eq('id', artifactId).maybeSingle();
    if (error) throw error;
    if (!artifact) throw new LessonArtifactHttpError(404, 'Artifact not found');
    const { session } = await requireLessonManager(artifact.lesson_id);
    const { payload } = quizEditSchema.parse(await request.json());
    const created = await saveTeacherQuizEdit(supabase, { artifact, payload, userId: session.user.id });
    return NextResponse.json({ artifact: created });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
