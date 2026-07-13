# PR 13 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three unresolved PR #13 review findings by making content jobs server-write-only, preserving and authorizing lesson organization ownership, and restoring deletion of non-approved lesson artifacts.

**Architecture:** Put request-shape and organization-transfer decisions in a small, side-effect-free lesson-update module, while the lesson route remains the I/O coordinator. Keep the final lesson mutation on the authenticated Supabase client and use a service-role client only to read membership evidence. Add a forward-only `0035` migration as the atomic database boundary for job privileges, organization reassignment, and artifact immutability, plus split prerequisite, catalog, and rollback-only DML verification driven by a fail-closed PowerShell runner.

**Tech Stack:** Next.js 16, TypeScript 5.9, Zod 3, Supabase/PostgreSQL RLS and trigger functions, Vitest 4, pnpm 10, PowerShell/psql rollout commands.

**Approved design:** `docs/superpowers/specs/2026-07-11-pr-13-review-fixes-design.md`

## Global Constraints

- Do not modify already-applied migrations `0033_objective_artifacts.sql` or `0034_normalize_lesson_teacher_ownership.sql`.
- Authenticated and anonymous database roles must never regain direct `INSERT`, `UPDATE`, or `DELETE` access to `content_jobs`.
- Omitted `organizationId` preserves ownership; explicit `null` and malformed UUIDs are rejected; edit mode must omit the property entirely.
- A real teacher reassignment requires active `owner` or `admin` membership in the current organization, when present, and the target organization. A global admin is exempt from membership checks.
- The route may use `createServerSupabase()` only for trusted membership reads. The final lesson update must use `createSSRUserSupabase()` so the database trigger sees the authenticated actor.
- Authenticated lesson updates have no table-level `UPDATE` grant. Their exact column allowlist is `title`, `subject`, `gradelevel`, `objectives`, `content`, `organization_id`, and `updated_at`; authenticated global admins receive no protected-column exception.
- Existing job reservations remain attributed to their original organization. No backfill or transfer of queued/running jobs is in scope.
- Source-contract tests supplement behavioral tests; they are not the sole proof of route or database behavior.
- Apply each production change only after its focused regression test fails for the expected reason.
- Both isolated PostgreSQL runner modes (`canonical` and `upgrade`) are mandatory pre-merge gates. Missing database access is a blocked verification result, not permission to merge on source tests alone.

## Planning Discoveries and Scope Boundaries

- The raw historical migration chain is not replayable: `0021_add_teacherid_to_lessons_assessments.sql` creates `teacher_id` but indexes nonexistent `teacherid` columns. This task must not rewrite that applied file. Database gates therefore start from an operator-provided empty canonical schema baseline at `0034` and a separate representative upgrade-state clone at `0034`, then independently apply `0035`. Repairing historical replay or checking in a new baseline is a separate migration-governance decision.
- `enable_rls_migration.sql` contains legacy `lessons.teacher`/`admins` manager policies and broad authenticated updates. Migration `0035` must replace those policies with normalized manager policies and replace table-level lesson `UPDATE` with explicit editable-column grants.
- `claim_content_jobs` claims globally, not by fixture ID. Full DML verification is allowed only on an isolated disposable database with no pre-existing queued/running jobs. Shared staging and production may run catalog-only verification, never the claim/DML matrix.

---

### Task 1: Define lesson-update and transfer policy as testable functions

**Files:**
- Create: `src/lib/lesson-update.ts`
- Create: `src/lib/lesson-artifacts/__tests__/lesson-update.test.ts`

**Interfaces:**
- Produces: `updateLessonSchema` and `LessonUpdateInput`.
- Produces: `mapLessonUpdate(input, updatedAt)` with conditional `organization_id` ownership.
- Produces: `requiredOrganizationAdminIds(input)` and `hasRequiredOrganizationAdminMemberships(requiredIds, memberships)`.
- Produces: `isLessonOrganizationGuardError(error, organizationChangeRequested)` for narrow database-error classification.
- Consumes: the existing API fields `title`, `subject`, `gradeLevel`, `objectives`, `content`, and optional non-null `organizationId`.

- [ ] **Step 1: Write the failing schema and mapper tests**

Cover valid omission and UUID values, then assert `null` and malformed values fail parsing. Prove ownership with `Object.hasOwn`, not only value equality:

```ts
const common = {
  title: 'Fractions',
  subject: 'Mathematics',
  gradeLevel: 'JHS 1',
  objectives: ['Compare fractions'],
  content: 'Lesson body',
};

const omitted = mapLessonUpdate(updateLessonSchema.parse(common), '2026-07-12T10:00:00.000Z');
expect(Object.hasOwn(omitted, 'organization_id')).toBe(false);

const explicit = mapLessonUpdate(
  updateLessonSchema.parse({ ...common, organizationId: '11111111-1111-4111-8111-111111111111' }),
  '2026-07-12T10:00:00.000Z',
);
expect(explicit.organization_id).toBe('11111111-1111-4111-8111-111111111111');
expect(Object.hasOwn(mapLessonUpdate({ ...common, organizationId: undefined }, '2026-07-12T10:00:00.000Z'), 'organization_id')).toBe(false);
expect(() => updateLessonSchema.parse({ ...common, organizationId: null })).toThrow();
expect(() => updateLessonSchema.parse({ ...common, organizationId: 'not-a-uuid' })).toThrow();
```

- [ ] **Step 2: Write the failing organization-authorization matrix**

Test these states before implementation:

| Actor/update | Required IDs | Membership result |
|---|---:|---|
| Teacher, property omitted | `[]` | no lookup required |
| Teacher, same UUID | `[]` | no lookup required |
| Global admin, real change | `[]` | membership bypass |
| Teacher, null current to target | target only | active target owner/admin required |
| Teacher, source to target | source and target | both active owner/admin required |
| Inactive, `member`, or missing row | unchanged required IDs | rejected |

Use role strings from `DBOrganizationMember` and include owner-success, admin-success, mixed-role success, missing-source, missing-target, inactive, and ordinary-member cases.

Add error-classification cases:

```ts
expect(isLessonOrganizationGuardError(
  { code: '42501', message: 'Active owner or admin membership in target organization is required' },
  true,
)).toBe(true);
expect(isLessonOrganizationGuardError(
  { code: '42501', message: 'permission denied for table lessons' },
  true,
)).toBe(false);
expect(isLessonOrganizationGuardError(
  { code: '42501', message: 'Active owner or admin membership in target organization is required' },
  false,
)).toBe(false);
```

- [ ] **Step 3: Verify the new test fails**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update.test.ts
```

Expected: FAIL because `@/lib/lesson-update` does not exist.

- [ ] **Step 4: Implement the minimal policy module**

Keep the Zod schema non-nullable and use an allowlisted database row:

```ts
export const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(120),
  gradeLevel: z.string().trim().min(1).max(80),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  content: z.string().max(100_000).nullable().default(null),
  organizationId: z.string().uuid().optional(),
});

export type LessonUpdateInput = z.infer<typeof updateLessonSchema>;

export function mapLessonUpdate(input: LessonUpdateInput, updatedAt: string) {
  const row: {
    title: string;
    subject: string;
    gradelevel: string;
    objectives: string[];
    content: string | null;
    updated_at: string;
    organization_id?: string;
  } = {
    title: input.title,
    subject: input.subject,
    gradelevel: input.gradeLevel,
    objectives: input.objectives,
    content: input.content,
    updated_at: updatedAt,
  };
  if (Object.hasOwn(input, 'organizationId') && input.organizationId !== undefined) {
    row.organization_id = input.organizationId;
  }
  return row;
}
```

Define the transfer helpers with these exact boundaries so omission remains distinguishable from a supplied value:

```ts
export type OrganizationAdminMembership = Pick<
  DBOrganizationMember,
  'organization_id' | 'role' | 'is_active'
>;
```

Implement the exact function signatures and bodies below without I/O:

```ts
export function requiredOrganizationAdminIds(input: {
  actorRole: string | null;
  currentOrganizationId: string | null;
  update: Pick<LessonUpdateInput, 'organizationId'>;
}): string[] {
  if (!Object.hasOwn(input.update, 'organizationId')) return [];
  const target = input.update.organizationId;
  if (!target || target === input.currentOrganizationId || input.actorRole === 'admin') return [];
  return [...new Set([input.currentOrganizationId, target].filter((id): id is string => Boolean(id)))];
}

export function hasRequiredOrganizationAdminMemberships(
  requiredIds: string[],
  memberships: OrganizationAdminMembership[],
): boolean {
  return requiredIds.every((organizationId) => memberships.some((membership) => (
    membership.organization_id === organizationId
    && membership.is_active
    && (membership.role === 'owner' || membership.role === 'admin')
  )));
}

const LESSON_ORGANIZATION_GUARD_MESSAGES = new Set([
  'Not authorized to reassign lesson organization',
  'Lesson organization cannot be cleared',
  'Active owner or admin membership in current organization is required',
  'Active owner or admin membership in target organization is required',
]);

export function isLessonOrganizationGuardError(
  error: unknown,
  organizationChangeRequested: boolean,
): boolean {
  if (!organizationChangeRequested || typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === '42501'
    && typeof candidate.message === 'string'
    && LESSON_ORGANIZATION_GUARD_MESSAGES.has(candidate.message);
}
```

This returns deduplicated IDs only for real teacher reassignments and treats typed `organizationId: undefined` as omission. Import `DBOrganizationMember` with `import type` so the module has no database/runtime dependency.

- [ ] **Step 5: Verify Task 1**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update.test.ts
pnpm typecheck
```

Expected: PASS; omission, UUID inclusion, no-op/admin lookup bypass, and the full membership matrix are deterministic.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/lib/lesson-update.ts src/lib/lesson-artifacts/__tests__/lesson-update.test.ts
git commit -m "feat(lessons): define update policy"
```

---

### Task 2: Make the lesson PUT route preserve ownership and preauthorize transfers

**Files:**
- Modify: `src/app/api/lessons/[lessonId]/route.ts`
- Create: `src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts`
- Modify: `src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts`

**Interfaces:**
- Consumes: `updateLessonSchema`, `mapLessonUpdate`, `requiredOrganizationAdminIds`, and `hasRequiredOrganizationAdminMemberships` from `@/lib/lesson-update`.
- Consumes: authenticated user client from `createSSRUserSupabase()` and trusted membership reader from `createServerSupabase()`.
- Produces: `400` for invalid/null organization input, `403` for insufficient transfer authority, `500` for membership-read failures, and no lesson mutation on any of those failures.

- [ ] **Step 1: Build a failing route-test harness**

Use `vi.mock` for `@/lib/auth` and `@/lib/supabase.server`. Provide separate fluent query doubles for:

- the authenticated lesson lookup, teacher lookup, and final update;
- the trusted `organization_members` lookup;
- update call tracking so rejected requests can assert `.update()` was never called.

Call `PUT` with a `Request` cast to the route's accepted request type and `{ params: Promise.resolve({ lessonId: 'lesson-1' }) }`.

Use a thenable chain so the route can await any terminal Supabase call without teaching the test every implementation detail:

```ts
function queryResult<T>(result: T) {
  const chain: Record<string, any> = {};
  for (const method of ['select', 'eq', 'in', 'update', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  );
  return chain;
}

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  createSSRUserSupabase: vi.fn(),
  createServerSupabase: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/supabase.server', () => ({
  createSSRUserSupabase: mocks.createSSRUserSupabase,
  createServerSupabase: mocks.createServerSupabase,
}));
```

Reset mocks and modules before each case, configure table-specific query queues, then dynamically import the route. Never import the route before mocks are installed.

- [ ] **Step 2: Write the failing route behavior matrix**

Add focused tests for:

1. omitted `organizationId`: trusted client is never created and the update row does not own `organization_id`;
2. same organization UUID: trusted membership query is skipped;
3. teacher with active source/target owner/admin rows: update succeeds;
4. inactive, ordinary-member, missing-source, or missing-target evidence: `403`, update never called;
5. current organization is null: only target evidence is queried;
6. global admin: membership query is bypassed and update succeeds;
7. membership query error: `500`, update never called;
8. explicit `null` or malformed UUID: `400`, update never called;
9. a real organization change returning SQLSTATE `42501` plus a known guard message: route returns `403`;
10. a non-transfer `42501`: route returns generic `500` rather than an organization denial;
11. a real organization change with an unknown `42501` message: route returns generic `500`.

- [ ] **Step 3: Update the supplemental source contract to fail on unsafe wiring**

Replace the assertion that currently requires inline `organization_id: body.organizationId` with boundary assertions:

```ts
expect(route).not.toContain('organization_id: body.organizationId ?? null');
expect(route).toContain('mapLessonUpdate(');
expect(route).toContain('isLessonOrganizationGuardError(');
expect(route).toContain('createServerSupabase');
expect(route).toContain('createSSRUserSupabase');
expect(route).toContain(".select('id, teacher_id, organization_id')");
```

The behavioral route test remains the primary proof that the trusted client does not perform the update.

- [ ] **Step 4: Verify the route tests fail for the expected reasons**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts
```

Expected: FAIL because the route still accepts `null`, clears omitted organization ownership, and has no transfer membership orchestration.

- [ ] **Step 5: Implement route orchestration with explicit client roles**

In `PUT`:

1. rename the current client to `userSupabase`;
2. select `id, teacher_id, organization_id` for the existing lesson;
3. retain the existing teacher-owner/global-admin lesson manager check;
4. parse the body with the shared schema;
5. compute required source/target organization IDs;
6. only when IDs are required, create `trustedSupabase` and query:

```ts
const { data: memberships, error: membershipError } = await trustedSupabase
  .from('organization_members')
  .select('organization_id, role, is_active')
  .eq('user_id', session.user.id)
  .in('organization_id', requiredOrganizationIds);
```

7. return `403` before mutation if any required ID lacks an active owner/admin row;
8. call `userSupabase.from('lessons').update(mapLessonUpdate(body, new Date().toISOString()))`;
9. compute `organizationChangeRequested` independently of membership lookup as `Object.hasOwn(body, 'organizationId') && body.organizationId !== existing.organization_id`;
10. map a returned database error to the transfer-specific `403` only when `isLessonOrganizationGuardError(error, organizationChangeRequested)` is true; throw every other database error into the existing generic `500` path;
11. return a Zod-specific `400` response in the catch block and retain the existing generic database failure behavior otherwise. Use stable client-facing errors: `Not authorized to reassign this lesson organization` for known transfer rejections, `Invalid lesson update` for `400`, and the existing generic `Failed to update lesson` for unexpected `500`.

- [ ] **Step 6: Verify Task 2**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update.test.ts src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts
pnpm typecheck
```

Expected: PASS; all rejected paths are mutation-free, and only real teacher transfers read memberships through the trusted client.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- 'src/app/api/lessons/[lessonId]/route.ts' src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts
git commit -m "fix(lessons): guard organization changes"
```

---

### Task 3: Keep organization ownership out of edit-form payloads

**Files:**
- Modify: `src/lib/lesson-artifacts/authoring-ui.ts`
- Modify: `src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts`
- Modify: `src/components/lessons/CreateLessonForm.tsx`

**Interfaces:**
- Produces: `LessonSubmissionFields` and `buildLessonSubmissionPayload(fields, operation)`.
- Consumes: `{ mode: 'edit' } | { mode: 'create'; organizationId: string }`.

- [ ] **Step 1: Write failing create/edit payload tests**

Use a frozen common-fields fixture and assert:

```ts
const editPayload = buildLessonSubmissionPayload(fields, { mode: 'edit' });
expect(editPayload).toEqual(fields);
expect(Object.hasOwn(editPayload, 'organizationId')).toBe(false);
expect(Object.hasOwn(JSON.parse(JSON.stringify(editPayload)), 'organizationId')).toBe(false);

expect(buildLessonSubmissionPayload(fields, {
  mode: 'create',
  organizationId: '11111111-1111-4111-8111-111111111111',
})).toEqual({ ...fields, organizationId: '11111111-1111-4111-8111-111111111111' });

expect(buildLessonSubmissionPayload(fields, {
  mode: 'create',
  organizationId: '',
})).toEqual({ ...fields, organizationId: null });
```

In the same test file, add a supplemental wiring contract using `readFile` and `join`:

```ts
const form = await readFile(
  join(process.cwd(), 'src', 'components', 'lessons', 'CreateLessonForm.tsx'),
  'utf8',
);
expect(form).toContain('buildLessonSubmissionPayload');
expect(form).toContain("{ mode: 'edit' }");
expect(form).toContain("{ mode: 'create', organizationId }");
expect(form).not.toContain('organizationId: organizationId || null');
```

- [ ] **Step 2: Verify the helper test fails**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts
```

Expected: FAIL because `buildLessonSubmissionPayload` is not exported and the form still constructs the organization field inline.

- [ ] **Step 3: Implement the discriminated payload helper**

```ts
export type LessonSubmissionFields = {
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string[];
  content: string;
};

export function buildLessonSubmissionPayload(
  fields: LessonSubmissionFields,
  operation: { mode: 'edit' } | { mode: 'create'; organizationId: string },
): LessonSubmissionFields & { organizationId?: string | null } {
  if (operation.mode === 'edit') return { ...fields };
  return { ...fields, organizationId: operation.organizationId || null };
}
```

The discriminated union prevents an edit operation from accepting an organization argument.

- [ ] **Step 4: Wire the form through the helper**

Build the common fields once, then pass either `{ mode: 'edit' }` or `{ mode: 'create', organizationId }` to the helper before `JSON.stringify`:

```ts
const payload = buildLessonSubmissionPayload(
  { title, subject, gradeLevel, objectives, content: generatedContent },
  isEditing ? { mode: 'edit' } : { mode: 'create', organizationId },
);

const response = await fetch(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

Keep the existing create behavior and organization selector unchanged.

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts
pnpm typecheck
pnpm exec eslint src/components/lessons/CreateLessonForm.tsx src/lib/lesson-artifacts/authoring-ui.ts src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts
```

Expected: PASS; create owns and serializes `organizationId`, while edit does neither.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/lib/lesson-artifacts/authoring-ui.ts src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts src/components/lessons/CreateLessonForm.tsx
git commit -m "fix(lessons): preserve edit ownership"
```

---

### Task 4: Add the forward database hardening migration

**Files:**
- Create: `supabase/migrations/0035_harden_lesson_artifact_writes.sql`
- Create: `src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts`

**Interfaces:**
- Changes: `content_jobs` policies and table privileges.
- Replaces: legacy lesson manager RLS policies with normalized manager policies, a NEW-row owner check, and an authenticated editable-column allowlist.
- Reasserts: service-role-only execution for the three content-job-mutating RPCs.
- Replaces: `public.prevent_approved_artifact_mutation()` and `lesson_artifacts_approved_immutable`.
- Produces: `public.prevent_invalid_lesson_organization_reassignment()` and `lessons_organization_reassignment_guard`.

- [ ] **Step 1: Write the failing migration contract test**

Read both `0033_objective_artifacts.sql` and `0035_harden_lesson_artifact_writes.sql`, lowercase them, and require all of these contracts:

- `0033` defines `content_jobs_select_own`, while `0035` drops `content_jobs_insert_own` and `content_jobs_update_own` and does not drop the select policy;
- `0035` enables lesson RLS, defines `can_assign_lesson_teacher(uuid)`, and makes `lessons_manager_update` use `can_manage_lesson(id)` for `USING` plus `can_assign_lesson_teacher(teacher_id)` for `WITH CHECK`;
- revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`;
- grant `SELECT` to `authenticated` and `SELECT, INSERT, UPDATE, DELETE` to `service_role`;
- revoke `PUBLIC`, `anon`, and `authenticated` execute rights and grant `service_role` execute rights for the exact signatures:
  - `claim_content_jobs(text, integer, integer)`;
  - `enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb)`;
  - `create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb)`;
- wrap the complete migration in `BEGIN;` and `COMMIT;` so a failing statement cannot leave partial ACL/RLS hardening;
- enable RLS on `public.lessons`, dynamically drop every existing `INSERT`, `UPDATE`, `DELETE`, or `ALL` policy that applies to `PUBLIC`, `anon`, or `authenticated`, drop and recreate the normalized manager policies, and leave exactly `lessons_manager_update` plus `lessons_manager_delete` as authenticated write policies; update `USING` checks old-row management and `WITH CHECK` validates the NEW `teacher_id` through `can_assign_lesson_teacher(teacher_id)`;
- revoke broad lesson UPDATE privileges from `PUBLIC`, `anon`, and `authenticated`, then grant authenticated UPDATE only on `title`, `subject`, `gradelevel`, `objectives`, `content`, `organization_id`, and `updated_at`; legacy `teacher`, normalized `teacher_id`, and `current_publication_id` must remain non-updatable to authenticated clients;
- artifact trigger function branches on `TG_OP = 'DELETE'`, returning `OLD` for delete and `NEW` for update;
- both affected triggers are dropped and recreated;
- organization trigger is `BEFORE UPDATE OF organization_id` and contains service-role bypass, `can_manage_lesson(OLD.id)`, null rejection, global-admin bypass, active owner/admin source/target checks, and SQLSTATE `42501` on every rejection.

Assert the source begins with `BEGIN;` and ends with `COMMIT;`; do not rely on a deployment tool to wrap the migration.

- [ ] **Step 2: Verify the migration test fails**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
```

Expected: FAIL because migration `0035` does not exist.

- [ ] **Step 3: Implement the content-job privilege boundary**

Use explicit, idempotent policy drops and literal ACLs:

```sql
DROP POLICY IF EXISTS content_jobs_insert_own ON public.content_jobs;
DROP POLICY IF EXISTS content_jobs_update_own ON public.content_jobs;

REVOKE ALL PRIVILEGES ON TABLE public.content_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.content_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_jobs TO service_role;
```

For each exact job-mutating RPC signature, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role`. Do not alter quota calculations, idempotency behavior, or existing rows.

Start the migration with `BEGIN;`. In the same forward migration, enable RLS, add a hardened NEW-row owner predicate, and replace all browser-applicable lesson write policies without restoring direct lesson inserts:

```sql
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lessons'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.lessons',
      policy_row.policyname
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_assign_lesson_teacher(p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.can_assign_lesson_teacher(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_assign_lesson_teacher(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS lessons_teacher_own ON public.lessons;
DROP POLICY IF EXISTS lessons_admin_all ON public.lessons;
DROP POLICY IF EXISTS lessons_manager_select ON public.lessons;
DROP POLICY IF EXISTS lessons_manager_update ON public.lessons;
DROP POLICY IF EXISTS lessons_manager_delete ON public.lessons;

CREATE POLICY lessons_manager_select ON public.lessons
  FOR SELECT TO authenticated
  USING (public.can_manage_lesson(id));

CREATE POLICY lessons_manager_update ON public.lessons
  FOR UPDATE TO authenticated
  USING (public.can_manage_lesson(id))
  WITH CHECK (public.can_assign_lesson_teacher(teacher_id));

CREATE POLICY lessons_manager_delete ON public.lessons
  FOR DELETE TO authenticated
  USING (public.can_manage_lesson(id));
```

Keep the existing student and broad teacher read policies. Lesson creation remains service-role-only through `create_lesson_draft`; do not add an authenticated insert policy. The NEW-row predicate remains defense in depth, while column-privilege tests prove neither a teacher nor an authenticated global admin can directly change `teacher_id`; intentional ownership maintenance is service-role-only.

After the policy definitions, establish the column boundary explicitly:

```sql
REVOKE UPDATE ON TABLE public.lessons FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  lesson_columns text;
BEGIN
  SELECT string_agg(quote_ident(attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO lesson_columns
  FROM pg_attribute attribute
  WHERE attribute.attrelid = 'public.lessons'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF lesson_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE UPDATE (%s) ON TABLE public.lessons FROM PUBLIC, anon, authenticated',
      lesson_columns
    );
  END IF;
END;
$$;

GRANT UPDATE (
  title,
  subject,
  gradelevel,
  objectives,
  content,
  organization_id,
  updated_at
) ON public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;
```

Authenticated global admins follow the same editable-column allowlist. Intentional changes to `teacher`, `teacher_id`, or `current_publication_id` use a service-role maintenance path; do not restore broad authenticated UPDATE to support them.

End the migration with `COMMIT;`. Any error before that boundary must roll back the complete migration.

- [ ] **Step 4: Repair approved-artifact trigger returns**

Replace the function in place:

```sql
IF OLD.status = 'approved' THEN
  RAISE EXCEPTION 'Approved lesson artifacts are immutable; create a new version';
END IF;
IF TG_OP = 'DELETE' THEN
  RETURN OLD;
END IF;
RETURN NEW;
```

Drop and recreate `lesson_artifacts_approved_immutable` as `BEFORE UPDATE OR DELETE` so drifted environments converge on the same attachment.

- [ ] **Step 5: Add the atomic lesson-organization guard**

Create the guard with a hardened search path and fully qualified non-catalog references:

```sql
CREATE OR REPLACE FUNCTION public.prevent_invalid_lesson_organization_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_manage_lesson(OLD.id) THEN
    RAISE EXCEPTION 'Not authorized to reassign lesson organization'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Lesson organization cannot be cleared'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = OLD.organization_id
      AND m.user_id = auth.uid()
      AND m.is_active = true
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Active owner or admin membership in current organization is required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = auth.uid()
      AND m.is_active = true
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Active owner or admin membership in target organization is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_invalid_lesson_organization_reassignment()
  FROM PUBLIC, anon, authenticated;
```

The null check intentionally precedes the same-value return so an authenticated statement that explicitly sets a legacy null organization to null is rejected. `service_role` remains the only null-maintenance bypass. Drop and recreate `lessons_organization_reassignment_guard` as:

```sql
CREATE TRIGGER lessons_organization_reassignment_guard
BEFORE UPDATE OF organization_id ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invalid_lesson_organization_reassignment();
```

- [ ] **Step 6: Verify Task 4**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
pnpm exec eslint src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
git status --short -- supabase/migrations
git diff --check
```

Expected: tests and lint pass; migration status lists only `?? supabase/migrations/0035_harden_lesson_artifact_writes.sql`; whitespace check passes.

- [ ] **Step 7: Leave Task 4 at a verified checkpoint**

```powershell
git status --short -- supabase/migrations/0035_harden_lesson_artifact_writes.sql src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
```

Expected: both files remain uncommitted. Task 5 must apply the migration and pass the real PostgreSQL gate before either file is committed.

---

### Task 5: Add the transactional database acceptance gate

**Files:**
- Reference (already checked in with this plan): `docs/superpowers/plans/2026-07-12-pr-13-0035-dml-template.sql`
- Create: `supabase/verification/0034_prerequisites.sql`
- Create: `supabase/verification/0035_catalog.sql`
- Create: `supabase/verification/0035_dml.sql`
- Create: `scripts/verify-0035.ps1`
- Create: `src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts`
- Modify: `src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts`

**Interfaces:**
- Consumes: two distinct isolated databases still at migration `0034`: an empty schema-only canonical clone and a representative upgrade-state clone. Each URL is supplied only to `scripts/verify-0035.ps1` with an explicit `-Mode` and `-ConfirmDisposable`.
- Produces: ordered prerequisite, migration, read-only catalog, and rollback-only DML checks with a non-zero exit on any failure.
- Leaves: migration `0035` applied to each disposable clone but no fixtures or helper functions because `0035_dml.sql` ends in `ROLLBACK`; shared targets run only `0035_catalog.sql`.

- [ ] **Step 1: Write the failing verifier-wiring test**

Create `src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts` with this complete content:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const normalize = (value: string) => value.replace(/\r\n/g, '\n').trim();

describe('0035 PostgreSQL verification wiring', () => {
  it('runs the isolated database gates in fail-closed order', () => {
    const runner = read('scripts/verify-0035.ps1');
    const preflight = runner.indexOf("Invoke-CheckedPsql 'supabase/verification/0034_prerequisites.sql'");
    const migration = runner.indexOf("Invoke-CheckedPsql 'supabase/migrations/0035_harden_lesson_artifact_writes.sql'");
    const catalog = runner.indexOf("Invoke-CheckedPsql 'supabase/verification/0035_catalog.sql'");
    const dml = runner.indexOf("Invoke-CheckedPsql 'supabase/verification/0035_dml.sql'");
    expect(runner).toContain('[switch]$ConfirmDisposable');
    expect(runner).toContain("[ValidateSet('canonical', 'upgrade')]");
    expect(runner).toContain('require_empty=');
    expect(runner).toContain("$ErrorActionPreference = 'Stop'");
    expect(runner).toContain('if ($LASTEXITCODE -ne 0)');
    expect(preflight).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(preflight);
    expect(catalog).toBeGreaterThan(migration);
    expect(dml).toBeGreaterThan(catalog);
    expect(runner).not.toContain('SHARED_DATABASE_URL');
    expect(runner).not.toContain('$env:DATABASE_URL');
  });

  it('keeps shared verification read-only and isolated DML rollback-only', () => {
    const prerequisites = read('supabase/verification/0034_prerequisites.sql').toLowerCase();
    const catalog = read('supabase/verification/0035_catalog.sql').toLowerCase();
    const dmlSource = read('supabase/verification/0035_dml.sql');
    const dml = dmlSource.toLowerCase();
    const dmlTemplate = read(
      'docs/superpowers/plans/2026-07-12-pr-13-0035-dml-template.sql',
    );
    expect(prerequisites).toContain('begin read only');
    expect(prerequisites).toContain('require_empty must be true or false');
    expect(prerequisites).toContain('require_empty_valid');
    expect(prerequisites).toContain('verification fixture namespace is not clean');
    expect(catalog).toContain('begin read only');
    expect(catalog).toContain('has_column_privilege');
    expect(dml).toContain('begin;');
    expect(dml).toContain('set local role authenticated');
    expect(dml).toContain('set local role service_role');
    expect(dml).toContain('_verify_0035_expect_error');
    expect(dml.trimEnd()).toMatch(/rollback;\s*\\echo '0035 rollback-only dml verification passed\.'$/);
    expect(normalize(dmlSource)).toBe(normalize(dmlTemplate));
  });
});
```

- [ ] **Step 2: Verify the extended test fails**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts
```

Expected: FAIL with `ENOENT` because the verifier files and runner do not exist.

- [ ] **Step 3: Implement the split, fail-closed database verifier**

Create `0034_prerequisites.sql` as a read-only gate. The runner must supply `require_empty=true` for the canonical clone and `require_empty=false` for the upgrade clone; omission is an error, not a default. Both modes require a direct migration-owner connection, the normalized canonical `0034` function/policy baseline, absence of `0035`, no globally claimable jobs, and a clean deterministic fixture namespace. Canonical mode additionally requires an empty schema-only database.

```sql
\set ON_ERROR_STOP on
\if :{?require_empty}
\else
  \echo 'require_empty must be true or false'
  \quit 3
\endif

SELECT :'require_empty' IN ('true', 'false') AS require_empty_valid
\gset
\if :require_empty_valid
\else
  \echo 'require_empty must be true or false'
  \quit 3
\endif

BEGIN READ ONLY;

DO $verify_0034$
DECLARE
  manage_definition text;
BEGIN
  IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER')
    OR NOT pg_has_role(current_user, 'service_role', 'MEMBER') THEN
    RAISE EXCEPTION 'Verification connection must be able to SET ROLE authenticated and service_role';
  END IF;

  IF to_regprocedure('public.can_manage_lesson(uuid)') IS NULL
    OR to_regprocedure('public.claim_content_jobs(text,integer,integer)') IS NULL
    OR to_regprocedure('public.enqueue_content_jobs_with_usage(uuid,uuid,jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.create_uploaded_lesson_artifact(uuid,uuid,text,jsonb,jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.prevent_approved_artifact_mutation()') IS NULL THEN
    RAISE EXCEPTION 'Canonical 0034 prerequisite functions are missing';
  END IF;

  SELECT lower(pg_get_functiondef('public.can_manage_lesson(uuid)'::regprocedure))
  INTO manage_definition;
  IF position('l.teacher_id' IN manage_definition) = 0
    OR position('t.user_id = auth.uid()' IN manage_definition) = 0 THEN
    RAISE EXCEPTION 'can_manage_lesson does not match the normalized 0034 ownership baseline';
  END IF;

  IF to_regprocedure('public.can_assign_lesson_teacher(uuid)') IS NOT NULL
    OR to_regprocedure('public.prevent_invalid_lesson_organization_reassignment()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.lessons'::regclass
        AND tgname = 'lessons_organization_reassignment_guard'
        AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'Disposable database is already beyond migration 0034';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_jobs'
      AND policyname IN (
        'content_jobs_select_own',
        'content_jobs_insert_own',
        'content_jobs_update_own'
      )
  ) <> 3 THEN
    RAISE EXCEPTION '0034 content_jobs policy baseline is incomplete';
  END IF;
END;
$verify_0034$;

DO $verify_isolation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.content_jobs WHERE status IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION 'Isolated verification clone contains globally claimable jobs';
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.users
      WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%'
        OR email LIKE 'verify-%@example.invalid'
    )
    OR EXISTS (
      SELECT 1 FROM public.teachers
      WHERE id::text LIKE '20000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id::text LIKE '30000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE id = '40000000-0000-4000-8000-000000000001'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_objectives
      WHERE id::text LIKE '50000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_publications
      WHERE id::text LIKE 'b0000000-0000-4000-8000-00000000000%'
        OR content_hash LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.content_jobs
      WHERE id::text LIKE '60000000-0000-4000-8000-00000000000%'
        OR idempotency_key LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_artifacts
      WHERE id::text LIKE '80000000-0000-4000-8000-00000000000%'
        OR series_id::text LIKE 'a0000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_assets
      WHERE id = '90000000-0000-4000-8000-000000000001'
        OR storage_path LIKE 'verification/%'
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_ai_usage
      WHERE reference_id LIKE 'verify:%'
    ) THEN
    RAISE EXCEPTION 'Verification fixture namespace is not clean';
  END IF;
END;
$verify_isolation$;

\if :require_empty
DO $verify_canonical_empty$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users)
    OR EXISTS (SELECT 1 FROM public.organizations)
    OR EXISTS (SELECT 1 FROM public.lessons)
    OR EXISTS (SELECT 1 FROM public.content_jobs) THEN
    RAISE EXCEPTION 'Canonical verification requires an empty schema-only 0034 baseline';
  END IF;
END;
$verify_canonical_empty$;
\endif

ROLLBACK;
```

Create `scripts/verify-0035.ps1` with this exact orchestration. The confirmation switch is a deliberate operator assertion that the URL is isolated and disposable; the script itself never reads a shared-database environment variable.

```powershell
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DisposableDatabaseUrl,
  [Parameter(Mandatory = $true)]
  [ValidateSet('canonical', 'upgrade')]
  [string]$Mode,
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmDisposable
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmDisposable) {
  throw 'Pass -ConfirmDisposable only for an isolated database still at migration 0034.'
}
if ([string]::IsNullOrWhiteSpace($DisposableDatabaseUrl)) {
  throw 'DisposableDatabaseUrl is required.'
}

$psql = Get-Command psql -ErrorAction Stop
$root = Split-Path -Parent $PSScriptRoot
$requireEmpty = if ($Mode -eq 'canonical') { 'true' } else { 'false' }

function Invoke-CheckedPsql([string]$RelativePath, [string[]]$Variables = @()) {
  $path = Join-Path $root $RelativePath
  $arguments = @($DisposableDatabaseUrl, '-X', '--set', 'ON_ERROR_STOP=1')
  foreach ($variable in $Variables) {
    $arguments += @('--set', $variable)
  }
  $arguments += @('--file', $path)
  & $psql.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed for $RelativePath with exit code $LASTEXITCODE"
  }
}

Invoke-CheckedPsql 'supabase/verification/0034_prerequisites.sql' @("require_empty=$requireEmpty")
Invoke-CheckedPsql 'supabase/migrations/0035_harden_lesson_artifact_writes.sql'
Invoke-CheckedPsql 'supabase/verification/0035_catalog.sql'
Invoke-CheckedPsql 'supabase/verification/0035_dml.sql'
Write-Host "0035 isolated PostgreSQL verification passed ($Mode)."
```

Create `0035_catalog.sql` with `\set ON_ERROR_STOP on`, `BEGIN READ ONLY;`, the following self-asserting catalog block, and `ROLLBACK;`. This file is the only verifier permitted on a shared target.

```sql
DO $verify_catalog$
DECLARE
  function_name text;
  artifact_definition text;
  job_functions constant text[] := ARRAY[
    'public.claim_content_jobs(text,integer,integer)',
    'public.enqueue_content_jobs_with_usage(uuid,uuid,jsonb,jsonb)',
    'public.create_uploaded_lesson_artifact(uuid,uuid,text,jsonb,jsonb,jsonb)'
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_jobs'
      AND policyname IN ('content_jobs_insert_own', 'content_jobs_update_own')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_jobs'
      AND policyname = 'content_jobs_select_own'
  ) THEN
    RAISE EXCEPTION 'content_jobs policy matrix is incorrect';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.content_jobs', 'SELECT')
    OR has_table_privilege('authenticated', 'public.content_jobs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.content_jobs', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.content_jobs', 'DELETE')
    OR has_table_privilege('anon', 'public.content_jobs', 'INSERT')
    OR has_table_privilege('anon', 'public.content_jobs', 'UPDATE')
    OR has_table_privilege('anon', 'public.content_jobs', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.content_jobs', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.content_jobs', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.content_jobs', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.content_jobs', 'DELETE') THEN
    RAISE EXCEPTION 'content_jobs effective privilege matrix is incorrect';
  END IF;

  FOREACH function_name IN ARRAY job_functions LOOP
    IF has_function_privilege('authenticated', function_name, 'EXECUTE')
      OR has_function_privilege('anon', function_name, 'EXECUTE')
      OR NOT has_function_privilege('service_role', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'job RPC privilege matrix is incorrect for %', function_name;
    END IF;
  END LOOP;

  IF has_function_privilege(
    'authenticated',
    'public.insert_generated_lesson_artifact(uuid,uuid,integer,text,integer,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.insert_generated_lesson_artifact(uuid,uuid,integer,text,integer,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.insert_generated_lesson_artifact(uuid,uuid,integer,text,integer,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'generated-artifact worker RPC privilege matrix is incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.lessons'::regclass AND relrowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname IN ('lessons_teacher_own', 'lessons_admin_all')
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname IN ('lessons_manager_select', 'lessons_manager_update', 'lessons_manager_delete')
  ) <> 3 OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lessons'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND NOT (
        policyname = 'lessons_manager_update'
        AND cmd = 'UPDATE'
        AND roles = ARRAY['authenticated']::name[]
        OR policyname = 'lessons_manager_delete'
        AND cmd = 'DELETE'
        AND roles = ARRAY['authenticated']::name[]
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname = 'lessons_manager_select'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%can_manage_lesson%'
      AND with_check IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname = 'lessons_manager_update'
      AND cmd = 'UPDATE'
      AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%can_manage_lesson%'
      AND with_check LIKE '%can_assign_lesson_teacher%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname = 'lessons_manager_delete'
      AND cmd = 'DELETE'
      AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%can_manage_lesson%'
      AND with_check IS NULL
  ) OR to_regprocedure('public.can_assign_lesson_teacher(uuid)') IS NULL
    OR NOT has_function_privilege(
      'authenticated', 'public.can_assign_lesson_teacher(uuid)', 'EXECUTE'
    ) OR has_function_privilege(
      'anon', 'public.can_assign_lesson_teacher(uuid)', 'EXECUTE'
    ) OR NOT has_function_privilege(
      'service_role', 'public.can_assign_lesson_teacher(uuid)', 'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'lesson manager RLS matrix is incorrect';
  END IF;

  IF has_table_privilege('authenticated', 'public.lessons', 'UPDATE')
    OR has_any_column_privilege('anon', 'public.lessons', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.lessons', 'UPDATE')
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'title', 'subject', 'gradelevel', 'objectives',
        'content', 'organization_id', 'updated_at'
      ]) AS allowed(column_name)
      WHERE NOT has_column_privilege(
        'authenticated',
        'public.lessons',
        allowed.column_name,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_attribute attribute
      WHERE attribute.attrelid = 'public.lessons'::regclass
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND NOT attribute.attname = ANY (ARRAY[
          'title', 'subject', 'gradelevel', 'objectives',
          'content', 'organization_id', 'updated_at'
        ])
        AND has_column_privilege(
          'authenticated',
          'public.lessons',
          attribute.attname,
          'UPDATE'
        )
    ) THEN
    RAISE EXCEPTION 'lesson UPDATE column privilege matrix is incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.lesson_artifacts'::regclass
      AND tgname = 'lesson_artifacts_approved_immutable'
      AND tgenabled = 'O'
      AND tgfoid = 'public.prevent_approved_artifact_mutation()'::regprocedure
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.lessons'::regclass
      AND tgname = 'lessons_organization_reassignment_guard'
      AND tgenabled = 'O'
      AND tgfoid = 'public.prevent_invalid_lesson_organization_reassignment()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'hardening trigger attachment is incorrect';
  END IF;

  SELECT lower(pg_get_functiondef(
    'public.prevent_approved_artifact_mutation()'::regprocedure
  )) INTO artifact_definition;
  IF position('if tg_op = ''delete'' then' IN artifact_definition) = 0
    OR position('return old' IN artifact_definition) = 0
    OR position('return new' IN artifact_definition) = 0 THEN
    RAISE EXCEPTION 'approved-artifact trigger function definition is incorrect';
  END IF;
END;
$verify_catalog$;
```

Create `0035_dml.sql` by copying `docs/superpowers/plans/2026-07-12-pr-13-0035-dml-template.sql` exactly. The checked-in template is the authoritative executable body; the matrix and snippets below explain its acceptance intent and are not permission to replace it with a skeletal source-marker script. It starts with `\set ON_ERROR_STOP on` and `BEGIN;`, uses deterministic helper functions, fixtures and assertions, rolls the DML transaction back, verifies that rollback in a separate read-only transaction, and ends exactly with `\echo '0035 rollback-only DML verification passed.'`. Every actor block sets both scalar and JSON Supabase JWT claims before switching roles.

Create rollback-scoped `public._verify_0035_assert(boolean,text)`, `public._verify_0035_expect_error(text,text,text)`, `public._verify_0035_assert_row_count(text,bigint,text)`, and `public._verify_0035_set_actor(uuid,text)` helpers as invoker-security PL/pgSQL functions with `SET search_path = pg_catalog, public`. Revoke `PUBLIC` execution from all four; grant only the three assertion helpers to `authenticated` and `service_role`, while `set_actor` remains executable only by the migration owner before each role switch. `expect_error` must execute its SQL, compare both `RETURNED_SQLSTATE` and `MESSAGE_TEXT`, and fail if the statement succeeds or raises a different error. `assert_row_count` must use `GET DIAGNOSTICS ... ROW_COUNT` and compare the exact affected count. `set_actor` must set both scalar claim GUCs and the JSON claims object. Because the enclosing transaction rolls back, these public helper definitions never persist.

The DML preflight must run before fixtures and repeat the upgrade-safe isolation checks from `0034_prerequisites.sql`: the connection can assume `authenticated` and `service_role`, no queued/running job exists, and no row collides with the reserved verification IDs, `verify-%@example.invalid` emails, `verify:%` idempotency/reference/content-hash keys, `a0000000-...` artifact series IDs, or `verification/%` storage paths. Implement these as `DO` assertions, not visual/manual checks. In particular, this query must return no row:

```sql
SELECT id FROM public.content_jobs
WHERE status IN ('queued', 'running')
LIMIT 1;
```

The authoritative template uses literal reserved UUIDs and `verify:` namespaces rather than psql fixture variables. Do not add a second indirection layer: the prerequisite and DML preflights validate those literal namespaces before any insert.

Insert only current-schema columns, using these exact fixture shapes:

- `public.users(id, email, name, role)`: the owning teacher, a second teacher, and one global admin;
- `public.teachers(id, user_id, subjects, grades)`: both teacher profiles with empty array fields;
- `public.organizations(id, name, owner_id)`: source and target organizations;
- `public.organization_members(organization_id, user_id, role, is_active)`: normalize the trigger-created teacher rows to the role/state needed by each test, restoring active owner/admin rows between rejection cases;
- `public.lessons(id, title, subject, gradelevel, objectives, content, teacher_id, organization_id)`: one primary teacher-owned source-organization lesson plus one artifact-free manager-delete fixture;
- `public.lesson_objectives(id, lesson_id, text, position, revision)`: one primary objective and one cascade-only objective at distinct positions;
- `public.lesson_publications(id, lesson_id, version, manifest, warnings, content_hash, published_by)`: one valid deterministic publication used for `current_publication_id` ACL and service-maintenance assertions;
- `public.lesson_artifacts(id, lesson_id, objective_id, series_id, version, objective_revision, kind, status, position, payload, source, created_by)`: draft, rejected, and approved fixtures under the primary objective, plus a single non-approved artifact under the cascade-only objective, all with unique series IDs.

After organization setup, explicitly make the owning teacher an active source `owner` and target `admin`; this proves the first successful teacher transfer uses source ownership plus target administration. Before the global-admin bypass case, remove that admin user's organization memberships so the success cannot be attributed to membership. Before deleting the rejected artifact, update it and assert both exact row count one and persisted payload. Worker-completion updates must predicate on the expected `lease_owner` value and `lease_expires_at > now()` before clearing the lease. Exercise source and target membership failures separately for missing, inactive, and ordinary `member` rows, restoring the success state between groups.

Use the real `publication_id` fixture when testing `current_publication_id`: authenticated teacher and global-admin attempts must fail with `42501` before any FK mutation, while service-role maintenance must set the pointer successfully and persist it. Perform any service-role `teacher_id` maintenance after teacher-authorization cases, or restore the original teacher before continuing.

Use `ON CONFLICT` only where setup triggers can legitimately precreate a membership. Any unexpected pre-existing deterministic ID should fail the disposable-environment gate rather than silently reuse unrelated data.

The template calls `_verify_0035_set_actor` as the migration owner before every role switch. That helper sets both scalar claim GUCs and the JSON claims object; authenticated and service roles cannot execute it themselves. Assertions use literal reserved IDs, so no temp-table privilege bridge is required.

Every expected failure goes through `_verify_0035_expect_error`, which fails closed when the statement succeeds or the SQLSTATE differs. ACL failures require `42501`; organization-guard failures additionally require the exact stable guard message. Approved artifact update/delete requires `P0001` plus `Approved lesson artifacts are immutable; create a new version`.

Implement this complete behavior matrix; do not replace a row with a source-string assertion:

| Actor/setup | Operation | Required assertion |
|---|---|---|
| authenticated teacher, own job | `SELECT` | fixture job returned |
| another authenticated teacher | `SELECT` the owner's job | zero rows returned |
| authenticated teacher | direct job `INSERT`, `UPDATE`, `DELETE` | each raises `42501`; fixture unchanged |
| service role | enqueue with usage | one queued job and one source-org usage row |
| service role, isolated queue | claim quota job, then worker failure | only the quota job runs; owned unexpired lease transition makes it failed and releases the lease |
| service role | enqueue separate no-usage lifecycle job, then cancel while queued | one row becomes cancelled and no usage row is added |
| service role | retry, claim, and complete lifecycle job | it returns to queued, becomes running with lease/attempt increment, then succeeds through the owned unexpired lease |
| service role, after a real lesson reassignment | retry, claim, and complete original quota job | succeeds without new usage or organization change |
| service role | upload RPC | returned and persisted asset/artifact/job IDs match fixtures |
| service role, draft/rejected | update/delete | each update affects one and persists; combined delete affects two and both rows are absent |
| service role, approved | update/delete | `P0001` plus exact immutability message; row unchanged |
| service role, cascade-only objective | delete objective | its sole non-approved artifact disappears; primary draft/rejected/approved fixtures remain |
| teacher active owner/admin in source and target | lesson reassignment | one row updated to target |
| teacher missing/inactive/member in source | lesson reassignment | `42501` plus current-organization message; row unchanged |
| teacher missing/inactive/member in target | lesson reassignment | `42501` plus target-organization message; row unchanged |
| teacher | explicit organization `NULL` | `42501` plus clear message; row unchanged |
| authenticated teacher, manageable lesson | update allowlisted content fields | succeeds and persists |
| authenticated teacher | direct lesson `INSERT` | raises `42501`; no row persists |
| authenticated owner / non-owner | delete disposable managed lesson / delete another teacher's lesson | owner affects one row; non-owner affects zero |
| authenticated teacher, another teacher's lesson | update an allowlisted field | row count is zero and row remains unchanged |
| authenticated teacher | change normalized `teacher_id` or `current_publication_id` | each raises `42501`; protected values remain unchanged |
| authenticated teacher, when legacy `teacher` exists | change legacy `teacher` | raises `42501`; value remains unchanged; skip only when catalog proves the column is absent |
| global admin user | source-to-target reassignment | succeeds without memberships |
| authenticated global admin | change `teacher_id` or `current_publication_id`, plus legacy `teacher` when present | each raises `42501`; protected values remain unchanged |
| service role | protected-field maintenance, organization reassignment, or null maintenance | succeeds through the explicit trusted bypass |

Execute the authoritative template in this order so each precondition is deterministic: isolation/role preflight; fixture inserts; source-org quota enqueue; authenticated read/write denial; claim and fail the quota job through an owned unexpired lease; enqueue/cancel/retry/claim/complete a separate no-usage lifecycle job; artifact behavior; teacher/global-admin organization and column-ACL cases; a real service-role organization/protected-field reassignment; retry/claim/complete the original quota job; original-org job/usage assertions; upload RPC behavior; `RESET ROLE`; main `ROLLBACK`; read-only rollback proof; final `ROLLBACK`; success echo.

Use exact catalog predicates such as:

```sql
IF NOT has_table_privilege('authenticated', 'public.content_jobs', 'SELECT')
  OR has_table_privilege('authenticated', 'public.content_jobs', 'INSERT')
  OR has_table_privilege('authenticated', 'public.content_jobs', 'UPDATE')
  OR has_table_privilege('authenticated', 'public.content_jobs', 'DELETE') THEN
  RAISE EXCEPTION 'content_jobs authenticated privilege matrix is incorrect';
END IF;

IF NOT has_function_privilege(
  'service_role',
  'public.enqueue_content_jobs_with_usage(uuid,uuid,jsonb,jsonb)',
  'EXECUTE'
) THEN
  RAISE EXCEPTION 'service_role cannot execute enqueue_content_jobs_with_usage';
END IF;
```

Authorization failures for ACL and organization-guard cases must assert SQLSTATE `42501`; any other error fails the verifier. For successful artifact behavior, capture `ROW_COUNT` and query persisted state: draft/rejected updates each affect one and persist, their combined delete affects exactly two and leaves neither row, and the non-approved parent cascade removes its child artifact. This prevents an unrelated FK/RLS error from satisfying the test.

For quota attribution, enqueue `job_id` in `source_org_id` with one usage item `{ "category": "quiz_generation", "quantity": 1, "referenceId": "verify:quota" }`, claim it, and move it to a deterministic failed state through an owned unexpired lease. After a real lesson reassignment, retry, reclaim, and complete that original job. Assert afterward that:

- the job still owns `source_org_id`;
- the usage row still owns `source_org_id`;
- exactly one `verify:quota` usage reservation exists;
- no matching target-organization reservation was created.

The exact template calls the real enqueue and upload RPCs, checks the upload payload directly in a CTE, and then verifies the persisted asset, artifact, job, and usage rows. Do not replace those calls with direct fixture inserts or a temp-table variant; the source-equality test intentionally rejects alternate implementations.

- [ ] **Step 4: Verify the checked-in contract**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts
git diff --check
```

Expected: PASS. This source contract only guards that the intended matrix remains checked in; it is not sufficient for commit or merge readiness.

- [ ] **Step 5: Run the mandatory pre-merge PostgreSQL database gate**

For the full DML matrix, use direct migration-owner connections to two distinct isolated disposable databases that are still at `0034`. Expect exit code `0`, no assertion raises, and the DML transaction rolls back. Run against both:

- a clean environment provisioned from the operator's canonical `0034` schema baseline, in `canonical` mode;
- an isolated representative upgrade-state clone already at `0034`, in `upgrade` mode.

Do not call the first environment a raw full-chain replay; the known `0021` typo makes that a separate migration-history repair.

Use the two operator-provided direct URLs explicitly. The runner itself validates the `0034` prerequisite, applies `0035`, runs the read-only catalog verifier, and runs the rollback-only DML verifier:

```powershell
pwsh -NoProfile -File scripts/verify-0035.ps1 -DisposableDatabaseUrl $env:BASELINE_0034_DATABASE_URL -Mode canonical -ConfirmDisposable
pwsh -NoProfile -File scripts/verify-0035.ps1 -DisposableDatabaseUrl $env:UPGRADE_0034_DATABASE_URL -Mode upgrade -ConfirmDisposable
```

The repository has no `supabase/config.toml`, migration-runner command, canonical baseline, or disposable database harness. Therefore the operator must provide `BASELINE_0034_DATABASE_URL`, `UPGRADE_0034_DATABASE_URL`, and the canonical `0034` baseline externally. Record both runner exit codes in rollout evidence; do not describe them as repo-automated CI.

Both commands must print their mode-specific success message and exit `0` before commit or merge. If either direct URL, `psql`, clone, or canonical baseline is unavailable, record database verification as blocked and stop; source-contract tests do not make the change merge-ready. Never pass a shared staging or production URL to the runner.

After either isolated run, any change to migration `0035`, the prerequisite SQL, either verifier SQL file, the authoritative DML template, or the runner invalidates both results. Reprovision fresh `0034` canonical and upgrade clones and rerun both commands. Discard a clone already advanced to `0035`; do not bypass the `0034` prerequisite.

- [ ] **Step 6: Commit Task 5 after PostgreSQL verification**

```powershell
git add supabase/migrations/0035_harden_lesson_artifact_writes.sql supabase/verification/0034_prerequisites.sql supabase/verification/0035_catalog.sql supabase/verification/0035_dml.sql scripts/verify-0035.ps1 src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts
git commit -m "fix(db): verify lesson write hardening"
```

---

### Task 6: Run project verification and stage the rollout safely

**Files:**
- Verify only; no new production files expected.

- [ ] **Step 1: Run all focused regression tests together**

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update.test.ts src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts src/lib/lesson-artifacts/__tests__/database-verifier-contract.test.ts
```

Expected: all focused files pass with zero failed tests.

- [ ] **Step 2: Run repository gates**

```powershell
pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all commands exit `0`; no test, type, lint, or whitespace errors.

- [ ] **Step 3: Review the final diff against invariants**

Confirm:

- only migration `0035` changes database history;
- no browser/user-scoped path writes `content_jobs`;
- PUT omission and edit-form payloads do not own an organization field;
- trusted membership reads and authenticated lesson writes use visibly different clients;
- source and target roles are both enforced in TypeScript and SQL;
- draft/rejected deletion returns `OLD`, while approved immutability is unchanged;
- no code reassigns already-reserved jobs or usage rows.

- [ ] **Step 4: Deploy in the required order**

1. Confirm both mandatory isolated runner modes exited `0` against fresh `0034` clones and that no verifier input changed afterward.
2. Deploy the omission-aware route and form to the shared target without applying `0035`.
3. Edit an existing lesson and verify its `organization_id` remains unchanged; do not release reassignment during this compatibility window.
4. Apply migration `0035` to the shared target.
5. Run catalog-only verification and require exit `0`:

```powershell
psql $env:SHARED_DATABASE_URL -X --set ON_ERROR_STOP=1 --file 'supabase\verification\0035_catalog.sql'
```

6. Confirm bundle generation, regeneration/retry, upload extraction, cancellation, and worker progression through service-role paths.
7. Exercise one authorized reassignment and one insufficient-role reassignment; expect success and `403`, respectively.

- [ ] **Step 5: Monitor and recover safely**

Monitor permission errors, lesson PUT `400/403/500` rates, queued jobs, and worker failures. Before shared-target `0035`, the compatibility application may be rolled back normally. After `0035`, never restore a pre-compatible route/form because it sends `organization_id = null` and recreates the lesson-edit outage. Recover forward with an omission-safe application or corrective migration while retaining job-write restrictions, the lesson column allowlist, null-detachment prevention, and the corrected artifact-delete return.
