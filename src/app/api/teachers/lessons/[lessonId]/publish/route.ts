import { NextResponse } from 'next/server';

import { createPublicationHash } from '@/lib/lesson-artifacts/authoring';
import { buildPublicationManifest } from '@/lib/lesson-artifacts/domain';
import {
  lessonArtifactErrorResponse,
  mapArtifactRow,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { session, supabase, lesson } = await requireLessonManager(lessonId);
    const [{ data: objectives, error: objectiveError }, { data: artifacts, error: artifactError }] = await Promise.all([
      supabase
        .from('lesson_objectives')
        .select('*')
        .eq('lesson_id', lessonId)
        .is('archived_at', null)
        .order('position'),
      supabase.from('lesson_artifacts').select('*').eq('lesson_id', lessonId).eq('status', 'approved'),
    ]);
    if (objectiveError) throw objectiveError;
    if (artifactError) throw artifactError;

    const manifest = buildPublicationManifest({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        gradeLevel: lesson.gradelevel ?? '',
        content: lesson.content,
      },
      objectives: (objectives ?? []).map((objective) => ({
        id: objective.id,
        text: objective.text,
        position: objective.position,
        revision: objective.revision,
      })),
      artifacts: (artifacts ?? []).map(mapArtifactRow),
    });
    const contentHash = createPublicationHash(manifest);

    const { data: publication, error: publicationError } = await supabase.rpc('publish_lesson_manifest', {
      p_lesson_id: lessonId,
      p_manifest: manifest,
      p_warnings: manifest.warnings,
      p_content_hash: contentHash,
      p_published_by: session.user.id,
    });
    if (publicationError) throw publicationError;

    return NextResponse.json({ publication, warnings: manifest.warnings });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
