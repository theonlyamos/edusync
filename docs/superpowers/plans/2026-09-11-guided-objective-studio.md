# Guided Objective Studio Implementation Plan

> Execute in this checkout using subagent-driven-development: backend concept generation can run independently of the guided UI. No commits, migration, deployment, or bulk regeneration.

**Goal:** Reduce Studio to one decision/material at a time and generate creative, coordinated objective materials after teacher acceptance of a concept.

**Approved design:** A compact navigable outline leads through lesson direction, lesson introduction, each objective, and publication review. Each objective starts with an editable AI-suggested teaching concept, then generates the five existing materials in the background. Review one large preview with Approve & continue; directions, revision feedback, uploads, and version history appear on demand. Teachers can revisit any step. Keep automatic persistence of approvals and resume background jobs; save direction edits before generation. Keep current publication until republished.

**Architecture:** Reuse current artifact/job/authoring endpoints and private sandbox previews. Add an authorized concept suggestion endpoint. Store accepted creativeConcept in existing job input and artifact generation_metadata; regeneration retains it. No schema change. Unaccepted concepts and navigation can be restored locally per lesson/user/revision. Existing artifacts remain reviewable without a concept.

**Constraints:** Accuracy, legibility, accessibility and render validation remain mandatory. Use existing UI components/theme; no dependencies. Do not automatically approve AI output. Do not regenerate existing published content during UI verification. Preserve all current uncommitted introduction work.

## Task 1: Creative generation backend
- [x] Add validated creativeConcept (20–4000 characters), generate an editable concise teaching plan describing a narrative, visual language, introduction, exploration, application, knowledge check and visual challenge.
- [x] POST teachers/objectives/[objectiveId]/creative-concept accepts guidance/previousConcept and current revision, checks manager access, uses existing text generation/quota patterns, returns creativeConcept and objectiveRevision.
- [x] Bundle request accepts creativeConcept/objectiveRevision and passes the same brief to all jobs; reject stale revisions. Preserve plan in metadata and regeneration. Give each material a distinct role without assuming it can see another result.
- [x] Authoring GET returns viewerId, activeBatchId and latest accepted creativeConcepts for current revisions from existing job inputs/metadata, so refresh can resume.
- [x] Focused tests for bounds, distinct roles, shared context, revision rejection and plan retention; lint/typecheck touched backend files.

## Task 2: Guided Studio UI
- [x] Replace wall of editable cards with a responsive outline and one focused workspace: direction, lesson introduction, objective concept/materials, publication summary.
- [x] Keep existing save/review/regenerate/upload/validation functions. Increase preview height. Use Approve & continue only after successful approval; preserve selected series/version on refresh and show historical versions read-only.
- [x] Editable concept supports Suggest concept / Try another idea / Accept & generate materials; send accepted text and current revision. Handle stale responses after switching objectives. Restore concept drafts keyed by revision and viewer.
- [x] Background generation remains visible in a compact status row, does not interrupt navigation, refreshes partial results, and resumes on reload. Do not mount hidden interactive previews.
- [x] Provide current-revision approval counts, required-introduction errors and recommended missing materials in publication review. Old approved version remains usable while a replacement is reviewed.
- [x] Focused state checks and browser tests at desktop/mobile widths; inspect existing published lesson without altering its artifacts/publication, and exercise concept suggestion without starting bulk generation.

## Task 3: Review and verification
- [x] Audit changed behavior for stale saves/responses, permissions, regeneration plan retention, hidden previews, repeated generation and version navigation.
- [x] Run affected tests, TypeScript, changed-file ESLint and diff whitespace checks. Record concrete browser evidence and any limitations.

## Execution notes
Ruling: Reuse existing JSON job input and metadata for accepted concepts; a new schema/table is unnecessary. Direction edits use the existing explicit save before generation, while approvals and generation progress persist automatically.


## Verification evidence
- 32 lesson-artifact/learning-hook test files passed: 140 tests. Backend role/plan/revision tests included.
- Live concept suggestion returned an editable 2,894-character "Force Arena: Tug & Roll" plan with distinct introduction, exploration, application, knowledge check and visual challenge.
- Existing published QA lesson reviewed without regenerating artifacts or publishing changes. Explore -> Apply -> Knowledge check advances correctly; only one interactive iframe mounts. Approved previews do not attempt draft render validation.
- Reload restored the selected material, historical lesson-introduction version (read-only), and local creative-concept draft. Restored latest version after checking history.
- At 390 x 844, outline collapses after navigation and page/studio scroll widths equal their client widths. Lesson tabs and header controls wrap. Browser viewport restored afterward.
- Review fixes preserve legacy/current material roles, disable version/alternative switching during approval, guard authoring response order, and refresh canonical state after validation without dropping pending save/job refresh intent.
- Scope of live generation verification: concept suggestion only in this iteration. New coordinated artifact bundle generation covered by automated route/job tests; existing published artifacts were preserved.
- Final checks: full TypeScript passed; changed Studio files lint clean; lesson page has the same 16 warnings as HEAD (zero errors). Diff whitespace check passed. Scoped re-review found no outstanding issues.


## Changes Audit before commit
**Scope:** All 45 changed/new files for lesson introductions, teacher visual direction, creative concepts, guided Studio, migration, tests and implementation notes. Reviewed tracked diffs with surrounding call paths and all new source/test files.

**Summary:** Two UI findings fixed; no unresolved blocking findings after re-review.

### Findings addressed
- Medium, UI/recovery: after three failed job-status polls, Studio stopped polling and only showed a transient toast that suggested generating again. It now shows the existing persistent Refresh action, which restores active jobs without requesting duplicate generation.
- Low, accessibility: the focused workspace used a nested main landmark inside DashboardLayout's main. Replaced it with a named section; layout and controls are unchanged.

### Clean dimensions and limits
- Inefficiency: reused the existing artifact/job/quota infrastructure and native history controls; no dependency or second generation pipeline added.
- UI/UX: reviewed focused navigation, current-revision readiness, historical read-only preview, draft validation, mobile wrapping and recovery. The two findings above are corrected.
- Security: manager/viewer authorization, signed private-asset scope, request bounds, quota reservation, immutable publication IDs and database publication validation remain enforced. No embedded credentials found in this change set.
- Performance: only the focused interactive preview mounts; polling does not overlap; partial results reload only when completion counts change. Accepted-concept restoration reads at most one job per active objective in parallel (normal authoring limit: 20 objectives). No unbounded new history fetch was introduced.
- Correctness: reviewed stale-response guards, inherited revision invalidation, teacher feedback/creative-plan retention, legacy role handling and student introduction-first startup. Existing full-bundle/student-browser verification limitations remain recorded above.

Re-review: status recovery uses the existing restoreJobs load path; the workspace has one page main landmark. No remaining audit finding requires a code change.
