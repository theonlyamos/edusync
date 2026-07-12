# PR 13 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three unresolved PR #13 review findings by making content jobs server-write-only, preserving and authorizing lesson organization ownership, and restoring deletion of non-approved lesson artifacts.

**Architecture:** Put request-shape and organization-transfer decisions in a small, side-effect-free lesson-update module, while the lesson route remains the I/O coordinator. Keep the final lesson mutation on the authenticated Supabase client and use a service-role client only to read membership evidence. Add a forward-only `0035` migration as the atomic database boundary for job privileges, organization reassignment, and artifact immutability, plus a transactional SQL acceptance script for environments where the migration is applied.

**Tech Stack:** Next.js 16, TypeScript 5.9, Zod 3, Supabase/PostgreSQL RLS and trigger functions, Vitest 4, pnpm 10, PowerShell/psql rollout commands.

**Approved design:** `docs/superpowers/specs/2026-07-11-pr-13-review-fixes-design.md`

## Global Constraints

- Do not modify already-applied migrations `0033_objective_artifacts.sql` or `0034_normalize_lesson_teacher_ownership.sql`.
- Authenticated and anonymous database roles must never regain direct `INSERT`, `UPDATE`, or `DELETE` access to `content_jobs`.
- Omitted `organizationId` preserves ownership; explicit `null` and malformed UUIDs are rejected; edit mode must omit the property entirely.
- A real teacher reassignment requires active `owner` or `admin` membership in the current organization, when present, and the target organization. A global admin is exempt from membership checks.
- The route may use `createServerSupabase()` only for trusted membership reads. The final lesson update must use `createSSRUserSupabase()` so the database trigger sees the authenticated actor.
- Existing job reservations remain attributed to their original organization. No backfill or transfer of queued/running jobs is in scope.
- Source-contract tests supplement behavioral tests; they are not the sole proof of route or database behavior.
- Apply each production change only after its focused regression test fails for the expected reason.

## Planning Discoveries and Scope Boundaries

- The raw historical migration chain is not replayable: `0021_add_teacherid_to_lessons_assessments.sql` creates `teacher_id` but indexes nonexistent `teacherid` columns. This task must not rewrite that applied file. A clean-environment gate therefore starts from an operator-provided canonical schema baseline at `0034`, then applies `0035`. Repairing historical replay or checking in a new baseline is a separate migration-governance decision.
- `enable_rls_migration.sql` contains legacy `lessons.teacher`/`admins` update policies. Migration `0035` must replace those lesson manager policies with `can_manage_lesson(id)` policies so normalized teacher/admin updates can reach the new organization trigger.
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
9. database guard returns SQLSTATE `42501`: route returns `403` rather than exposing it as `500`.

- [ ] **Step 3: Update the supplemental source contract to fail on unsafe wiring**

Replace the assertion that currently requires inline `organization_id: body.organizationId` with boundary assertions:

```ts
expect(route).not.toContain('organization_id: body.organizationId ?? null');
expect(route).toContain('mapLessonUpdate(');
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
9. map a returned database error with code `42501` to `403` because it represents the atomic guard rejecting a raced or direct unauthorized transfer;
10. return a Zod-specific `400` response in the catch block and retain the existing generic database failure behavior otherwise. Use stable client-facing errors: `Not authorized to reassign this lesson organization` for transfer `403`, `Invalid lesson update` for `400`, and the existing generic `Failed to update lesson` for unexpected `500`.

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
- Replaces: legacy lesson manager RLS policies with normalized manager policies and a NEW-row owner check.
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
- enable RLS on `public.lessons`, drop legacy `lessons_teacher_own` and `lessons_admin_all`, then idempotently create `lessons_manager_select`, `lessons_manager_update`, and `lessons_manager_delete`; update `USING` checks old-row management and `WITH CHECK` validates the NEW `teacher_id` through `can_assign_lesson_teacher(teacher_id)`;
- artifact trigger function branches on `TG_OP = 'DELETE'`, returning `OLD` for delete and `NEW` for update;
- both affected triggers are dropped and recreated;
- organization trigger is `BEFORE UPDATE OF organization_id` and contains service-role bypass, `can_manage_lesson(OLD.id)`, null rejection, global-admin bypass, active owner/admin source/target checks, and SQLSTATE `42501` on every rejection.

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

In the same forward migration, enable RLS, add a hardened NEW-row owner predicate, and replace the legacy lesson manager policies without restoring direct lesson inserts:

```sql
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

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

Keep the existing student and broad teacher read policies. Lesson creation remains service-role-only through `create_lesson_draft`; do not add an authenticated insert policy. The NEW-row predicate must have tests proving a teacher cannot change `teacher_id`, while a global admin can perform an intentional ownership change.

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

- [ ] **Step 7: Commit Task 4**

```powershell
git add supabase/migrations/0035_harden_lesson_artifact_writes.sql src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
git commit -m "fix(db): harden lesson artifact writes"
```

---

### Task 5: Add the transactional database acceptance gate

**Files:**
- Create: `supabase/verification/0035_harden_lesson_artifact_writes.sql`
- Modify: `src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts`

**Interfaces:**
- Consumes: `run_dml=false` for catalog-only checks on a migrated environment, or `run_dml=true` plus a direct migration-owner connection to an isolated disposable database that can `SET ROLE authenticated` and `SET ROLE service_role`.
- Produces: a non-zero `psql` exit on any catalog, privilege, trigger, or DML invariant failure.
- Leaves: no fixtures, because the script runs inside `BEGIN`/`ROLLBACK`.

- [ ] **Step 1: Extend the migration test with a failing verifier contract**

Read the verification file and assert it contains:

- `\set ON_ERROR_STOP on`, `BEGIN`, and final `ROLLBACK`;
- a `run_dml` psql switch that always runs catalog checks and encloses fixtures/role switching/claim behavior in the DML-only branch;
- `pg_policies`, `has_table_privilege`, `has_function_privilege`, and `pg_trigger` assertions;
- `pg_class.relrowsecurity = true` for `public.lessons`, absence of `lessons_teacher_own`/`lessons_admin_all`, and presence of normalized manager select/update/delete policies with the NEW-row owner predicate;
- checks for authenticated select plus denied insert/update/delete;
- service enqueue, upload, cancel/retry, and worker-state transitions;
- draft/rejected delete, draft update, approved update/delete rejection, and non-approved cascade;
- null/source/target transfer rejection, owner/admin success, global-admin success, and service-role maintenance.
- unchanged original job/usage organization and reservation count after lesson reassignment plus retry.

- [ ] **Step 2: Verify the extended test fails**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
```

Expected: FAIL because the verification script does not exist.

- [ ] **Step 3: Implement a self-contained, rollback-only SQL verifier**

The script must:

1. enable `ON_ERROR_STOP`, default `run_dml` to false when omitted, and start a transaction;
2. always verify the effective policy/privilege/trigger catalog matrix, including normalized lesson manager policies;
3. when `run_dml=true`, preflight that the connection can assume both roles and that no queued/running content jobs pre-exist;
4. only inside that DML branch, create deterministic fixtures and run role-switched behavior tests;
5. use self-asserting `DO` blocks that raise on false catalog predicates, wrong row counts, wrong persisted values, or unexpected SQLSTATEs;
6. set local JWT claims/roles exactly when exercising authenticated and service-role behavior;
7. verify all three mutating RPC ACLs and the existing service-only `insert_generated_lesson_artifact(uuid, uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid, uuid, uuid)` worker RPC;
8. exercise the DML and trigger matrix listed in Step 1;
9. close the conditional and roll back after successful verification.

Use this psql framing:

```sql
\set ON_ERROR_STOP on
\if :{?run_dml}
\else
  \set run_dml false
\endif

BEGIN;
\if :run_dml
\endif
ROLLBACK;
```

Place this runnable catalog block immediately after `BEGIN` and before the DML conditional:

```sql
DO $verify_catalog$
DECLARE
  function_name text;
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
  ) <> 3 OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname = 'lessons_manager_update'
      AND qual LIKE '%can_manage_lesson%'
      AND with_check LIKE '%can_assign_lesson_teacher%'
  ) OR to_regprocedure('public.can_assign_lesson_teacher(uuid)') IS NULL
    OR NOT has_function_privilege(
      'authenticated', 'public.can_assign_lesson_teacher(uuid)', 'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'lesson manager RLS matrix is incorrect';
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
END;
$verify_catalog$;
```

The DML preflight must fail before fixtures if this query returns any row:

```sql
SELECT id FROM public.content_jobs
WHERE status IN ('queued', 'running')
LIMIT 1;
```

Implement that as a `DO` assertion, not a visual/manual check.

Use stable fixture variables so every assertion identifies the same rows:

```sql
\set teacher_user_id  '10000000-0000-4000-8000-000000000001'
\set admin_user_id    '10000000-0000-4000-8000-000000000002'
\set other_teacher_user_id '10000000-0000-4000-8000-000000000003'
\set teacher_id       '20000000-0000-4000-8000-000000000001'
\set other_teacher_id '20000000-0000-4000-8000-000000000002'
\set source_org_id    '30000000-0000-4000-8000-000000000001'
\set target_org_id    '30000000-0000-4000-8000-000000000002'
\set lesson_id        '40000000-0000-4000-8000-000000000001'
\set objective_id     '50000000-0000-4000-8000-000000000001'
\set job_id           '60000000-0000-4000-8000-000000000001'
\set upload_job_id    '60000000-0000-4000-8000-000000000002'
\set batch_id         '70000000-0000-4000-8000-000000000001'
\set upload_batch_id  '70000000-0000-4000-8000-000000000002'
\set draft_artifact   '80000000-0000-4000-8000-000000000001'
\set rejected_artifact '80000000-0000-4000-8000-000000000002'
\set approved_artifact '80000000-0000-4000-8000-000000000003'
\set upload_artifact  '80000000-0000-4000-8000-000000000004'
\set upload_asset     '90000000-0000-4000-8000-000000000001'
```

Insert only current-schema columns, using these exact fixture shapes:

- `public.users(id, email, name, role)`: the owning teacher, a second teacher, and one global admin;
- `public.teachers(id, user_id)`: both teacher profiles;
- `public.organizations(id, name, owner_id)`: source and target organizations;
- `public.organization_members(organization_id, user_id, role, is_active)`: normalize the trigger-created teacher rows to the role/state needed by each test, restoring active owner/admin rows between rejection cases;
- `public.lessons(id, title, subject, gradelevel, objectives, content, teacher_id, organization_id)`: one teacher-owned source-organization lesson;
- `public.lesson_objectives(id, lesson_id, text, position, revision)`: the active objective;
- `public.lesson_artifacts(id, lesson_id, objective_id, series_id, version, objective_revision, kind, status, position, payload, source, created_by)`: separate draft, rejected, approved, and cascade fixtures with unique series IDs.

Use `ON CONFLICT` only where setup triggers can legitimately precreate a membership. Any unexpected pre-existing deterministic ID should fail the disposable-environment gate rather than silently reuse unrelated data.

After inserting fixtures, expose those IDs to dollar-quoted assertion blocks:

```sql
CREATE TEMP TABLE verification_ids (
  teacher_user_id uuid,
  admin_user_id uuid,
  other_teacher_user_id uuid,
  teacher_id uuid,
  other_teacher_id uuid,
  source_org_id uuid,
  target_org_id uuid,
  lesson_id uuid,
  objective_id uuid,
  job_id uuid,
  draft_artifact uuid,
  rejected_artifact uuid,
  approved_artifact uuid
) ON COMMIT DROP;

INSERT INTO verification_ids VALUES (
  :'teacher_user_id', :'admin_user_id', :'other_teacher_user_id',
  :'teacher_id', :'other_teacher_id',
  :'source_org_id', :'target_org_id', :'lesson_id', :'objective_id', :'job_id',
  :'draft_artifact', :'rejected_artifact', :'approved_artifact'
);

GRANT SELECT ON verification_ids TO authenticated, service_role;
```

Preflight the connection before inserts:

```sql
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER')
    OR NOT pg_has_role(current_user, 'service_role', 'MEMBER') THEN
    RAISE EXCEPTION 'Verification requires a direct migration-owner connection that can assume authenticated and service_role';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
RESET ROLE;
SET LOCAL ROLE service_role;
RESET ROLE;
```

For every authenticated block, set both scalar and JSON Supabase claim GUCs before assuming the role; repeat with `service_role` for trusted RPC blocks:

```sql
SELECT set_config('request.jwt.claim.sub', :'teacher_user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'teacher_user_id', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;
SELECT id FROM public.content_jobs
WHERE id = :'job_id' AND requested_by = :'teacher_user_id';
RESET ROLE;
```

For service RPC blocks, replace the role in both claim GUCs and assume `service_role`:

```sql
SELECT set_config('request.jwt.claim.sub', :'teacher_user_id', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'teacher_user_id', 'role', 'service_role')::text,
  true
);
SET LOCAL ROLE service_role;
SELECT auth.role();
RESET ROLE;
```

Because psql does not substitute `:variables` inside dollar-quoted `DO` bodies, persist fixture IDs in a `pg_temp.verification_ids` row before exception blocks. PL/pgSQL blocks must select IDs from that temp row rather than embedding psql variables inside `$$ ... $$`. The explicit grant above is required because changing roles does not inherit the migration owner's temp-table privileges.

Each expected failure belongs in a nested PL/pgSQL exception block. ACL and organization-guard failures must match SQLSTATE `42501` and the guard's stable message. Approved artifact update/delete must instead match SQLSTATE `P0001` and `Approved lesson artifacts are immutable; create a new version`. If the statement unexpectedly succeeds, or a different code/message is raised, re-raise and fail the script.

Use the same fail-closed shape for every expected error:

```sql
DO $$
DECLARE
  ids pg_temp.verification_ids%ROWTYPE;
  raised_message text;
BEGIN
  SELECT * INTO STRICT ids FROM pg_temp.verification_ids;
  BEGIN
    UPDATE public.lessons SET organization_id = NULL WHERE id = ids.lesson_id;
    RAISE EXCEPTION 'Expected organization clear to fail' USING ERRCODE = 'ZX001';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS raised_message = MESSAGE_TEXT;
    IF raised_message <> 'Lesson organization cannot be cleared' THEN
      RAISE EXCEPTION 'Wrong organization-clear error: %', raised_message;
    END IF;
  END;
END;
$$;
```

Implement this complete behavior matrix; do not replace a row with a source-string assertion:

| Actor/setup | Operation | Required assertion |
|---|---|---|
| authenticated teacher, own job | `SELECT` | fixture job returned |
| authenticated teacher | direct job `INSERT`, `UPDATE`, `DELETE` | each raises `42501`; fixture unchanged |
| service role | enqueue with usage | one queued job and one source-org usage row |
| service role, isolated queue | `claim_content_jobs` | only fixture job becomes running with lease/attempt increment |
| service role | cancel queued fixture | one row becomes cancelled |
| service role | retry failed/cancelled fixture | one row returns to queued without new usage |
| service role | worker success transition | one owned running row becomes succeeded and releases lease |
| service role | upload RPC | returned and persisted asset/artifact/job IDs match fixtures |
| service role, draft/rejected | update/delete | exact row count one and persisted/absent state matches |
| service role, approved | update/delete | `P0001` plus exact immutability message; row unchanged |
| service role, non-approved parent | cascade delete | child artifact no longer exists |
| teacher active owner/admin in source and target | lesson reassignment | one row updated to target |
| teacher missing/inactive/member in source | lesson reassignment | `42501` plus current-organization message; row unchanged |
| teacher missing/inactive/member in target | lesson reassignment | `42501` plus target-organization message; row unchanged |
| teacher | explicit organization `NULL` | `42501` plus clear message; row unchanged |
| teacher | change `teacher_id` to another teacher | RLS rejects; owner remains unchanged |
| global admin user | source-to-target reassignment | succeeds without memberships |
| global admin user | intentional `teacher_id` change | succeeds through NEW-row owner predicate |
| service role | reassignment or null maintenance | succeeds as explicit maintenance bypass |

Execute the DML rows in this order so each precondition is deterministic: isolation/role preflight; fixture inserts; service enqueue with usage; authenticated read/write denial; service claim; cancel/retry/worker transitions; upload RPC; artifact update/delete/cascade; teacher/admin/service organization cases; original-org quota assertions; `RESET ROLE`; `\endif`; `ROLLBACK`.

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

Authorization failures for ACL and organization-guard cases must assert SQLSTATE `42501`; any other error fails the verifier. For successful artifact behavior, capture `ROW_COUNT` and query persisted state: draft/rejected deletes each affect one row and leave no row, draft update affects one row and persists its new payload, and the non-approved parent cascade removes its child artifact. This prevents an unrelated FK/RLS error from satisfying the test.

For quota attribution, enqueue `job_id` in `source_org_id` with one usage item `{ "category": "quiz_generation", "quantity": 1, "referenceId": "verify:quota" }`. Record the job organization and matching ledger count, reassign the lesson to `target_org_id` through the service-role maintenance path, and perform the existing retry transition on that job. Assert afterward that:

- the job still owns `source_org_id`;
- the usage row still owns `source_org_id`;
- exactly one `verify:quota` usage reservation exists;
- no matching target-organization reservation was created.

Use this exact enqueue shape so the verifier exercises the real quota RPC rather than a direct fixture insert:

```sql
SELECT public.enqueue_content_jobs_with_usage(
  :'source_org_id'::uuid,
  :'teacher_user_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'id', :'job_id',
    'batch_id', :'batch_id',
    'lesson_id', :'lesson_id',
    'objective_id', :'objective_id',
    'requested_by', :'teacher_user_id',
    'job_type', 'generate_structured_quiz',
    'idempotency_key', 'verify:quota',
    'input', '{}'::jsonb
  )),
  jsonb_build_array(jsonb_build_object(
    'category', 'quiz_generation',
    'quantity', 1,
    'referenceId', 'verify:quota'
  ))
);
```

The upload-RPC case must use the complete contract and materialize its return value for assertions:

```sql
CREATE TEMP TABLE verification_upload_result (payload jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON verification_upload_result TO service_role;

-- Run this INSERT only after setting service-role claims and SET LOCAL ROLE service_role.
INSERT INTO pg_temp.verification_upload_result (payload)
SELECT public.create_uploaded_lesson_artifact(
  :'source_org_id'::uuid,
  :'teacher_user_id'::uuid,
  'verify:upload',
  jsonb_build_object(
    'id', :'upload_asset',
    'lesson_id', :'lesson_id',
    'objective_id', :'objective_id',
    'asset_type', 'uploaded_media',
    'storage_bucket', 'lesson-assets',
    'storage_path', 'verification/' || :'upload_asset',
    'mime_type', 'image/png',
    'byte_size', 1,
    'checksum_sha256', repeat('a', 64),
    'original_filename', 'verification.png',
    'alt_text', 'Verification image',
    'caption', '',
    'processing_status', 'ready'
  ),
  jsonb_build_object(
    'id', :'upload_artifact',
    'lesson_id', :'lesson_id',
    'objective_id', :'objective_id',
    'objective_revision', 1,
    'kind', 'uploaded_media',
    'position', 9,
    'payload', jsonb_build_object('assetId', :'upload_asset')
  ),
  jsonb_build_object(
    'id', :'upload_job_id',
    'batch_id', :'upload_batch_id',
    'lesson_id', :'lesson_id',
    'objective_id', :'objective_id',
    'job_type', 'extract_media',
    'idempotency_key', 'verify:upload-job',
    'input', '{}'::jsonb
  )
) AS payload;
```

After `RESET ROLE`, assert `payload #>> '{asset,id}'`, `payload #>> '{artifact,id}'`, and `payload #>> '{job,id}'` equal their deterministic IDs, and confirm all three rows exist before continuing. Creating the temp table as the migration owner before role switching avoids cross-role ownership failures.

- [ ] **Step 4: Verify the checked-in contract**

Run:

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
git diff --check
```

Expected: PASS. This source contract only guards that the intended matrix remains checked in; PostgreSQL execution in Step 6 is the sole proof that the verifier and migration behave correctly.

- [ ] **Step 5: Commit Task 5**

```powershell
git add supabase/verification/0035_harden_lesson_artifact_writes.sql src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
git commit -m "test(db): add hardening verifier"
```

- [ ] **Step 6: Run the production-rollout database gate when direct environments are available**

For the full DML matrix, use direct migration-owner connections to isolated, empty disposable environments. Expect exit code `0`, no assertion raises, and the transaction rolls back. Run against both:

- a clean environment provisioned from the operator's canonical `0034` schema baseline, after applying `0035`;
- an isolated upgrade clone already at `0034`, after applying only `0035`.

Do not call the first environment a raw full-chain replay; the known `0021` typo makes that a separate migration-history repair.

Use the two operator-provided direct URLs explicitly:

```powershell
$env:DATABASE_URL = $env:BASELINE_DATABASE_URL
psql $env:DATABASE_URL -X -v ON_ERROR_STOP=1 -v run_dml=true -f 'supabase\verification\0035_harden_lesson_artifact_writes.sql'
$env:DATABASE_URL = $env:UPGRADE_DATABASE_URL
psql $env:DATABASE_URL -X -v ON_ERROR_STOP=1 -v run_dml=true -f 'supabase\verification\0035_harden_lesson_artifact_writes.sql'
```

The repository has no `supabase/config.toml`, migration-runner command, canonical baseline, or disposable database harness. Therefore the operator must provide `BASELINE_DATABASE_URL`, `UPGRADE_DATABASE_URL`, and the canonical `0034` baseline externally. Record both platform migration results and both verifier exit codes in rollout evidence; do not describe them as repo-automated CI.

After the migration reaches a shared staging or production target, run catalog-only mode; it must not create fixtures or call `claim_content_jobs`:

```powershell
psql $env:DATABASE_URL -X -v ON_ERROR_STOP=1 -v run_dml=false -f 'supabase\verification\0035_harden_lesson_artifact_writes.sql'
```

This is a production-rollout gate, not a merge blocker.

---

### Task 6: Run project verification and stage the rollout safely

**Files:**
- Verify only; no new production files expected.

- [ ] **Step 1: Run all focused regression tests together**

```powershell
pnpm exec vitest run src/lib/lesson-artifacts/__tests__/lesson-update.test.ts src/lib/lesson-artifacts/__tests__/lesson-update-route.test.ts src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts src/lib/lesson-artifacts/__tests__/migration-hardening.test.ts
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

1. Apply migration `0035` to the isolated upgrade clone and require the full `run_dml=true` verifier to exit `0`.
2. Apply migration `0035` to the shared target.
3. Run `run_dml=false` catalog-only verification on the shared target and require exit `0`.
4. Confirm bundle generation, regeneration/retry, upload extraction, cancellation, and worker progression still succeed through service-role paths.
5. Deploy the application route/form changes.
6. Edit an existing lesson without choosing an organization and verify its `organization_id` remains unchanged.
7. Exercise one authorized reassignment and one insufficient-role reassignment; expect success and `403`, respectively.

- [ ] **Step 5: Monitor and recover forward-only**

Monitor permission errors, lesson PUT `400/403/500` rates, queued jobs that stop progressing, and worker failures. If a defect appears, roll back the application bundle if useful, but repair database behavior with a new forward migration. Never restore authenticated job writes, null organization detachment, or `RETURN NEW` for artifact deletes.
