import { NextResponse } from 'next/server';

import { requireStudentSession } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(_request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  try {
    const { instanceId } = await params;
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
    const { data: existing } = await supabase.from('learning_events').select('id').eq('run_id', resolved.run_id).eq('instance_id', instanceId).eq('event_type', 'artifact_rendered').maybeSingle();
    if (!existing) {
      const { error: insertError } = await supabase.from('learning_events').insert({
        run_id: resolved.run_id, student_id: resolved.student_id, lesson_id: resolved.lesson_id,
        objective_id: resolved.objective_id, objective_revision: resolved.objective_revision,
        artifact_id: resolved.artifact_id, instance_id: instanceId, event_type: 'artifact_rendered',
        source: resolved.source, payload: {},
      });
      if (insertError) throw insertError;
    }
    return NextResponse.json({ recorded: true });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
