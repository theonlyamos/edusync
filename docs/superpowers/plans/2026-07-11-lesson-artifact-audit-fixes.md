# Lesson Artifact Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair all approved reliability, security, data-integrity, and UX findings in the lesson-artifact workflow.

**Architecture:** Put durable reservations and version allocation in Postgres transactions, keep the worker runtime independent from Next request guards, and expose small pure helpers for policy/UI behavior. UI components report real success signals instead of inferring success from mounting.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Zod, Vitest, Tailwind CSS.

## Global Constraints

- Preserve teacher-approved-first artifact selection.
- Generate fallback only after the published objective bundle is exhausted.
- Default to six fallback generations per objective per learning run; allow an environment override.
- Do not expose quiz answer keys to students before submission.
- Keep publication snapshots immutable.
- Preserve existing uncommitted user work and do not commit automatically.

---

### Task 1: Runtime and domain contracts

**Files:**
- Create: `src/lib/supabase-admin.ts`
- Create: `src/lib/lesson-artifacts/content-worker-runtime.ts`
- Modify: `scripts/content-worker.ts`
- Modify: `src/lib/lesson-artifacts/job-processor.ts`
- Modify: `src/lib/lesson-artifacts/domain.ts`
- Test: `src/lib/lesson-artifacts/__tests__/worker.test.ts`
- Test: `src/lib/lesson-artifacts/__tests__/domain.test.ts`

- [ ] Write tests proving worker batch errors are retried and invalid quiz IDs/options/answers are rejected.
- [ ] Run the tests and verify they fail for the missing behavior.
- [ ] Add the runtime-neutral service client and resilient worker loop; strengthen Zod cross-field quiz validation.
- [ ] Re-run the targeted tests and standalone import smoke test.

### Task 2: Atomic cost and publication controls

**Files:**
- Modify: `supabase/migrations/0033_objective_artifacts.sql`
- Modify: `src/app/api/teachers/objectives/[objectiveId]/assets/route.ts`
- Modify: `src/app/api/teachers/objectives/[objectiveId]/generate-bundle/route.ts`
- Modify: `src/app/api/teachers/artifacts/[artifactId]/regenerate/route.ts`
- Modify: `src/app/api/teachers/lessons/[lessonId]/publish/route.ts`
- Modify: `src/app/api/learning-runs/[runId]/artifacts/next/route.ts`
- Modify: `src/lib/lesson-artifacts/learning-server.ts`
- Test: `src/lib/lesson-artifacts/__tests__/migration.test.ts`
- Test: `src/lib/lesson-artifacts/__tests__/fallback-policy.test.ts`

- [ ] Write migration/policy tests for atomic enqueue, atomic upload creation, locked publication, and fallback reservation.
- [ ] Run them and verify the new contract assertions fail.
- [ ] Add the Postgres functions and route integrations, canonical rate limiting, and server-owned fallback allowance.
- [ ] Re-run targeted tests.

### Task 3: Prompt and render trust boundaries

**Files:**
- Create: `src/lib/lesson-artifacts/grounding.ts`
- Create: `src/app/api/teachers/artifacts/[artifactId]/validation/route.ts`
- Modify: `src/app/api/tutor/route.ts`
- Modify: `src/lib/lesson-artifacts/jobs.ts`
- Modify: `src/app/api/teachers/artifacts/[artifactId]/review/route.ts`
- Modify: `src/components/lessons/ReactRenderer.tsx`
- Modify: `src/components/lessons/SafeCodeRunner.tsx`
- Test: `src/lib/lesson-artifacts/__tests__/grounding.test.ts`
- Test: `src/lib/lesson-artifacts/__tests__/jobs.test.ts`

- [ ] Write tests for untrusted-source delimiting and pending runtime validation.
- [ ] Run them and verify the old behavior fails.
- [ ] Implement safe prompt construction, real renderer callbacks, validation persistence, and approval enforcement.
- [ ] Re-run targeted tests.

### Task 4: Authoring and learner UX resilience

**Files:**
- Create: `src/lib/lesson-artifacts/authoring-ui.ts`
- Modify: `src/components/lessons/ObjectiveAuthoringWorkspace.tsx`
- Modify: `src/components/students/study-companion/LearningArtifactCard.tsx`
- Modify: `src/components/students/study-companion/InteractiveElementCard.tsx`
- Modify: `src/components/lessons/CreateLessonForm.tsx`
- Modify: `.gitignore`
- Test: `src/lib/lesson-artifacts/__tests__/authoring-ui.test.ts`

- [ ] Write tests for dirty-draft synchronization, job summaries, and generated-draft merging.
- [ ] Run them and verify they fail before helpers exist.
- [ ] Implement dirty-state preservation, explicit polling outcomes, complete quiz review, successful-render consumption, recoverable loading errors, accessible labels, and theme-token surfaces.
- [ ] Remove the generated package cache and add the ignore rule.
- [ ] Run targeted tests, full tests, typecheck, lint, worker smoke test, and production build.

