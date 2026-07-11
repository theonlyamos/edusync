import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const session = await getServerSession();
    if (!session?.user?.id) throw new LessonArtifactHttpError(401, 'Sign in required');
    const supabase = createServerSupabase();
    const { data: asset, error } = await supabase
      .from('lesson_assets')
      .select('*')
      .eq('id', assetId)
      .eq('processing_status', 'ready')
      .maybeSingle();
    if (error) throw error;
    if (!asset) throw new LessonArtifactHttpError(404, 'Asset not found');

    if (['teacher', 'admin'].includes(session.user.role ?? '')) {
      await requireLessonManager(asset.lesson_id);
    } else {
      const { data: runs, error: runError } = await supabase
        .from('learning_runs')
        .select('publication_id')
        .eq('student_id', session.user.id)
        .eq('lesson_id', asset.lesson_id);
      if (runError) throw runError;
      const publicationIds = (runs ?? []).map((run) => run.publication_id);
      if (!publicationIds.length) throw new LessonArtifactHttpError(403, 'Asset is not available in your learning run');
      const { data: publications, error: publicationError } = await supabase.from('lesson_publications').select('manifest').in('id', publicationIds);
      if (publicationError) throw publicationError;
      const artifactIds = (publications ?? []).flatMap((publication: any) => publication.manifest?.objectives?.flatMap((objective: any) => objective.artifactIds ?? []) ?? []);
      if (!artifactIds.length) throw new LessonArtifactHttpError(403, 'Asset is not part of your published lesson');
      const { data: publishedArtifact, error: publishedError } = await supabase
        .from('lesson_artifacts')
        .select('id')
        .in('id', artifactIds)
        .eq('status', 'approved')
        .contains('payload', { assetId })
        .limit(1)
        .maybeSingle();
      if (publishedError) throw publishedError;
      if (!publishedArtifact) throw new LessonArtifactHttpError(403, 'Asset is not part of your published lesson');
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, 300);
    if (signedError) throw signedError;
    return NextResponse.json({ url: signed.signedUrl, expiresIn: 300 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
