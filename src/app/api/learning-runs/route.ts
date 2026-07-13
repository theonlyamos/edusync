import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireStudentSession } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';
import {
  isObjectiveSelectionChange,
  normalizePublishedObjectives,
  selectPublishedObjective,
} from '@/lib/lesson-artifacts/student-learning';

const schema = z.object({
  lessonId: z.string().uuid(),
  mode: z.enum(['companion', 'tutor']).default('tutor'),
  objectiveId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireStudentSession();
    const input = schema.parse(await request.json());
    const supabase = createServerSupabase();
    const [{ data: lesson, error: lessonError }, { data: student, error: studentError }] = await Promise.all([
      supabase.from('lessons').select('id,title,subject,gradelevel,current_publication_id').eq('id', input.lessonId).maybeSingle(),
      supabase.from('students').select('grade').eq('user_id', session.user.id).maybeSingle(),
    ]);
    if (lessonError) throw lessonError;
    if (studentError) throw studentError;
    if (!lesson?.current_publication_id) throw new LessonArtifactHttpError(409, 'This lesson has not been published yet');
    if (lesson.gradelevel && (!student?.grade || lesson.gradelevel.trim().toLowerCase() !== student.grade.trim().toLowerCase())) {
      throw new LessonArtifactHttpError(403, 'This lesson is not assigned to your grade');
    }
    const { data: publication, error: publicationError } = await supabase
      .from('lesson_publications')
      .select('*')
      .eq('id', lesson.current_publication_id)
      .single();
    if (publicationError) throw publicationError;
    const publishedObjectives = normalizePublishedObjectives(publication.manifest?.objectives ?? []);
    if (!publishedObjectives) {
      throw new LessonArtifactHttpError(409, 'The published lesson snapshot needs to be republished');
    }
    const selectedObjective = selectPublishedObjective(publishedObjectives, input.objectiveId);
    if (!selectedObjective) {
      if (input.objectiveId) throw new LessonArtifactHttpError(400, 'Objective is not part of this publication');
      throw new LessonArtifactHttpError(409, 'Published lesson has no objectives');
    }

    const { data: existing } = await supabase
      .from('learning_runs')
      .select('*')
      .eq('student_id', session.user.id)
      .eq('lesson_id', lesson.id)
      .eq('publication_id', publication.id)
      .eq('mode', input.mode)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let run = existing;
    if (!run) {
      const result = await supabase.from('learning_runs').insert({
        student_id: session.user.id,
        lesson_id: lesson.id,
        publication_id: publication.id,
        active_objective_id: selectedObjective.id,
        mode: input.mode,
      }).select('*').single();
      if (result.error) throw result.error;
      run = result.data;
    } else if (isObjectiveSelectionChange(run.active_objective_id, selectedObjective.id)) {
      const previousObjectiveId = run.active_objective_id;
      const { data: updated, error: updateError } = await supabase
        .from('learning_runs')
        .update({ active_objective_id: selectedObjective.id, updated_at: new Date().toISOString() })
        .eq('id', run.id)
        .eq('student_id', session.user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      run = updated;
      const { error: eventError } = await supabase.from('learning_events').insert({
        run_id: run.id,
        student_id: session.user.id,
        lesson_id: lesson.id,
        objective_id: selectedObjective.id,
        objective_revision: selectedObjective.revision,
        event_type: 'objective_changed',
        payload: { position: selectedObjective.position },
      });
      if (eventError) {
        const { error: rollbackError } = await supabase
          .from('learning_runs')
          .update({ active_objective_id: previousObjectiveId, updated_at: new Date().toISOString() })
          .eq('id', run.id)
          .eq('student_id', session.user.id)
          .select('*')
          .single();
        if (rollbackError) {
          throw new Error(`Objective event failed and the run could not be restored: ${rollbackError.message}`);
        }
        throw eventError;
      }
    }
    return NextResponse.json({ run, lesson, objectives: publishedObjectives, publicationVersion: publication.version });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
