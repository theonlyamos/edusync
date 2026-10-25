import { NextResponse } from 'next/server';
import { inClassAudience } from '@/lib/school-classes';
import { studentClassId } from '@/lib/school-classes.server';

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
import { getUserSchoolId, inActiveSchool } from '@/lib/school';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await requireStudentSession();
    const { lessonId } = await params;
    const supabase = createServerSupabase();
    const [{ data: lesson, error: lessonError }, { data: student, error: studentError }, schoolId] = await Promise.all([
      supabase
        .from('lessons')
        .select('id,gradelevel,current_publication_id,organization_id,archived_at,audience_class_ids')
        .eq('id', lessonId)
        .maybeSingle(),
      supabase
        .from('students')
        .select('grade')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      getUserSchoolId(supabase, session.user.id),
    ]);

    if (lessonError) throw lessonError;
    if (studentError) throw studentError;
    if (!lesson || lesson.archived_at) throw new LessonArtifactHttpError(404, 'Lesson not found');
    if (!student || !inActiveSchool(schoolId, lesson.organization_id)) {
      throw new LessonArtifactHttpError(404, 'Lesson not found');
    }

    const lessonGrade = lesson.gradelevel?.trim().toLowerCase();
    const studentGrade = student?.grade?.trim().toLowerCase();
    if (!lessonGrade || !studentGrade || lessonGrade !== studentGrade) {
      throw new LessonArtifactHttpError(403, 'This lesson is not assigned to your grade');
    }
    if (lesson.audience_class_ids?.length && !inClassAudience(lesson.audience_class_ids, await studentClassId(supabase, session.user.id))) {
      throw new LessonArtifactHttpError(403, 'This lesson is not assigned to your class');
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

    // Objectives the student has already mastered in a tutor session.
    const { data: mastered, error: masteredError } = await supabase
      .from('learning_events')
      .select('objective_id,objective_revision')
      .eq('student_id', session.user.id)
      .eq('lesson_id', lessonId)
      .eq('event_type', 'objective_mastered')
      .limit(500);
    if (masteredError) throw masteredError;
    // Mastery counts only for the objective as currently published: a rewrite
    // bumps its revision, so earlier mastery no longer marks it done. Events
    // without a revision predate revision tracking and still count.
    const publishedRevisions = new Map(objectives.map((objective) => [objective.id, objective.revision]));
    const masteredObjectiveIds = [...new Set((mastered ?? [])
      .filter((row) => {
        const id = row.objective_id as string | null;
        if (!id || !publishedRevisions.has(id)) return false;
        const revision = row.objective_revision as number | null;
        return revision == null || revision === publishedRevisions.get(id);
      })
      .map((row) => row.objective_id as string))];

    return NextResponse.json({
      ...buildStudentLessonDetail({
        publicationVersion: publication.version,
        manifest: {
          lesson: publication.manifest.lesson,
          objectives,
        },
        artifacts: artifactResult.data ?? [],
      }),
      masteredObjectiveIds,
    });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
