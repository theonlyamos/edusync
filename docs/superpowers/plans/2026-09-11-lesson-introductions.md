# Lesson introductions and teacher visual direction

> Execution: subagent-driven-development, with backend work by the primary agent and one bounded UI implementer. No commits or deployment requested.

**Goal:** Every newly published lesson and objective has an approved introductory image; teachers can direct visuals and revise generations.

**Approved design:** Lesson diagram appears on lesson pages; objective diagram appears automatically first whenever starting an objective. Reuse the objective bundle's image. Save lesson/objective visual instructions (diagrams, examples, labels, interactions), accept revision feedback, retain existing review/versioning and authorization. Require introductions at publish. Keep old publications readable until teachers backfill and republish; never auto-approve AI output.

**Architecture:** Reuse generated_image artifacts. Payload `introductionFor: 'lesson' | 'objective'` marks introductions. Only lesson introduction artifacts may have null objective_id. Snapshot their IDs in publication lesson/objectives as `introductionArtifactId`. Saved `visual_instructions` columns on lessons/objectives guide jobs. Lesson-level instructions are defaults, objective instructions add specifics, feedback has priority. No new packages.

## Tasks
- [x] Backend: migration, prompt/schema contracts, save/read instructions, lesson introduction generation, feedback regeneration, validated publishing, authorized introduction retrieval and startup responses. Test prompts, validation, publish requirements, route access and legacy handling.
- [x] UI: Studio instruction fields and lesson introduction card, feedback editing, lesson page image, objective initialization image before activities. Reuse styles/components, show loading/error states, preserve approved versions and unsaved inputs.
- [x] Verify: focused Vitest, typecheck, changed-file ESLint, SQL migration validation where local tooling permits; audit all uncommitted changes and fix relevant findings.

## Shared contracts
- Authoring GET/PUT: lesson.visualInstructions string; objective.visualInstructions string (max 4000 each). PUT persists both along with existing fields.
- POST `/api/teachers/lessons/[lessonId]/generate-introduction`: body `{}`; response `{batchId,jobs}` matching bundles. Uses saved inputs. Artifacts returned with objective_id null and generated_image payload.introductionFor='lesson'.
- Regenerate POST body `{feedback: string}` (max 4000), returns `{batchId,job}`. Retains prior feedback in subsequent revisions.
- GET `/api/lessons/[lessonId]/introduction`: `{artifact: StudentSafeArtifact|null}`. Student reads current published lesson intro; teacher reads latest approved lesson intro. Image asset access reuses authorized signed URLs.
- POST learning-runs and PATCH objective: additional `introduction: ObjectiveLearningArtifact|null`; client starts artifacts with this item. Legacy publications may return null. Introduction excluded from subsequent next-activity requests.
- Publication includes introductionArtifactId on lesson and each objective, with objective intro also in artifactIds for asset authorization. Missing approved current introductions -> 409 with useful message.

## Decisions
- Saved free-text Visual instructions with explicit diagram/example/label/interaction guidance provides requested control without four mandatory fields.
- Legacy images are not silently marked introductions or approved. Studio explains missing introductions and regeneration creates them; existing snapshots remain immutable.
- Review and fix in authorized scope without repeated approval. On September 11, the user explicitly approved applying migration 0036 to the hosted insyte project and completing this test lesson. No bulk backfill authorized.

## Verification and rollout
- 120 lesson-artifact tests passed, including prompt direction, publication requirements, legacy snapshots, startup replay, and private asset authorization.
- 8 focused hook/controller tests passed, including objective switching and stale response rejection.
- Full repository TypeScript check passed. Changed TypeScript ESLint passed with zero errors; existing warnings remain. Standalone CommonJS check uses `node --check` because the repository ESLint configuration cannot load its React plugin for CommonJS files.
- `scripts/check-lesson-introductions-migration.cjs` passed against temporary in-memory PGlite/PostgreSQL. It checks saved instructions, old RPC caller compatibility, inherited direction invalidation, lesson-level artifact versions, required approvals, and validation before existing-hash reuse.
- Final audit covered inefficiency, UI/UX, security, performance, and correctness. Fixed inherited-direction invalidation and the existing-hash publication validation bypass; scoped re-review found no remaining blocking issue.
- Applied `supabase/migrations/0036_lesson_introductions.sql` to the hosted insyte project (`qhadctjpzfyimwfabvdc`) with explicit user approval. Independently verified the columns, authoring RPC, introduction validator, and triggers. Application deployment and bulk backfill were not performed.
- Existing published snapshots remain readable. To backfill, open each lesson's Studio, save visual instructions, generate and approve the lesson introduction, regenerate the existing objective illustration (or generate a bundle) for each objective, approve the introductions, then publish. Regenerating an existing illustration upgrades it to an introduction without making a second illustration series.
- Live browser test completed: created **QA: Balanced and Unbalanced Forces** (`6beadab5-6db8-413b-9ecb-cf4baeecc782`), a 30-minute JHS 1 Physics lesson with two objectives; saved lesson/objective directions; generated, reviewed, revised, and approved all 11 materials; published version 1.
- Publication before approvals returned 409. Generated components with syntax errors could not be approved. Teacher revision feedback corrected image arithmetic/labels, malformed interactive code, and visual readability. Generation still requires human review: initial AI output was not consistently correct.
- Exercised sliders, magnitude/direction predictions, balanced and unbalanced answers, left/right acceleration, constant-velocity misconception, and all three rounds of each revised challenge where applicable. Reviewed both five-question knowledge checks. Independently verified 11 approved artifacts and all three introduction IDs in the saved publication, then visually confirmed the lesson introduction on Overview.
- Browser findings fixed: retry buttons now handle the rejection already displayed by the shared loader; both preview runners supply an opaque light background and dark default text so unspecified component backgrounds remain readable on dark pages. Confirmed the contrast correction on an unmodified generated challenge. Focused authoring/runtime checks: 2 files, 13 tests passed; affected-component lint passed (two existing any warnings in Studio); TypeScript and diff whitespace checks passed. Scoped audit found no additional blocking issue in these fixes.
- Student objective startup is covered by automated hook/API tests, but was not exercised in a live student browser session; this session is signed in as a teacher.
