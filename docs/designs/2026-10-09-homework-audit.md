# Homework changes audit

Scope: 53 owned, uncommitted files covering the homework implementation, migration, verification script, design documentation, and integration entry points. Existing unrelated application behavior was not changed. The user explicitly authorized both the audit and fixes.

## Summary

Seven findings were fixed: two high, four medium, one low. Reviewed implementation reuse, UI/UX, security, performance, and error/recovery paths. Regression tests reproduced the historical-release, objective-revision, and unavailable-file recovery failures before their fixes.

## Fixed findings

1. **High — bulk release could publish private corrections on historical attempts.** `supabase/migrations/20261009102533_lesson_homework.sql` released every submitted attempt and repeatedly reset release timestamps. Bulk release now selects only each student's latest attempt with new or changed completed grades. Individual unchanged releases are idempotent. The teacher roster's release count and private-correction status follow the same behavior. Older grades can still be explicitly reviewed and released individually.

2. **High — in-app navigation discarded unsaved teacher edits.** `TeacherHomeworkEditor.tsx` and `TeacherHomeworkMarking.tsx` only warned on full unload. A shared leave-warning hook now intercepts ordinary link clicks before client navigation, covers sidebar/header/lesson links, and retains the unload warning. Authoring also confirms replacing unsaved work when choosing another lesson. Switching marking students/attempts clears the prior dirty message after an approved discard.

3. **Medium — browser recovery restored unavailable attachment IDs.** `useHomeworkDraft.ts` could recover a reference to a file deleted in another tab without rendering a removal control, blocking subsequent saves. Recovery now excludes unavailable/question-mismatched file references, preserves writing and choices, and tells the student to re-upload missing work. The browser regression restores the draft, saves successfully, and checks that the written response remains intact.

4. **Medium — performance merged changed objective revisions.** `/api/homework/performance` grouped by objective ID alone and retained old objective text. Aggregation now includes the lesson and pinned objective revision; samples from the same revision still combine. A route test checks both behaviors against released grades.

5. **Medium — paginated reads lacked unique ordering.** Homework lists and detail attempt/grade/attachment queries, plus recipient summary reads, now include a unique ID or composite-key tie-breaker. This prevents unstable page boundaries among rows with equal dates or attempt numbers.

6. **Medium — avoidable database work and payloads.** List membership checks now use one batched query across the page's schools while filtering inactive schools. A route test verifies the access filter and single query. The general AI policy guard now selects only deadline/membership fields, avoiding student answer bodies and full lesson/homework question payloads on every AI request.

7. **Low — unused draft conversion helper.** Removed `draftFromHomework`, which had no callers and duplicated the existing editor/duplicate conversion paths.

## Security and implementation review

- Student responses continue to expose released snapshots only. Private marking keys and private corrections stay server-side until explicit release.
- Owner, assigned-recipient, active-school, upload ownership, request-size, file-size/type, answer, grade, and rubric checks remain enforced.
- Isolated database assertions verify denied browser access to homework tables/RPCs and private Storage even with an existing permissive Storage policy.
- No dependency, environment configuration, live schema, commit, push, or deployment was introduced by this audit.

## Verification

- Vitest: **22 tests, 7 files passed**.
- Isolated PostgreSQL/PGlite: **49 assertions passed**, including historical-attempt exclusion, unchanged-release idempotency, and releasing a changed current grade once.
- Browser: **28 checks passed** using actual React components and existing theme with mocked API/provider/shell at 390px and 1280px. Includes recovered writing with deleted attachment references and cancelled authoring/marking link navigation before the mocked link handler runs.
- TypeScript: **passed**.
- Affected ESLint: **0 errors, 34 existing/nonblocking warnings**.
- Git whitespace check: **passed**.

## Remaining verification boundaries

At this audit, the migration remained unapplied. Subsequent user-authorized live migration application and history alignment are recorded in `2026-10-09-homework-implementation.md`. Production build, actual Next.js browser-history traversal, authenticated end-to-end authorization, live private file transfers, and AI-provider behavior were not tested by this audit. The leave guard covers link clicks and full unload; save teacher drafts before using browser history controls. Local browser checks do not establish live readiness.

## Release review

The delivery review rechecked the homework boundaries, answer/key projections, scoped file access, lifecycle operations, recovery/navigation behavior, and bounded/paginated report queries. No further material homework findings were confirmed across implementation reuse, UI/UX, security, performance, and recovery paths. The review found a pre-existing CI lint configuration issue: React rule overrides applied to CommonJS files outside Next's React-plugin scope. The overrides now match the plugin's file scope while general security/error rules remain active on standalone scripts. This was reproduced against an existing `.cjs` verification script before the fix.
