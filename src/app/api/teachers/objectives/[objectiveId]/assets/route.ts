import { createHash, randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';

import { processContentJobBatch } from '@/lib/lesson-artifacts/job-processor.server';
import { drainContentWorker } from '@/lib/lesson-artifacts/content-worker-runtime';
import { validateLessonMedia, validateLessonMediaBytes } from '@/lib/lesson-artifacts/media';
import {
  lessonArtifactErrorResponse,
  LessonArtifactHttpError,
  requireLessonManager,
} from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(request: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const { objectiveId } = await params;
    const supabase = createServerSupabase();
    const { data: objective, error: objectiveError } = await supabase.from('lesson_objectives').select('*').eq('id', objectiveId).maybeSingle();
    if (objectiveError) throw objectiveError;
    if (!objective || objective.archived_at) throw new LessonArtifactHttpError(404, 'Objective not found');
    const { session, lesson } = await requireLessonManager(objective.lesson_id);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new LessonArtifactHttpError(400, 'A file is required');
    const title = String(form.get('title') || file.name).trim().slice(0, 160);
    const { extension, mimeType } = validateLessonMedia(file);
    const bytes = Buffer.from(await file.arrayBuffer());
    validateLessonMediaBytes(bytes, mimeType);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const storagePath = `${lesson.id}/${objective.id}/${randomUUID()}.${extension}`;
    const assetId = randomUUID();
    const artifactId = randomUUID();
    const jobId = randomUUID();
    const batchId = randomUUID();
    const { data: lastArtifact, error: positionError } = await supabase
      .from('lesson_artifacts')
      .select('position')
      .eq('objective_id', objective.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw positionError;
    const position = (lastArtifact?.position ?? -1) + 1;
    const caption = String(form.get('caption') || '').trim() || null;

    const { error: uploadError } = await supabase.storage.from('lesson-assets').upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const assetRow = {
      id: assetId, lesson_id: lesson.id, objective_id: objective.id, asset_type: 'uploaded_media',
      storage_bucket: 'lesson-assets', storage_path: storagePath, mime_type: mimeType,
      byte_size: bytes.byteLength, checksum_sha256: checksum, original_filename: file.name,
      alt_text: title, caption, processing_status: 'processing',
    };
    const artifactRow = {
      id: artifactId, lesson_id: lesson.id, objective_id: objective.id,
      objective_revision: objective.revision, kind: 'uploaded_media', position,
      payload: {
        kind: 'uploaded_media', assetId, title, caption: caption ?? undefined,
        mimeType, originalFilename: file.name,
      },
    };
    const jobRow = {
      id: jobId, batch_id: batchId, lesson_id: lesson.id, objective_id: objective.id,
      job_type: 'extract_media', idempotency_key: `extract:${assetId}`,
      input: {
        lessonTitle: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradelevel,
        objectiveText: objective.text, objectiveRevision: objective.revision,
        position, assetId,
      },
    };
    const { data: created, error: createError } = await supabase.rpc('create_uploaded_lesson_artifact', {
      p_organization_id: lesson.organization_id,
      p_user_id: session.user.id,
      p_usage_reference: `upload:${objective.id}:${checksum}`,
      p_asset: assetRow,
      p_artifact: artifactRow,
      p_job: jobRow,
    });
    if (createError) {
      const { error: cleanupError } = await supabase.storage.from('lesson-assets').remove([storagePath]);
      if (cleanupError) console.error('Could not remove failed lesson upload:', cleanupError);
      throw createError;
    }
    const result = created as { asset: Record<string, unknown>; artifact: Record<string, unknown>; job: Record<string, unknown> };
    after(async () => {
      await drainContentWorker({ workerId: `upload:${batchId}`, processBatch: processContentJobBatch, batchLimit: 1 })
        .catch((error) => console.error('Lesson media extraction failed:', error));
    });
    return NextResponse.json({ ...result, batchId }, { status: 202 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
