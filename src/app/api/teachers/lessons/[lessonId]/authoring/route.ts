import { NextResponse } from 'next/server';

import { authoringUpdateSchema } from '@/lib/lesson-artifacts/authoring';
import { acceptedCreativeConcepts } from '@/lib/lesson-artifacts/creative-concept';
import { lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase, lesson, session } = await requireLessonManager(lessonId);
    const [{ data: objectives, error: objectivesError }, { data: artifacts, error: artifactsError }, { data: activeJobs, error: activeJobsError }] = await Promise.all([
      supabase
        .from('lesson_objectives')
        .select('*')
        .eq('lesson_id', lessonId)
        .is('archived_at', null)
        .order('position'),
      supabase.from('lesson_artifacts').select('*').eq('lesson_id', lessonId).order('position'),
      supabase.from('content_jobs').select('batch_id').eq('lesson_id', lessonId)
        .eq('requested_by', session.user.id).in('status', ['queued', 'running'])
        .order('created_at', { ascending: false }).limit(1),
    ]);
    if (objectivesError) throw objectivesError;
    if (artifactsError) throw artifactsError;
    if (activeJobsError) throw activeJobsError;
    // At most one row per active objective; a busy objective cannot hide another one's plan.
    const conceptResults = await Promise.all((objectives ?? []).map((objective) => supabase.from('content_jobs')
      .select('objective_id,input').eq('lesson_id', lessonId).eq('objective_id', objective.id)
      .eq('input->>objectiveRevision', String(objective.revision)).not('input->>creativeConcept', 'is', null)
      .order('created_at', { ascending: false }).limit(1)));
    const conceptJobs = conceptResults.flatMap(({ data, error }) => {
      if (error) throw error;
      return data ?? [];
    });

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
      viewerId: session.user.id,
      activeBatchId: activeJobs?.[0]?.batch_id,
      creativeConcepts: acceptedCreativeConcepts(objectives ?? [], conceptJobs ?? []),
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        gradeLevel: lesson.gradelevel,
        content: lesson.content,
        visualInstructions: lesson.visual_instructions ?? '',
        visualRevision: lesson.visual_revision ?? 1,
      },
      objectives: (objectives ?? []).map((objective) => ({
        id: objective.id,
        text: objective.text,
        position: objective.position,
        revision: objective.revision,
        visualInstructions: objective.visual_instructions ?? '',
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
      p_visual_instructions: input.visualInstructions ?? null,
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
