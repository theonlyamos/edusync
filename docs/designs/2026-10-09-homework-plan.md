# Homework implementation plan

**Goal:** Deliver the approved teacher/student homework cycle without changing assessment behavior. Initial delivery was local; subsequent user requests authorized live migrations and GitHub/Vercel delivery.
**Architecture:** Dedicated server-authorized homework tables, immutable published questions and lesson references, transactional service-only RPCs for lifecycle transitions, and shared React views inside DashboardLayout. The existing service-role server client remains server-only; clients have no direct table or attachment access.
**Stack:** Next.js, React, existing Radix/Tailwind UI, Supabase PostgreSQL/Storage, Zod, Vitest.
**Spec:** `docs/designs/2026-10-09-homework-design.md`.

## Constraints and decisions

- Work natively in this checkout. The initial review boundary was uncommitted and undeployed; the user subsequently authorized commit, push, PR creation, and merge.
- Reuse the existing lesson manager boundary and published manifest. Homework source objectives and questions are copied at publication.
- Eligible recipients must be active students in the lesson organization, with the teacher an active organization member. No global grade-based assignment. Lessons without an organization can be authored but cannot be published until school membership is configured.
- UTC is the initial explicit school timezone default; support an IANA timezone per homework, with timestamp fields retaining exact offsets.
- Separate student-safe questions and teacher-only keys. All homework tables/bucket use deny-by-default client access and service-only server routes with explicit ownership/recipient checks.
- Default accept late work. Optional hard close, individual extensions, immutable submitted attempts, new attempts for requested revisions.
- New marks remain private; release copies a completed grade snapshot and retains version history. Student aggregates use the latest released attempt per homework.

## Review focus

- Cross-school recipient IDs and stale school membership must not authorize publication or reads.
- Submission retries after a timeout must return the same immutable attempt; concurrent draft updates must not overwrite newer versions.
- Failed upload/submission must preserve work, and attachment IDs from another student/question must be rejected.
- Incomplete/out-of-range grading must never release; changing a released grading draft must not change visible results before rerelease.
- Revision and individual-extension deadlines must take precedence over the original deadline without changing past on-time status.

## Tasks

- [x] 1. Domain: `src/lib/homework/domain.ts` with Zod draft/question/key/answer/mark schemas, safe projection, validation, file checks, deterministic scoring, latest-released aggregation; regression tests in `src/lib/homework/__tests__/domain.test.ts`. Watch tests fail, implement, rerun.
- [x] 2. Database: CLI-created migration with homework, private keys, recipients, attempts, attachments, grades, events, grade history and service-only transactional mutations. Test with an isolated PostgreSQL runtime if available, including authorization, atomic publish/save/submit/release/revision/extension and client privilege denial.
- [x] 3. Server/API: `src/lib/homework/server.ts`, `operations.ts`, `sources.ts`, and `/api/homework` collection/detail/action/attachment/source routes. Authenticate from the database-backed session; authorize each lookup; sanitize student responses. Tests cover access/projection/error boundaries.
- [x] 4. Teacher: `src/components/homework/TeacherHomework*.tsx` and teacher homework pages for overview, creation/edit steps, preview/publish, roster, marking, insights, and dialogs. Real server data and actions, no mock data.
- [x] 5. Student: `src/components/homework/StudentHomework*.tsx`, student list/detail/performance pages, per-question autosave/local recovery/concurrency, private uploads, review/submit/receipt, released feedback and revision history.
- [x] 6. Integrate: sidebar, dashboards, lesson entry points; teacher AI drafting/import and controlled homework hint endpoint. General AI endpoints must not bypass homework help restrictions; retain unrelated exam/practice behavior where possible.
- [x] 7. Verify: focused Vitest, TypeScript, affected ESLint, SQL integration, browser smoke where feasible; audit owned changes and fix relevant findings. Document deployment prerequisites and any unverified live AI/storage behavior.

## Execution ledger

This ledger records the initial implementation and audit. Later multi-answer support, live migration application/history alignment, and release verification are recorded in `2026-10-09-homework-multiple-answers.md` and `2026-10-09-homework-implementation.md`. The user authorized GitHub/Vercel delivery after those reviews.

Plan written from the approved design. User authorization to proceed covers implementation and routine fixes. No push, deployment, or live schema changes are authorized.

Task 1: complete — domain schemas and safe projection; duplicate attachment and source-version regressions observed RED then GREEN.
Task 2: complete — CLI-created migration; final isolated PostgreSQL check passed 43 assertions. No live migration applied.
Task 3: complete — session/owner/recipient checks, service-only operations, bounded request/upload bodies, private signed attachment access, paged reads; mocked server boundary tests pass.
Task 4: complete — teacher list/editor/assignment/marking/insights and route wrappers; authoring locks during saves.
Task 5: complete — student list/work/review/receipt/feedback/history/revision/performance; serialized versioned saves, scoped browser recovery, atomically linked uploads.
Task 6: complete — existing navigation/dashboard/lesson entry points; lesson quiz import, teacher AI drafts, controlled hints, general AI policy guard.
Task 7: complete — 20 Vitest tests, 43 SQL assertions, 24 browser checks at 390/1280px; TypeScript exits 0; affected ESLint exits 0 (34 warnings, including existing files); git diff --check clean.

Final review: one fresh read-only reviewer completed the owned diff. Four material findings were fixed: malformed successful responses throw (regression RED/GREEN); lost upload responses recover via atomic answer linkage (SQL RED/GREEN); prior feedback remains accessible during revision (browser check); teacher inputs lock during save (browser check). The browser also reproduced a cleared marking confirmation; its hydration reset was removed and confirmation now passes.

Final self-audit: UI/UX, duplication, security, performance and error/recovery paths reviewed. Added restrictive Storage policy resistant to pre-existing permissive policies (SQL RED/GREEN), draft organization refresh (SQL RED/GREEN), pinned duplicate-source versions (Vitest RED/GREEN), and owner access to archived unpublished drafts (Vitest RED/GREEN). No unresolved material findings.

Ruling: remain in the current checkout and leave changes uncommitted/undeployed — matches user workflow and preserves review — cost: deployment/migration still required.
Ruling: explicit UTC deadline entry with IANA display timezone — avoids ambiguous local timestamps — cost: teachers convert local school times.
Ruling: school/grade membership supplies selected recipients — this repository has no general classroom roster — cost: class filtering must wait for roster support.
Ruling: pause general AI while any editable homework attempt is open — general tools cannot reliably infer assignment-specific help restrictions — cost: unrelated AI work is paused too; external AI and prior live tokens remain outside enforcement.
Ruling: report caps fail explicitly instead of returning partial totals — preserves denominator correctness — cost: larger histories require a paginated report enhancement.

Deferred minors: nonblocking React hydration-effect warnings and native private-image preview warning; existing-page warnings remain. No production build or live authentication, Storage, or AI-provider checks were performed. Setup and limits are recorded in 2026-10-09-homework-implementation.md.

Follow-up user-requested audit: fixed historical/duplicate bulk release and release counters, unavailable attachment references in recovered drafts, objective-revision aggregation, unsaved teacher link navigation, deterministic pagination, batched school checks/AI guard over-fetching, and unused conversion code. Regression failures were reproduced for release, objective revision, and file recovery. Final checks: 22 Vitest tests, 49 isolated PostgreSQL assertions, 28 browser checks; TypeScript and affected ESLint pass with 34 unchanged nonblocking warnings. Full details and verification boundaries are in 2026-10-09-homework-audit.md. Changes remain uncommitted and undeployed.
