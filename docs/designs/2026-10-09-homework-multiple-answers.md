# Homework multiple answers implementation plan

> Execute inline using the executing-plans workflow in the existing checkout. Subsequent user requests authorized the live homework migrations/history alignment and commit, push, PR creation, and merge for Vercel delivery.

**Goal:** Teachers choose one answer or multiple answers for choice questions; students select and submit the matching response format.

**Architecture:** Keep existing `multiple_choice` questions and string answers compatible. Reuse lesson quizzes' `multiple_select` type with string-array keys and responses. Keys remain private. Multiple-answer provisional grading requires the exact correct set, independent of selection order, with zero provisional credit for missing/extra choices; teachers retain partial-credit overrides with reasons and approve all released marks.

**Tech stack:** Existing Next.js/React, Zod, Supabase/PostgreSQL, Vitest, and the isolated browser/database harnesses. No new dependencies.

**Design:** The response-type selector offers “Multiple choice · one answer” and “Multiple choice · multiple answers.” Teacher-only keys use a select or checkboxes. Students get radios or checkboxes with explicit “Select all that apply” instructions. Preview, receipts, revisions, and marking reuse the same response component. Existing published questions remain immutable; duplicate them to change response type. Arrays are validated by question type: up to eight distinct available choices or up to three UUID attachment references.

## Tasks

- [x] Add failing domain tests for multi-answer key validation, private projection, response validation, and exact-set provisional scoring. Update `src/lib/homework/domain.ts`; keep existing single-answer/file validation passing.
- [x] Add a failing PostgreSQL submission/scoring regression to `scripts/check-homework-migration.mjs`. Create a CLI-generated follow-up migration replacing `homework_mutate` while preserving authorization, versioning, history, and service-only permissions. Test base migration then upgrade without modifying historical data.
- [x] Extend `TeacherHomeworkEditor.tsx`, `shared.tsx`, `TeacherHomeworkMarking.tsx`, lesson import in `sources.ts`, and AI draft instructions in `/api/homework/generate`. Add browser checks for authoring, selecting/deselecting, autosave, restored arrays, read-only review, and submitted/graded display.
- [x] Run focused domain/import tests, isolated PostgreSQL assertions, actual-component browser checks, TypeScript, and affected lint. Review the change, fix relevant findings, and update setup notes with the new migration prerequisite.

## Execution ledger

Domain and import failures were reproduced before their fixes. The original database rejected a valid multiple-answer array with `INVALID_ANSWERS`; the upgrade then passed. The CLI created `20261009120603_homework_multiple_answers.sql`; it replaces the transactional function, retains service-only permissions and prior audit fixes, and leaves existing data unchanged.

Checks: 30 Vitest tests in 9 files, 64 isolated PostgreSQL assertions, and 37 actual-component browser checks passed. TypeScript passed. Homework ESLint passed with zero errors and 7 unchanged nonblocking warnings. Git whitespace checks passed. Browser checks cover single/multiple-answer compatibility, checkbox deselection, teacher-only key arrays, preview, saving, restored selection arrays, review/submission, receipts, marking-key presentation, and partial-credit overrides. A fresh read-only review found no confirmed actionable issues; the self-review found no further material issues. Production build and live authenticated database/Storage/AI behavior remain untested.

Ruling: reuse `multiple_select` from published lesson quizzes rather than adding a second selection-mode field — one question type determines the response/key shape consistently across import, UI, validation, and scoring.
Ruling: exact-set provisional scoring plus existing teacher overrides — keeps single-answer grading consistent and avoids an unrequested partial-credit formula.
Ruling: add a follow-up migration instead of editing the base migration — supports environments that already installed homework without rewriting their questions, marks, or submissions. Apply it before deploying/using multiple-answer work.

On 2026-10-09, the user requested migration application. The configured project `insyte` (`qhadctjpzfyimwfabvdc`) had no homework tables, so the base and follow-up were applied in order. The connector initially recorded versions `20261009122205` and `20261009122216`, respectively. Live catalog checks verified multiple-answer support, service-only RPC/table access, RLS on all eight homework tables, the private upload bucket, and the restrictive browser Storage policy. Automatic approval review initially rejected history alignment; after explicit user approval, those two records were aligned with local versions `20261009102533` and `20261009120603`. Before/after metadata checksums confirmed only the version fields changed and unrelated history was preserved. The connector's migration listing confirmed the matching versions. Actual authenticated submission, private file transfers, and AI behavior remain untested against the live environment.

## Boundaries

The user's subsequent requests authorized the base and follow-up migration application, alignment of their two history records with local filenames, and commit, push, PR creation, and merge for Vercel delivery. Creating or publishing real homework assignments remains outside the release request. Existing marks/submissions are not recalculated.
