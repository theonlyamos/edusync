# PR 13 Review Fixes Design

## Goal

Close the three unresolved Codex findings from PR #13 without rewriting migrations that have already been applied. The changes must prevent unmetered content-job execution, preserve lesson organization ownership during ordinary edits, and restore valid deletion behavior for non-approved artifacts.

## Decisions

### Content jobs are read-only to authenticated database clients

Authenticated users may continue selecting jobs allowed by the existing ownership policy, but they may not insert, update, or delete `content_jobs` directly. A new forward migration will drop the authenticated insert and update policies and revoke write privileges from `anon` and `authenticated`.

All legitimate writes remain server-controlled. Bundle generation and regeneration enqueue through the service-role-only `enqueue_content_jobs_with_usage` RPC, upload extraction uses the service-role-only upload RPC, and cancellation/retry/worker transitions use the server-side service-role client. This keeps quota reservation and job creation atomic.

### Lesson organization changes are explicit and validated

An update that omits `organizationId` will not include `organization_id` in the database update, preserving the current owner. An explicit UUID or `null` remains supported for compatibility, but the route will validate it before mutation:

- a UUID must belong to an active organization membership for the authenticated user;
- `null` explicitly clears ownership;
- omission preserves ownership.

The edit form will omit `organizationId` because it does not expose an organization selector in edit mode. Creation will continue sending the selected organization.

### Artifact deletion uses the operation-appropriate trigger row

The forward migration will replace `prevent_approved_artifact_mutation()` in place. Approved artifacts will remain immutable. For other rows, the trigger returns `OLD` during `DELETE` and `NEW` during `UPDATE`, allowing draft/rejected artifact deletion and normal cascades while retaining approved-row protection.

## Migration Strategy

Create `supabase/migrations/0035_harden_lesson_artifact_writes.sql`. Do not edit migrations `0033` or `0034`, because they have already been applied. The migration will be idempotent where PostgreSQL supports it:

1. drop `content_jobs_insert_own` and `content_jobs_update_own` if present;
2. revoke `INSERT`, `UPDATE`, and `DELETE` on `content_jobs` from `anon` and `authenticated`;
3. replace the approved-artifact trigger function with operation-aware return behavior.

The existing trigger remains attached to the replaced function and does not need recreation.

## Application Changes

Extract a pure lesson-update mapper that converts the validated API payload to database column names and conditionally includes `organization_id`. The lesson PUT route will use that mapper and perform active-membership validation only when `organizationId` is explicitly supplied.

The lesson form will construct a shared payload for title, subject, grade, objectives, and content, then add `organizationId` only for lesson creation.

## Error Handling

- Explicit reassignment to an organization without active membership returns `403`.
- Database or membership-query errors retain the route's existing server-error behavior.
- Quota-enforced enqueue RPCs remain the only path for new generation jobs.
- Approved artifact updates and deletions continue raising the existing immutability error.

## Testing

Add regression coverage before production changes:

1. migration contract: authenticated write policies are removed and write privileges revoked;
2. migration contract: the delete trigger returns `OLD` while updates return `NEW`;
3. lesson update mapper: omission preserves the organization column, UUID includes it, and explicit `null` clears it;
4. route/form contract: explicit organization changes require membership validation and edit payloads omit `organizationId`;
5. full Vitest suite, TypeScript, targeted ESLint, and `git diff --check`.

Database-level behavior will also be checked when the migration is applied: authenticated direct job writes must fail, service-role RPC enqueue must succeed, draft deletion must succeed, and approved deletion must fail.

## Non-Goals

- Changing quota limits or categories.
- Allowing browser clients to mutate content-job state.
- Rewriting applied migration history.
- Changing approved-artifact immutability or publication immutability.
