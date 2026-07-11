import { NextResponse } from 'next/server';

import { artifactReviewSchema, isArtifactReadyForApproval } from '@/lib/lesson-artifacts/authoring';
import { artifactPayloadSchema } from '@/lib/lesson-artifacts/domain';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  try {
    const { artifactId } = await params;
    const supabase = createServerSupabase();
    const { data: artifact, error } = await supabase
      .from('lesson_artifacts')
      .select('*')
      .eq('id', artifactId)
      .maybeSingle();
    if (error) throw error;
    if (!artifact) throw new LessonArtifactHttpError(404, 'Artifact not found');

    const { session } = await requireLessonManager(artifact.lesson_id);
    const input = artifactReviewSchema.parse(await request.json());
    if (artifact.status === 'approved' && input.decision === 'approve') {
      return NextResponse.json(artifact);
    }
    if (artifact.status !== 'draft') {
      throw new LessonArtifactHttpError(409, 'Only draft artifacts can be reviewed');
    }

    if (input.decision === 'approve') {
      artifactPayloadSchema.parse(artifact.payload);
      if (artifact.kind === 'uploaded_media') {
        const { data: asset, error: assetError } = await supabase
          .from('lesson_assets')
          .select('processing_status,processing_error')
          .eq('id', artifact.payload.assetId)
          .maybeSingle();
        if (assetError) throw assetError;
        if (asset?.processing_status !== 'ready') {
          throw new LessonArtifactHttpError(409, asset?.processing_error || 'Uploaded media is still being processed');
        }
      }
      if (!isArtifactReadyForApproval(artifact.kind, artifact.validation_report)) {
        throw new LessonArtifactHttpError(409, 'Artifact must pass its render validation before approval');
      }
    }

    const update = input.decision === 'approve'
      ? { status: 'approved', approved_by: session.user.id, approved_at: new Date().toISOString() }
      : { status: 'rejected', approved_by: null, approved_at: null };
    const { data: updated, error: updateError } = await supabase
      .from('lesson_artifacts')
      .update(update)
      .eq('id', artifactId)
      .select('*')
      .single();
    if (updateError) throw updateError;
    return NextResponse.json(updated);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
