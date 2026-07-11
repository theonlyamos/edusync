import { NextResponse } from 'next/server';

import { authoringUpdateSchema } from '@/lib/lesson-artifacts/authoring';
import { lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase, lesson } = await requireLessonManager(lessonId);
    const [{ data: objectives, error: objectivesError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      supabase
        .from('lesson_objectives')
        .select('*')
        .eq('lesson_id', lessonId)
        .is('archived_at', null)
        .order('position'),
      supabase.from('lesson_artifacts').select('*').eq('lesson_id', lessonId).order('position'),
    ]);
    if (objectivesError) throw objectivesError;
    if (artifactsError) throw artifactsError;

    let currentPublication = null;
    if (lesson.current_publication_id) {
      const { data, error } = await supabase
        .from('lesson_publications')
        .select('id,version,warnings,published_at')
        .eq('id', lesson.current_publication_id)
        .maybeSingle();
      if (error) throw error;
      currentPublication = data;
    }

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        gradeLevel: lesson.gradelevel,
        content: lesson.content,
      },
      objectives: (objectives ?? []).map((objective) => ({
        id: objective.id,
        text: objective.text,
        position: objective.position,
        revision: objective.revision,
      })),
      artifacts: artifacts ?? [],
      currentPublication,
    });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase } = await requireLessonManager(lessonId);
    const input = authoringUpdateSchema.parse(await request.json());

    const { data: objectives, error: objectivesError } = await supabase.rpc('save_lesson_authoring', {
      p_lesson_id: lessonId,
      p_title: input.title,
      p_subject: input.subject,
      p_grade_level: input.gradeLevel,
      p_content: input.content,
      p_objectives: input.objectives,
    });
    if (objectivesError) throw objectivesError;

    return NextResponse.json({
      lesson: { id: lessonId, ...input },
      objectives: objectives ?? [],
    });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
