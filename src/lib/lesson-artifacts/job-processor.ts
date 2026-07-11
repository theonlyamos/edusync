import { createHash, randomUUID } from 'node:crypto';

import { generateAICompletion } from '@/lib/ai';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { runVisualizeGeneration } from '@/lib/visualize-ai-task';

import { generateGeminiLessonImage } from './image-provider';
import { splitGroundingText } from './media';
import { embedGroundingTexts, extractMediaText } from './media-provider';
import {
  buildArtifactInsert,
  generateArtifactPayload,
  nextFailureStatus,
  type ContentJobRecord,
  type ContentJobType,
} from './jobs';

type DatabaseJob = {
  id: string;
  lesson_id: string;
  objective_id: string;
  requested_by: string;
  job_type: ContentJobType;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string;
  input: ContentJobRecord['input'];
};

function toContentJob(row: DatabaseJob): ContentJobRecord {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    objectiveId: row.objective_id,
    requestedBy: row.requested_by,
    jobType: row.job_type,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    input: row.input,
  };
}

const extensionFor = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

async function generateAndStoreImage(job: ContentJobRecord, prompt: string) {
  const generated = await generateGeminiLessonImage(prompt);
  const supabase = createAdminSupabase();
  const storagePath = `${job.lessonId}/${job.objectiveId}/${randomUUID()}.${extensionFor(generated.mimeType)}`;
  const { error: uploadError } = await supabase.storage
    .from('lesson-assets')
    .upload(storagePath, generated.bytes, { contentType: generated.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const altText = `Educational illustration for: ${job.input.objectiveText}`;
  const { data: asset, error: assetError } = await supabase
    .from('lesson_assets')
    .insert({
      lesson_id: job.lessonId,
      objective_id: job.objectiveId,
      asset_type: 'generated_image',
      storage_bucket: 'lesson-assets',
      storage_path: storagePath,
      mime_type: generated.mimeType,
      byte_size: generated.bytes.byteLength,
      checksum_sha256: createHash('sha256').update(generated.bytes).digest('hex'),
      alt_text: altText,
      caption: generated.caption,
      created_by: job.requestedBy,
    })
    .select('id')
    .single();
  if (assetError) {
    await supabase.storage.from('lesson-assets').remove([storagePath]);
    throw assetError;
  }
  return { assetId: asset.id, altText, caption: generated.caption, aspectRatio: '4:3' as const };
}

export async function processClaimedContentJob(row: DatabaseJob) {
  const supabase = createAdminSupabase();
  const job = toContentJob(row);
  if (!row.lease_owner) throw new Error('Claimed content job has no lease owner');
  const heartbeat = setInterval(() => {
    void supabase.from('content_jobs').update({
      lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    }).eq('id', job.id).eq('status', 'running').eq('lease_owner', row.lease_owner);
  }, 60_000);
  heartbeat.unref?.();

  const finishOwnedJob = async (update: Record<string, unknown>) => {
    const { data, error } = await supabase.from('content_jobs').update(update)
      .eq('id', job.id)
      .eq('status', 'running')
      .eq('lease_owner', row.lease_owner)
      .gt('lease_expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Content job lease was lost before completion');
  };
  try {
    if (job.jobType === 'extract_media' || job.jobType === 'embed_media') {
      if (!job.input.assetId) throw new Error('Media job is missing assetId');
      const { data: asset, error: assetError } = await supabase
        .from('lesson_assets')
        .select('*')
        .eq('id', job.input.assetId)
        .single();
      if (assetError) throw assetError;
      const { data: downloaded, error: downloadError } = await supabase.storage
        .from(asset.storage_bucket)
        .download(asset.storage_path);
      if (downloadError) throw downloadError;
      const extracted = await extractMediaText(
        Buffer.from(await downloaded.arrayBuffer()),
        asset.mime_type,
        asset.original_filename ?? 'lesson media',
      );
      const allChunks = splitGroundingText(extracted);
      const chunks = allChunks.slice(0, 250);
      const rows = [];
      for (let start = 0; start < chunks.length; start += 20) {
        const batch = chunks.slice(start, start + 20);
        const embeddings = await embedGroundingTexts(batch.map((chunk) => chunk.text));
        rows.push(...batch.map((chunk, index) => ({
            asset_id: asset.id,
            lesson_id: asset.lesson_id,
            objective_id: asset.objective_id,
            position: chunk.position,
            content: chunk.text,
            embedding: embeddings[index],
            metadata: { filename: asset.original_filename, mimeType: asset.mime_type, truncated: allChunks.length > chunks.length },
          })));
      }
      const { error: clearError } = await supabase.from('lesson_asset_chunks').delete().eq('asset_id', asset.id);
      if (clearError) throw clearError;
      const { error: chunkError } = await supabase.from('lesson_asset_chunks').insert(rows);
      if (chunkError) throw chunkError;
      const { error: readyError } = await supabase.from('lesson_assets').update({ processing_status: 'ready', processing_error: null }).eq('id', asset.id);
      if (readyError) throw readyError;
      await finishOwnedJob({
        status: 'succeeded', asset_id: asset.id, output: { assetId: asset.id, chunkCount: chunks.length },
        lease_owner: null, lease_expires_at: null, completed_at: new Date().toISOString(),
      });
      return { jobId: job.id, assetId: asset.id, status: 'succeeded' as const };
    }

    const { data: existingArtifact, error: existingError } = await supabase
      .from('lesson_artifacts')
      .select('id,kind')
      .contains('generation_metadata', { jobId: job.id })
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingArtifact) {
      await finishOwnedJob({
        status: 'succeeded', artifact_id: existingArtifact.id,
        output: { artifactId: existingArtifact.id, kind: existingArtifact.kind, recovered: true },
        lease_owner: null, lease_expires_at: null, completed_at: new Date().toISOString(),
      });
      return { jobId: job.id, artifactId: existingArtifact.id, status: 'succeeded' as const };
    }

    const payload = await generateArtifactPayload(job, {
      visualize: async (taskDescription) => runVisualizeGeneration({
        task_description: taskDescription,
        panel_dimensions: { width: 704, height: 504 },
        theme: 'light',
      }),
      generateText: async (systemPrompt, userPrompt) => {
        const result = await generateAICompletion(systemPrompt, userPrompt, undefined, true, 0.3);
        if (!result) throw new Error('The text model returned an empty response');
        return result;
      },
      generateImage: async (prompt) => generateAndStoreImage(job, prompt),
    });

    const insert = buildArtifactInsert(job, payload);
    const { data: artifact, error: artifactError } = await supabase.rpc('insert_generated_lesson_artifact', {
      p_lesson_id: insert.lesson_id,
      p_objective_id: insert.objective_id,
      p_objective_revision: insert.objective_revision,
      p_kind: insert.kind,
      p_position: insert.position,
      p_payload: insert.payload,
      p_validation_report: insert.validation_report,
      p_generation_metadata: insert.generation_metadata,
      p_created_by: insert.created_by,
      p_series_id: job.input.seriesId ?? null,
      p_supersedes_id: job.input.supersedesId ?? null,
    });
    if (artifactError) throw artifactError;

    await finishOwnedJob({
        status: 'succeeded',
        artifact_id: artifact.id,
        output: { artifactId: artifact.id, kind: payload.kind },
        lease_owner: null,
        lease_expires_at: null,
        completed_at: new Date().toISOString(),
      });
    return { jobId: job.id, artifactId: artifact.id, status: 'succeeded' as const };
  } catch (error) {
    const status = nextFailureStatus(job.attemptCount, job.maxAttempts);
    const { data: failedClaim } = await supabase
      .from('content_jobs')
      .update({
        status,
        error: error instanceof Error ? error.message : 'Unknown content generation error',
        lease_owner: null,
        lease_expires_at: null,
        completed_at: status === 'failed' ? new Date().toISOString() : null,
      })
      .eq('id', job.id)
      .eq('status', 'running')
      .eq('lease_owner', row.lease_owner)
      .gt('lease_expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (failedClaim && job.input.assetId && status === 'failed') {
      await supabase.from('lesson_assets').update({
        processing_status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown media processing error',
      }).eq('id', job.input.assetId);
    }
    return { jobId: job.id, status, error };
  } finally {
    clearInterval(heartbeat);
  }
}

export async function processContentJobBatch(workerId: string, limit = 5) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc('claim_content_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 300,
  });
  if (error) throw error;
  return Promise.all((data ?? []).map((row: DatabaseJob) => processClaimedContentJob(row)));
}
