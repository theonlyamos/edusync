import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireStudentSession } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(_request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  try {
    const { instanceId } = await params;
    const session = await requireStudentSession();
    const supabase = createServerSupabase();
    const { data: resolved, error } = await supabase.from('learning_events').select('*')
      .eq('instance_id', instanceId).eq('event_type', 'artifact_resolved')
      .eq('student_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!resolved) throw new LessonArtifactHttpError(404, 'Quiz instance not found');
    if (resolved.payload?.artifact?.payload?.kind !== 'structured_quiz') {
      throw new LessonArtifactHttpError(400, 'Only structured quizzes can be retried');
    }
    const nextInstanceId = randomUUID();
    const response = { ...resolved.payload, instanceId: nextInstanceId };
    if (!resolved.artifact_id) {
      const { data: key, error: keyError } = await supabase.from('learning_quiz_keys').select('payload').eq('instance_id', instanceId).maybeSingle();
      if (keyError) throw keyError;
      if (!key) throw new LessonArtifactHttpError(409, 'Quiz answer key is unavailable');
      const { error: copyError } = await supabase.from('learning_quiz_keys').insert({
        instance_id: nextInstanceId, run_id: resolved.run_id, payload: key.payload,
      });
      if (copyError) throw copyError;
    }
    const { error: insertError } = await supabase.from('learning_events').insert({
      run_id: resolved.run_id, student_id: resolved.student_id, lesson_id: resolved.lesson_id,
      objective_id: resolved.objective_id, objective_revision: resolved.objective_revision,
      artifact_id: resolved.artifact_id, instance_id: nextInstanceId,
      event_type: 'artifact_resolved', source: resolved.source,
      request_id: `retry:${instanceId}:${nextInstanceId}`, payload: response,
    });
    if (insertError) throw insertError;
    return NextResponse.json(response);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
