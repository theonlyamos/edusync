import { NextResponse } from 'next/server';

import { requireStudentSession } from '@/lib/lesson-artifacts/learning-server';
import {
  buildStudentLessonDetail,
  normalizePublishedObjectives,
} from '@/lib/lesson-artifacts/student-learning';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await requireStudentSession();
    const { lessonId } = await params;
    const supabase = createServerSupabase();
    const [{ data: lesson, error: lessonError }, { data: student, error: studentError }] = await Promise.all([
      supabase
        .from('lessons')
        .select('id,gradelevel,current_publication_id')
        .eq('id', lessonId)
        .maybeSingle(),
      supabase
        .from('students')
        .select('grade')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);

    if (lessonError) throw lessonError;
    if (studentError) throw studentError;
    if (!lesson) throw new LessonArtifactHttpError(404, 'Lesson not found');

    const lessonGrade = lesson.gradelevel?.trim().toLowerCase();
    const studentGrade = student?.grade?.trim().toLowerCase();
    if (!lessonGrade || !studentGrade || lessonGrade !== studentGrade) {
      throw new LessonArtifactHttpError(403, 'This lesson is not assigned to your grade');
    }

    if (!lesson.current_publication_id) {
      return NextResponse.json(
        { error: 'This lesson has not been published yet', code: 'unpublished_lesson' },
        { status: 409 },
      );
    }

    const { data: publication, error: publicationError } = await supabase
      .from('lesson_publications')
      .select('version,manifest')
      .eq('id', lesson.current_publication_id)
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication?.manifest?.lesson) {
      return NextResponse.json(
        { error: 'The published lesson snapshot is unavailable', code: 'unpublished_lesson' },
        { status: 409 },
      );
    }

    const objectives = normalizePublishedObjectives(publication.manifest.objectives ?? []);
    if (!objectives) {
      return NextResponse.json(
        { error: 'The published lesson snapshot needs to be republished', code: 'unpublished_lesson' },
        { status: 409 },
      );
    }
    const artifactIds = [...new Set(objectives.flatMap((objective) => objective.artifactIds ?? []))];
    const artifactResult = artifactIds.length
      ? await supabase.from('lesson_artifacts').select('id,kind').in('id', artifactIds)
      : { data: [], error: null };
    if (artifactResult.error) throw artifactResult.error;

    return NextResponse.json(buildStudentLessonDetail({
      publicationVersion: publication.version,
      manifest: {
        lesson: publication.manifest.lesson,
        objectives,
      },
      artifacts: artifactResult.data ?? [],
    }));
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
