import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase', 'migrations', '0033_objective_artifacts.sql');

describe('objective artifact migration', () => {
  it('creates the complete core persistence boundary with RLS enabled', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    for (const table of [
      'lesson_objectives',
      'lesson_assets',
      'lesson_asset_chunks',
      'lesson_artifacts',
      'lesson_publications',
      'learning_runs',
      'learning_events',
      'learning_quiz_keys',
      'content_jobs',
      'organization_ai_quotas',
      'organization_ai_usage',
      'learning_fallback_reservations',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain('add column if not exists current_publication_id');
    expect(sql).toContain('prevent_approved_artifact_mutation');
    expect(sql).toContain('prevent_published_asset_mutation');
    expect(sql).toContain('unique (run_id, request_id)');
    expect(sql).toContain('learning_event_instance_uidx');
    expect(sql).toContain('archived_at timestamptz');
    expect(sql).toContain('where archived_at is null');
    expect(sql).toContain('function public.save_lesson_objectives');
    expect(sql).toContain('function public.save_lesson_authoring');
    expect(sql).toContain('function public.create_lesson_draft');
    expect(sql).toContain('function public.claim_content_jobs');
    expect(sql).toContain('function public.insert_generated_lesson_artifact');
    expect(sql).toContain('function public.reserve_organization_ai_usage');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain("status = 'running' and lease_expires_at < now()");
    expect(sql).toContain('lesson_artifacts_generation_job_uidx');
    expect(sql).toContain('function public.enqueue_content_jobs_with_usage');
    expect(sql).toContain('function public.create_uploaded_lesson_artifact');
    expect(sql).toContain('function public.publish_lesson_manifest');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('function public.reserve_learning_fallback');
  });
});
