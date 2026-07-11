# Lesson Authoring Regression Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Objective Studio action feedback, lesson date/ownership handling, and sandboxed React visualization rendering.

**Architecture:** Keep UI state helpers and lesson record mapping as small pure functions with direct unit coverage. Normalize database records at API boundaries and authorize lesson mutation through `teacher_id -> teachers.user_id`. Preserve the opaque-origin iframe and CSP while replacing its failing React ES-module boot with pinned UMD globals and explicit load errors.

**Tech Stack:** Next.js 16, React 19 host application, TypeScript, Supabase, Vitest, sandboxed iframe runtime, React 18.3.1 UMD sandbox dependencies.

## Global Constraints

- Generated code must remain inside `sandbox="allow-scripts"`; never add `allow-same-origin`.
- Teacher approval remains disabled until `sandbox-runtime` validation passes.
- Do not reintroduce the removed `public.lessons.teacher` column.
- Preserve existing API fields while adding the camel-case UI contract.
- Apply every production change only after its regression test fails for the expected reason.

---

### Task 1: Action-specific artifact loading state

**Files:**
- Modify: `src/lib/lesson-artifacts/authoring-ui.ts`
- Modify: `src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts`
- Modify: `src/components/lessons/ObjectiveAuthoringWorkspace.tsx`

**Interfaces:**
- Produces: `ArtifactAction`, `ArtifactBusyState`, and `isArtifactActionBusy(state, artifactId, action): boolean`.
- Consumes: existing Objective Studio review and regeneration handlers.

- [ ] **Step 1: Write the failing action-state test**

```ts
expect(isArtifactActionBusy(
  { artifactId: 'artifact-1', action: 'regenerate' },
  'artifact-1',
  'regenerate',
)).toBe(true);
expect(isArtifactActionBusy(
  { artifactId: 'artifact-1', action: 'regenerate' },
  'artifact-1',
  'approve',
)).toBe(false);
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts`

Expected: FAIL because `isArtifactActionBusy` is not exported.

- [ ] **Step 3: Add the minimal helper and wire the component**

```ts
export type ArtifactAction = 'approve' | 'reject' | 'regenerate';
export type ArtifactBusyState = { artifactId: string; action: ArtifactAction } | undefined;

export function isArtifactActionBusy(
  state: ArtifactBusyState,
  artifactId: string,
  action: ArtifactAction,
): boolean {
  return state?.artifactId === artifactId && state.action === action;
}
```

In `ObjectiveAuthoringWorkspace`, keep lesson-level `busy` state and add `artifactBusy`. Set it in `review` and `regenerate`, clear it in their terminal paths, disable all actions for the busy artifact, and render `Loader2` only in the active action button.

- [ ] **Step 4: Verify Task 1**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts && pnpm typecheck`

Expected: PASS; Regenerate, Approve, and Reject compile with action-specific state.

---

### Task 2: Lesson response and date normalization

**Files:**
- Create: `src/lib/lesson-record.ts`
- Create: `src/lib/__tests__/lesson-record.test.ts`
- Modify: `src/app/api/lessons/route.ts`
- Modify: `src/app/api/lessons/[lessonId]/route.ts`
- Modify: `src/app/teachers/lessons/page.tsx`
- Modify: `src/app/teachers/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Produces: `mapLessonRecord<T>(record: T): T & { _id: string; gradeLevel: unknown; createdAt: unknown; updatedAt: unknown }` and `formatLessonDate(value: unknown): string`.
- Consumes: raw Supabase lesson records containing `id`, `gradelevel`, `created_at`, and `updated_at`.

- [ ] **Step 1: Write failing mapping and fallback tests**

```ts
expect(mapLessonRecord({
  id: 'lesson-1',
  gradelevel: 'jhs 1',
  created_at: '2026-07-11T10:00:00.000Z',
  updated_at: '2026-07-11T11:00:00.000Z',
})).toMatchObject({
  _id: 'lesson-1',
  gradeLevel: 'jhs 1',
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T11:00:00.000Z',
});
expect(formatLessonDate(undefined)).toBe('Not available');
expect(formatLessonDate('not-a-date')).toBe('Not available');
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test src/lib/__tests__/lesson-record.test.ts`

Expected: FAIL because `src/lib/lesson-record.ts` does not exist.

- [ ] **Step 3: Implement pure lesson mapping**

```ts
export function mapLessonRecord<T extends Record<string, any>>(record: T) {
  return {
    ...record,
    _id: record.id,
    gradeLevel: record.gradeLevel ?? record.gradelevel ?? null,
    createdAt: record.createdAt ?? record.created_at ?? null,
    updatedAt: record.updatedAt ?? record.updated_at ?? null,
  };
}

export function formatLessonDate(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return 'Not available';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}
```

Map both collection and detail GET responses with `mapLessonRecord`. Replace direct `new Date(...).toLocaleDateString()` calls on the teacher lesson list and overview with `formatLessonDate`.

- [ ] **Step 4: Verify Task 2**

Run: `pnpm test src/lib/__tests__/lesson-record.test.ts && pnpm typecheck`

Expected: PASS; raw and historical nullable timestamps are safe.

---

### Task 3: Normalized lesson mutation authorization

**Files:**
- Modify: `src/app/api/lessons/[lessonId]/route.ts`
- Create: `src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts`

**Interfaces:**
- Consumes: `lessons.teacher_id`, `teachers.id`, `teachers.user_id`, authenticated session user.
- Produces: PUT and DELETE routes that return 403 for unrelated teachers and never query `lessons.teacher`.

- [ ] **Step 1: Write the failing route contract test**

Read the route source and assert all of the following:

```ts
expect(route).not.toContain(".select('id, teacher')");
expect(route).not.toContain('existing.teacher');
expect(route).not.toContain('lesson.teacher');
expect(route).toContain(".select('id, teacher_id')");
expect(route).toContain(".from('teachers')");
expect(route).toContain(".select('user_id')");
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts`

Expected: FAIL on the legacy `teacher` selections.

- [ ] **Step 3: Normalize authorization and update payloads**

For PUT and DELETE, load `id, teacher_id`, resolve the teacher record using:

```ts
const { data: teacher } = await supabase
  .from('teachers')
  .select('user_id')
  .eq('id', existing.teacher_id)
  .maybeSingle();
```

Compare `teacher?.user_id` with `session.user.id`. For PUT, construct a database-shaped allowlisted payload:

```ts
const updateData = {
  title: body.title,
  subject: body.subject,
  gradelevel: body.gradeLevel,
  objectives: body.objectives,
  content: body.content,
  organization_id: body.organizationId,
  updated_at: new Date().toISOString(),
};
```

Return the updated record through `mapLessonRecord`.

- [ ] **Step 4: Verify Task 3**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/lesson-route-contract.test.ts src/lib/__tests__/lesson-record.test.ts && pnpm typecheck`

Expected: PASS; no route source references the removed ownership column.

---

### Task 4: Reliable React sandbox boot

**Files:**
- Create: `src/lib/lesson-artifacts/react-sandbox-runtime.ts`
- Create: `src/lib/lesson-artifacts/__tests__/react-sandbox-runtime.test.ts`
- Modify: `src/components/lessons/ReactRenderer.tsx`

**Interfaces:**
- Produces: `REACT_SANDBOX_SOURCES` with pinned React and ReactDOM UMD URLs and `renderReactSandboxScripts(nonce): string`.
- Consumes: the renderer nonce and existing `reportLessonRenderError` function defined before dependency scripts.

- [ ] **Step 1: Write failing runtime-script tests**

```ts
expect(REACT_SANDBOX_SOURCES).toEqual({
  react: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  reactDom: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
});
const scripts = renderReactSandboxScripts('nonce-1');
expect(scripts).toContain('nonce="nonce-1"');
expect(scripts).toContain('window.React');
expect(scripts).toContain('window.ReactDOM');
expect(scripts).toContain('Failed to load React runtime');
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/react-sandbox-runtime.test.ts`

Expected: FAIL because the runtime module does not exist.

- [ ] **Step 3: Implement pinned scripts and replace ES-module boot**

```ts
export const REACT_SANDBOX_SOURCES = {
  react: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  reactDom: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
} as const;

export function renderReactSandboxScripts(nonce: string): string {
  return `
    <script nonce="${nonce}" src="${REACT_SANDBOX_SOURCES.react}"></script>
    <script nonce="${nonce}" src="${REACT_SANDBOX_SOURCES.reactDom}"></script>
    <script nonce="${nonce}">
      if (!window.React || !window.ReactDOM) {
        reportLessonRenderError(new Error('Failed to load React runtime'));
      } else {
        window.reactLoaded = true;
        window.reactDOMLoaded = true;
      }
    </script>`;
}
```

Inject this string into `ReactRenderer` in place of the two `esm.sh` React imports. Keep `sandbox="allow-scripts"`, nonce CSP, generated-code JSON serialization, and the existing postMessage validation flow unchanged.

- [ ] **Step 4: Verify Task 4 locally**

Run: `pnpm test src/lib/lesson-artifacts/__tests__/react-sandbox-runtime.test.ts && pnpm typecheck`

Expected: PASS; generated HTML uses UMD globals and retains sandbox restrictions.

---

### Task 5: Full verification and browser regression

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: completed fixes from Tasks 1-4.
- Produces: browser evidence for loading indicators, dates, visualization validation, and normalized lesson routes.

- [ ] **Step 1: Run the full automated suite**

Run: `pnpm test && pnpm typecheck`

Expected: all test files and TypeScript pass.

- [ ] **Step 2: Run targeted lint**

Run ESLint against the files modified in Tasks 1-4.

Expected: zero lint errors in the changed files.

- [ ] **Step 3: Verify Objective Studio in the in-app browser**

Open the existing `Codex QA: Forces and Motion` lesson on `localhost:3000`, then confirm:

1. Clicking Regenerate shows its spinner on Regenerate, not Approve.
2. Existing interactives and visual challenge either render successfully and display `Render verified`, or surface an explicit dependency/code error rather than a generic timeout.
3. Approve becomes enabled only after `sandbox-runtime` validation passes.
4. Overview Created and Last Updated display valid dates or `Not available`.

- [ ] **Step 4: Verify lesson mutation authorization**

Edit the test lesson title through the teacher form and restore it, confirming PUT succeeds for the owner. Do not delete the lesson during browser verification; automated contract coverage verifies the DELETE ownership path without destructive test data changes.
