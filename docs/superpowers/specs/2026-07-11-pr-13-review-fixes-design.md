# PR 13 Review Fixes Design

## Goal

Close the three unresolved Codex findings from PR #13 without rewriting migrations that have already been applied. The changes must prevent unmetered content-job execution, preserve lesson organization ownership during ordinary edits, and restore valid deletion behavior for non-approved artifacts.

## Decisions

### Content jobs are read-only to authenticated database clients

Authenticated users may continue selecting jobs allowed by the existing ownership policy, but they may not insert, update, or delete `content_jobs` directly. A new forward migration will drop the authenticated insert and update policies, revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`, then grant only `SELECT` back to `authenticated`. Direct `service_role` access remains available for trusted server operations.

All legitimate writes remain server-controlled. Bundle generation and regeneration enqueue through the service-role-only `enqueue_content_jobs_with_usage` RPC, upload extraction uses the service-role-only upload RPC, and cancellation/retry/worker transitions use the server-side service-role client. This keeps quota reservation and job creation atomic.

The migration will reassert that content-job-mutating RPCs are executable only by `service_role`. Existing quota semantics stay unchanged: a reservation belongs to the organization recorded when the job is enqueued, and retries of that reserved job do not reserve quota again.

### Lesson organization changes are explicit and validated

An update that omits `organizationId` will not include `organization_id` in the database update, preserving the current owner. Explicit reassignment accepts a UUID only; `null` is rejected so an organization-owned lesson cannot be detached to bypass future quota attribution.

- omission preserves ownership and performs no membership lookup;
- supplying the existing UUID is a no-op and preserves ownership;
- a different UUID requires the teacher to be an active `owner` or `admin` in both the current organization, when present, and the target organization;
- a global administrator may reassign without organization membership;
- malformed UUIDs and `null` return `400` without mutating the lesson.

The edit form will omit `organizationId` because it does not expose an organization selector in edit mode. Creation will continue sending the selected organization.

The route-level check provides clear HTTP errors, while a `BEFORE UPDATE OF organization_id` database trigger enforces the same rule atomically for direct authenticated updates. The trigger also verifies `can_manage_lesson(OLD.id)`. `service_role` is exempt so trusted administrative maintenance remains possible. Reassignment affects future jobs only; already-reserved jobs retain their original organization and usage ledger.

Because the final update intentionally uses the authenticated client, the migration will also normalize lesson manager RLS and make lesson updates column-scoped. It will clear both table-level and every existing column-level authenticated `UPDATE` grant before granting the exact allowlist: `title`, `subject`, `gradelevel`, `objectives`, `content`, `organization_id`, and `updated_at`. Legacy `teacher`, normalized `teacher_id`, `current_publication_id`, and every other system field remain service-role-only. Authenticated global administrators receive no protected-column exception; intentional ownership or publication-pointer maintenance must use a trusted service path, not direct authenticated SQL.

### Artifact deletion uses the operation-appropriate trigger row

The forward migration will replace `prevent_approved_artifact_mutation()` in place. Approved artifacts will remain immutable. For other rows, the trigger returns `OLD` during `DELETE` and `NEW` during `UPDATE`, allowing draft/rejected artifact deletion and normal cascades while retaining approved-row protection.

## Migration Strategy

Create `supabase/migrations/0035_harden_lesson_artifact_writes.sql`. Do not edit migrations `0033` or `0034`, because they have already been applied. Wrap the complete migration in an explicit transaction so any failure rolls back every ACL, policy, function, and trigger change. The migration will be idempotent where PostgreSQL supports it:

1. drop `content_jobs_insert_own` and `content_jobs_update_own` if present;
2. revoke all `content_jobs` privileges from `PUBLIC`, `anon`, and `authenticated`, grant `SELECT` to `authenticated`, and explicitly retain trusted `service_role` writes;
3. reassert service-role-only execution grants for job-mutating RPCs;
4. enable lesson RLS, remove every existing browser-applicable write policy regardless of name, recreate only normalized manager select/update/delete policies, revoke table-level and all current column-level lesson updates from browser roles, and grant authenticated only the exact editable-column allowlist;
5. add the lesson-organization guard trigger described above;
6. replace the approved-artifact trigger function with explicit `RETURN OLD` for `DELETE` and `RETURN NEW` for `UPDATE`.

The migration will drop and recreate both triggers idempotently so environments with schema drift end in the same state.

## Application Changes

Extract a pure lesson-update mapper that converts the validated API payload to database column names and conditionally includes `organization_id`. The lesson PUT route will use that mapper, compare an explicit organization with the persisted value, and query source/target memberships only for a real reassignment. Membership reads use the trusted server client after the route has authenticated and authorized the lesson manager. The final update continues through the authenticated user client so the database trigger evaluates the real actor and remains the atomic enforcement boundary.

The lesson form will construct a shared payload for title, subject, grade, objectives, and content, then add `organizationId` only for lesson creation.

## Error Handling

- Malformed or `null` organization reassignment returns `400`.
- Reassignment without the required source or target role returns `403`.
- A database `42501` maps to the transfer-specific `403` only when the request attempted a real organization change and the error message matches a known organization-guard rejection. Other `42501` errors retain generic server-error handling.
- A membership-query failure returns `500`; no lesson update is attempted.
- Other database errors retain the route's existing server-error behavior.
- Quota-enforced enqueue RPCs remain the only path for new generation jobs.
- Approved artifact updates and deletions continue raising the existing immutability error.

## Testing

Add regression coverage before production changes. Source-substring assertions may supplement these tests but cannot be the sole proof of behavior.

1. lesson update mapper: use `Object.hasOwn` to prove omission excludes `organization_id`, while an explicit UUID includes it;
2. route behavior: omission and same-ID updates skip membership lookup; authorized reassignment succeeds; malformed/null, inactive, missing, or insufficient-role memberships fail before update; global-admin behavior is explicit; a non-transfer `42501` is not mislabeled as an organization denial;
3. form payload behavior: creation includes `organizationId`, editing omits it;
4. migration catalog checks: content-job write policies are absent from `pg_policies`, authenticated content-job write privileges are false, authenticated `SELECT` remains true, service-role writes remain true, mutating RPC execute privileges are service-role-only, lesson RLS is enabled, legacy lesson manager policies are absent, and authenticated lesson UPDATE privileges match the editable-column allowlist exactly;
5. content-job behavior: authenticated own-row `INSERT`, `UPDATE`, and `DELETE` fail, authorized `SELECT` succeeds, and service-role enqueue/cancel/retry/worker/upload paths still succeed;
6. artifact behavior: draft/rejected deletes remove rows, draft updates persist, approved update/delete operations raise, and a non-approved parent cascade completes;
7. migration paths: an isolated database provisioned from the operator's canonical `0034` schema baseline and an isolated `0034` upgrade clone both reach the same privileges, policies, functions, and triggers after `0035`; raw historical replay is a separate migration-governance issue because migration `0021` currently indexes nonexistent `teacherid` columns;
8. project gates: targeted tests, full Vitest, `tsc --noEmit`, targeted ESLint, and `git diff --check` all complete with zero failures or errors.

The repository does not currently include a disposable Supabase test harness. CI will cover pure helpers, route orchestration, form payloads, and migration source contracts. Before merge, two operator-provided isolated databases still at `0034`—an empty schema-only canonical baseline and a representative upgrade-state clone—must independently apply `0035` and pass the checked-in catalog and rollback-only DML verifier. If either environment is unavailable, database verification is blocked and the change is not merge-ready. Full DML verification never runs on shared staging or production because `claim_content_jobs` claims globally; shared targets run catalog-only verification.

## Rollout and Recovery

Deploy the omission-aware lesson route and form together before applying migration `0035`. The current route and form both materialize `organization_id = null`, so migration-first deployment would make ordinary lesson edits fail as soon as the null-rejecting trigger is active. During this short compatibility window, ordinary edits are safe; explicit organization reassignment is not considered released until `0035` is applied.

Immediately apply `0035`, run catalog-only verification on the shared target, verify service-role bundle generation/regeneration/upload/cancellation/worker paths, then exercise omission plus authorized and denied reassignment. Monitor permission errors, lesson PUT status rates, and queued jobs that stop progressing.

Before `0035`, the compatibility application deploy may be rolled back normally. After `0035`, do not roll back to the old route/form because that recreates an edit outage; recovery is forward-only with a corrected application or migration. Never restore authenticated job writes, broad lesson-column updates, null organization detachment, or the broken delete-trigger return.

## Non-Goals

- Changing quota limits or categories.
- Allowing browser clients to mutate content-job state.
- Rewriting applied migration history.
- Changing approved-artifact immutability or publication immutability.
- Building a general organization-transfer UI or changing quota ownership for jobs already reserved.
