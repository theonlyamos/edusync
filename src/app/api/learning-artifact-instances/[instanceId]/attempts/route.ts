import { NextResponse } from 'next/server';
import { z } from 'zod';

import { gradeStructuredQuiz } from '@/lib/lesson-artifacts/authoring';
import { structuredQuizPayloadSchema } from '@/lib/lesson-artifacts/domain';
import { requireStudentSession } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

const answerValue = z.union([z.string(), z.array(z.string()), z.boolean(), z.number()]);
const schema = z.object({
  answers: z.record(answerValue).optional(),
  completed: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  try {
    const { instanceId } = await params;
    const input = schema.parse(await request.json());
    const session = await requireStudentSession();
    const supabase = createServerSupabase();
    const { data: resolved, error } = await supabase
      .from('learning_events')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('event_type', 'artifact_resolved')
      .eq('student_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!resolved) throw new LessonArtifactHttpError(404, 'Artifact instance not found');
    const kind = resolved.payload?.artifact?.payload?.kind;
    if (!['structured_quiz', 'visual_quiz'].includes(kind)) {
      throw new LessonArtifactHttpError(400, 'This artifact does not accept quiz attempts');
    }
    const eventType = kind === 'structured_quiz' ? 'quiz_submitted' : 'visual_quiz_completed';
    const { data: existing } = await supabase.from('learning_events').select('payload').eq('run_id', resolved.run_id).eq('instance_id', instanceId).eq('event_type', eventType).maybeSingle();
    if (existing) return NextResponse.json(existing.payload);

    if (kind === 'visual_quiz') {
      if (!input.completed) throw new LessonArtifactHttpError(400, 'completed must be true');
      const result = { completed: true, masteryEligible: false };
      const { error: insertError } = await supabase.from('learning_events').insert({
        run_id: resolved.run_id, student_id: resolved.student_id, lesson_id: resolved.lesson_id,
        objective_id: resolved.objective_id, objective_revision: resolved.objective_revision,
        artifact_id: resolved.artifact_id, instance_id: instanceId, event_type: eventType,
        source: resolved.source, payload: result,
      });
      if (insertError) throw insertError;
      return NextResponse.json(result);
    }

    let payload: unknown;
    if (resolved.artifact_id) {
      const { data: artifact, error: artifactError } = await supabase.from('lesson_artifacts').select('payload').eq('id', resolved.artifact_id).single();
      if (artifactError) throw artifactError;
      payload = artifact.payload;
    } else {
      const { data: key, error: keyError } = await supabase.from('learning_quiz_keys').select('payload').eq('instance_id', instanceId).eq('run_id', resolved.run_id).maybeSingle();
      if (keyError) throw keyError;
      if (!key) throw new LessonArtifactHttpError(409, 'Quiz answer key is unavailable');
      payload = key.payload;
    }
    const quiz = structuredQuizPayloadSchema.parse(payload);
    const grade = gradeStructuredQuiz(quiz, input.answers ?? {});
    const masteryEarned = resolved.source === 'teacher_approved' && grade.percentage >= 80;
    const response = { ...grade, masteryEligible: resolved.source === 'teacher_approved', masteryEarned };
    const { error: attemptError } = await supabase.from('learning_events').insert({
      run_id: resolved.run_id, student_id: resolved.student_id, lesson_id: resolved.lesson_id,
      objective_id: resolved.objective_id, objective_revision: resolved.objective_revision,
      artifact_id: resolved.artifact_id, instance_id: instanceId, event_type: eventType,
      source: resolved.source, payload: response,
    });
    if (attemptError) throw attemptError;
    if (masteryEarned) {
      const { error: masteryError } = await supabase.from('learning_events').insert({
        run_id: resolved.run_id, student_id: resolved.student_id, lesson_id: resolved.lesson_id,
        objective_id: resolved.objective_id, objective_revision: resolved.objective_revision,
        artifact_id: resolved.artifact_id, instance_id: instanceId, event_type: 'objective_mastered',
        source: resolved.source, payload: { percentage: grade.percentage },
      });
      if (masteryError) throw masteryError;
    }
    return NextResponse.json(response);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
