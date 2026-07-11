# Lesson Artifact Audit Fixes Design

## Goal

Close every approved lesson-artifact audit finding without changing the approved-first learning model or the immutable publication contract.

## Architecture

- Keep content generation runnable in both Next.js request callbacks and a standalone worker by moving worker execution behind a runtime-neutral entrypoint.
- Make fallback generation entirely server-governed. The server first exhausts published teacher-approved artifacts, then atomically reserves one of six default fallback slots per objective and learning run before calling an AI provider. Organization policy remains an additional restriction.
- Move quota reservation and database creation into transactional Postgres functions. File bytes are uploaded first and removed if the atomic database operation fails.
- Allocate publication versions inside an advisory-lock-protected database function.
- Treat uploaded source text as untrusted reference data in a separately delimited system-prompt section.
- Record actual sandbox render validation for generated visual artifacts and require it before approval.
- Preserve dirty teacher objective drafts across background refreshes, make job outcomes explicit, and consume student artifacts only after a successful render or deliberate resource open.

## Interface behavior

- Objective Studio warns about unsaved objectives and disables generation, review, and publication until they are saved.
- Failed initial data and asset loads show retry controls instead of permanent spinners.
- Quiz review shows question type, points, choices, correct answer, and explanation.
- Lesson creation blocks while organization membership is loading, exposes failures, and confirms before replacing manually entered generated fields.
- Existing visual identity remains intact while hard-coded light-only surfaces move to theme tokens and icon-only controls gain accessible names.

## Verification

- Pure policy, validation, worker-loop, polling, merge, grounding, and migration behavior receive Vitest regression tests.
- The standalone worker module is imported in a smoke test and with `tsx`.
- Typecheck, targeted tests, full tests, lint, and production build are run before completion.

