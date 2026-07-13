import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0035_harden_lesson_artifact_writes.sql',
);

describe('lesson artifact write hardening migration', () => {
  it('wraps all hardening changes in one transaction', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).trim();

    expect(sql).toMatch(/^BEGIN;/i);
    expect(sql).toMatch(/COMMIT;$/i);
  });

  it('limits content-job writes and mutating RPCs to service_role', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    expect(sql).toMatch(/drop policy if exists content_jobs_insert_own on public\.content_jobs;/);
    expect(sql).toMatch(/drop policy if exists content_jobs_update_own on public\.content_jobs;/);
    expect(sql).toMatch(/revoke all on table public\.content_jobs from public, anon, authenticated;/);
    expect(sql).toMatch(/grant select on table public\.content_jobs to authenticated;/);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.content_jobs to service_role;/);

    for (const signature of [
      'claim_content_jobs(text, integer, integer)',
      'enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb)',
      'create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb)',
    ]) {
      const escaped = signature.replace(/[()]/g, '\\$&').replace(/ /g, '\\s*');
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${escaped} from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${escaped} to service_role;`));
    }
  });

  it('replaces browser lesson write policies with normalized manager controls', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    expect(sql).toContain('alter table public.lessons enable row level security;');
    expect(sql).toMatch(/from pg_policies[\s\S]*tablename = 'lessons'[\s\S]*cmd in \('all', 'insert', 'update', 'delete'\)[\s\S]*public[\s\S]*anon[\s\S]*authenticated/);
    expect(sql).toMatch(/execute format\('drop policy %i on public\.lessons', lesson_policy\.policyname\);/);
    expect(sql).toMatch(/create policy lessons_manager_select on public\.lessons[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.can_manage_lesson\(id\)\)/);
    expect(sql).toMatch(/create policy lessons_manager_update on public\.lessons[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(public\.can_manage_lesson\(id\)\)[\s\S]*with check \(public\.can_assign_lesson_teacher\(teacher_id\)\)/);
    expect(sql).toMatch(/create policy lessons_manager_delete on public\.lessons[\s\S]*for delete[\s\S]*to authenticated[\s\S]*using \(public\.can_manage_lesson\(id\)\)/);
    expect(sql).not.toMatch(/create policy[\s\S]{0,120}on public\.lessons[\s\S]{0,120}for insert[\s\S]{0,120}to authenticated/);
    const assignmentFunction = sql.match(
      /create or replace function public\.can_assign_lesson_teacher\(p_teacher_id uuid\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/,
    )?.[1];

    expect(assignmentFunction).toBeDefined();
    expect(assignmentFunction).toMatch(/public\.users u[\s\S]*u\.id = auth\.uid\(\)[\s\S]*u\.role = 'admin'/);
  });

  it('allows authenticated lesson updates only for the safe column allowlist', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    expect(sql).toMatch(/revoke update on table public\.lessons from public, anon, authenticated;/);
    expect(sql).toMatch(/from information_schema\.column_privileges[\s\S]*privilege_type = 'update'[\s\S]*grantee in \('public', 'anon', 'authenticated'\)/);
    expect(sql).toMatch(/revoke update \(%i\) on table public\.lessons from %s/);
    expect(sql).toMatch(/grant update \(title, subject, gradelevel, objectives, content, organization_id, updated_at\)\s+on table public\.lessons to authenticated;/);
    expect(sql).not.toMatch(/grant update on table public\.lessons to authenticated;/);
    expect(sql).not.toMatch(/grant update \([^)]*(teacher|teacher_id|current_publication_id)[^)]*\) on table public\.lessons to authenticated;/);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.lessons to service_role;/);
  });

  it('guards lesson organization reassignment with source and target membership checks', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    expect(sql).toMatch(/create or replace function public\.prevent_invalid_lesson_organization_reassignment\(\)/);
    expect(sql).toMatch(/raise exception using\s+errcode = '42501',\s+message = 'lesson organization cannot be cleared'/);
    expect(sql).toContain('not authorized to reassign lesson organization');
    expect(sql).toContain('active owner or admin membership in current organization is required');
    expect(sql).toContain('active owner or admin membership in target organization is required');
    expect(sql).toMatch(/if old\.organization_id is not distinct from new\.organization_id then[\s\S]*return new;/);
    expect(sql).toMatch(/if auth\.role\(\) = 'service_role' then[\s\S]*return new;/);
    expect(sql).toMatch(/if not public\.can_manage_lesson\(old\.id\) then/);
    expect(sql).toMatch(/m\.role in \('owner', 'admin'\)[\s\S]*m\.is_active = true/);
    expect(sql).toMatch(/drop trigger if exists lessons_organization_reassignment_guard on public\.lessons;/);
    expect(sql).toMatch(/create trigger lessons_organization_reassignment_guard[\s\S]*before update of organization_id on public\.lessons/);
  });

  it('returns the correct row for non-approved artifact updates and deletes', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

    expect(sql).toMatch(/create or replace function public\.prevent_approved_artifact_mutation\(\)/);
    expect(sql).toMatch(/raise exception using\s+errcode = 'p0001',\s+message = 'approved lesson artifacts are immutable; create a new version'/);
    expect(sql).toMatch(/if tg_op = 'delete' then[\s\S]*return old;[\s\S]*end if;[\s\S]*return new;/);
    expect(sql).toMatch(/drop trigger if exists lesson_artifacts_approved_immutable on public\.lesson_artifacts;/);
    expect(sql).toMatch(/create trigger lesson_artifacts_approved_immutable[\s\S]*before update or delete on public\.lesson_artifacts/);
  });
});
