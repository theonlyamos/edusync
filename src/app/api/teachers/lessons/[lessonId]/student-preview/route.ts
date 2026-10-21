import { NextResponse } from 'next/server';

import { buildPublicationManifest, toStudentSafeArtifact } from '@/lib/lesson-artifacts/domain';
import { missingPublicationIntroductions } from '@/lib/lesson-artifacts/introductions';
import { lessonArtifactErrorResponse, mapArtifactRow, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { buildStudentLessonDetail, normalizePublishedObjectives } from '@/lib/lesson-artifacts/student-learning';

/**
 * What students would get if the teacher published now: the same manifest the
 * publish step builds from approved materials, with answers removed. Read only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { supabase, lesson } = await requireLessonManager(lessonId);
    const [{ data: objectives, error: objectiveError }, { data: artifacts, error: artifactError }] = await Promise.all([
      supabase.from('lesson_objectives').select('*').eq('lesson_id', lessonId).is('archived_at', null).order('position'),
      supabase.from('lesson_artifacts').select('*').eq('lesson_id', lessonId).eq('status', 'approved'),
    ]);
    if (objectiveError) throw objectiveError;
    if (artifactError) throw artifactError;

    const records = (artifacts ?? []).map(mapArtifactRow);
    const manifest = buildPublicationManifest({
      lesson: {
        id: lesson.id, title: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel ?? '',
        content: lesson.content, visualRevision: lesson.visual_revision ?? 1,
      },
      objectives: (objectives ?? []).map((objective) => ({
        id: objective.id, text: objective.text, position: objective.position, revision: objective.revision,
      })),
      artifacts: records,
    });
    const published = normalizePublishedObjectives(manifest.objectives) ?? [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const materials = Object.fromEntries(published.map((objective) => [
      objective.id,
      (objective.artifactIds ?? []).flatMap((id) => { const record = byId.get(id); return record ? [toStudentSafeArtifact(record)] : []; }),
    ]));

    return NextResponse.json({
      detail: buildStudentLessonDetail({
        publicationVersion: 0,
        manifest: { lesson: { id: lesson.id, title: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel ?? '', content: lesson.content }, objectives: published },
        artifacts: records.map((record) => ({ id: record.id, kind: record.kind })),
      }),
      materials,
      // The introduction publishing would use now, not the latest approved one.
      introduction: (() => { const record = manifest.lesson.introductionArtifactId ? byId.get(manifest.lesson.introductionArtifactId) : undefined; return record ? toStudentSafeArtifact(record) : null; })(),
      missing: missingPublicationIntroductions(manifest),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
