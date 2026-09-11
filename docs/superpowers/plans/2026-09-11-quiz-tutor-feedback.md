# Quiz Tutor Feedback Implementation Plan

**Goal:** Feed server-graded structured quiz results into the active text/voice tutor and recover recent evidence on reconnect.
**Approved design:** User approved quiz feedback first. Reuse learning_events, existing quiz attempt/retry APIs, and the live text transport. Visualization telemetry is outside this task.
**Execution:** Apply writing-plans and subagent-driven-development in the current checkout. Backend can run independently of live/UI integration. No new dependencies, migration, commit, or deployment requested.

## Contracts
- `QuizFeedbackSnapshot`: `{runId: string, objectiveId: string, objectiveRevision: number, eventIds: string[], context: string}`.
- `getQuizTutorFeedback(runId, expectedLessonId?)` in `quiz-feedback-server.ts` authorizes run ownership, validates its pinned active objective, selects latest three quiz_submitted events for that run/student/objective/revision, and builds bounded educational evidence. A mismatched expected lesson is denied. Context separates observations from instructions and never treats old or unverified activity completion as mastery.
- `GET /api/learning-runs/[runId]/quiz-feedback` always returns pinned objective context. Without submissions, eventIds is empty and the context states performance is unknown; it resets prior-objective assumptions on voice objective changes.
- Successful structured attempt responses include `feedbackScope: {runId, objectiveId, objectiveRevision}` including idempotent duplicate responses. Stored per-question grades include the server question prompt and selected answer. Only answers for existing questions are saved.
- After confirmed quiz save, LearningArtifactCard dispatches `learning-quiz-submitted` with feedbackScope, including retries. The live hook listens for matching scope and refetches canonical server evidence, never accepting grades/text from an event.
- `/api/tutor` includes server-read context on each lesson run turn. The voice hook loads context at connection/scope change and matching submissions, coalesces updates, deduplicates IDs per connection, and sends only after user speech, model turn and playback are idle. A reconnect fetches the latest snapshot again.

## Tasks
- [x] Backend: add bounded feedback builder/service and authorized GET route; enrich persisted quiz evidence and duplicate response scope; include scoped evidence in text tutor. Test ownership/scope, recent-event bounds, old results, selected-answer accuracy, and prompt injection boundaries.
- [x] Client: emit confirmed-save signal with visible submission error handling; wire Study Companion run/objective into voice context; implement scoped voice refresh/idle delivery using existing connection, playback and microphone state. Test duplicate, stale objective, reconnect and delayed-delivery behavior with a small pure controller and fake transport.
- [x] Review: inspect backend/UI integration and full diff using audit-changes. Run lesson tests, affected lint, TypeScript and diff check. Report live voice verification limitations honestly.

## Decisions
- Store recent evidence in existing event JSON; no AI summarizer, event bus service, polling database subscription or new table.
- Automatically update text tutor context on its next student turn; quiz submission itself does not create a fabricated student chat message.
- Voice updates are contextual teaching evidence, not a replacement system prompt or a student utterance. Wait for an idle boundary; API text delivery may still elicit a response.


## Changes Audit
**Scope:** 17 changed/new files implementing structured quiz feedback, client delivery, route integration and tests.
**Summary:** Two medium voice correctness findings fixed; no unresolved findings after scoped re-review.

### Findings fixed
1. Pending outbound learner/feedback turns were not considered busy before the first server chunk. All conversational text sends now share turn tracking. Local speech and text wait for a response, while ignored input expires after ten seconds so proactive audio or local VAD cannot permanently stall feedback. Observed model turns remain busy until completion. Tests cover delayed responses, ignored input, silent completion, and learner interruption followed by the old turn's trailing completion.
2. A new objective with no attempts sent no context, leaving previous-objective evidence in the live conversation. Every canonical snapshot now identifies the pinned objective/revision and explicitly resets prior-objective assumptions; no results means unknown performance. Each connected objective sends its scope context once even with no attempt IDs.

### Other review dimensions
- Inefficiency: reuses saved event JSON, existing grading, auth helpers and live transport. No AI summarization call or new infrastructure.
- UI/UX: confirmed saves trigger updates; failures show a retryable error. Voice waits for microphone, model turn, decoding, playback and an idle boundary. Scope changes and reconnects rebuild the queue.
- Security: scope and scores are read from owned server records; browser events contain no trusted score/context. Question/answer data remains quoted untrusted evidence. New persisted answers have request size limits; old rows remain readable. Text tutor validates lesson/run before chat writes.
- Performance: latest three matching attempts only; bounded context under10k even with escaped input. Local250ms idle checks do not poll the database; failed fetches retry twice. Event IDs deduplicate delivery per connected objective.
- Correctness: independent review and focused re-reviews covered stale responses, retries, canonical results, objective transitions and provider interruption sequencing. No unresolved findings.

## Verification
- Full affected regression suite:40 files,181 tests passed with maxWorkers=2. One unchanged worker-import test initially exceeded its15-second import timeout during a high-concurrency run, then passed alone and in the complete lower-concurrency suite.
- After the final turn-tracker correction, all6 delivery regression tests passed, including the added ignored-input/interrupt-completion case (182 distinct tests across the final verified source).
- Backend18 tests passed: formatter bounds and evidence boundaries, owned scope/revision, uncached GET, attempt persistence/duplicate/retry, and text tutor context/access before writes.
- Full TypeScript passed; affected ESLint reported zero errors. Warnings remain in existing large hook/component files; new feedback modules/tests lint clean. git diff --check passed.
- No live student microphone/provider session was exercised. Delivery scheduling was verified with fake time/transport and component handlers; actual Gemini conversational behavior still requires a live student test.
- No database migration, deployment, commit or push performed.
