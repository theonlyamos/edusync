import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

const validationSchema = z.object({
  status: z.enum(['passed', 'failed']),
  error: z.string().trim().max(2_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  try {
    const { artifactId } = await params;
    const input = validationSchema.parse(await request.json());
    const supabase = createServerSupabase();
    const { data: artifact, error: artifactError } = await supabase
      .from('lesson_artifacts')
      .select('id,lesson_id,kind,status')
      .eq('id', artifactId)
      .maybeSingle();
    if (artifactError) throw artifactError;
    if (!artifact) throw new LessonArtifactHttpError(404, 'Artifact not found');
    await requireLessonManager(artifact.lesson_id);
    if (artifact.status !== 'draft') throw new LessonArtifactHttpError(409, 'Only draft artifacts can be render validated');
    if (!['interactive_visualization', 'visual_quiz'].includes(artifact.kind)) {
      throw new LessonArtifactHttpError(400, 'This artifact type does not use sandbox render validation');
    }

    const { data: updated, error: updateError } = await supabase
      .from('lesson_artifacts')
      .update({
        validation_report: {
          status: input.status,
          validator: 'sandbox-runtime',
          validatedAt: new Date().toISOString(),
          ...(input.error ? { error: input.error } : {}),
        },
      })
      .eq('id', artifactId)
      .eq('status', 'draft')
      .select('id,validation_report')
      .single();
    if (updateError) throw updateError;
    return NextResponse.json(updated);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
