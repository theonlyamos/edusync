# Lesson-based homework — design proposal

Status: implemented in the current checkout, with interactive visual mockups. Setup, verification, and deployment boundaries are recorded in `2026-10-09-homework-implementation.md`.

## Requirements agreed in this conversation

- Teachers create homework based on lessons; students work on it; teachers mark it; students see performance.
- Support mixed questions, written responses, and file uploads.
- AI can help teachers draft questions. Teachers control whether students can request hints. Teachers approve all final marks.
- Design the entire teacher/student flow, including supporting dialogs, recovery states, and mobile layouts.

## Current repository facts

- The app has separate teacher/student navigation, a shared DashboardLayout, Radix-based controls, Source Serif 4 headings, Manrope body text, warm neutral surfaces, green primary actions, and a dark theme.
- Lesson Studio already supports objective-linked artifacts, teacher review, and published lesson versions (`src/lib/lesson-artifacts`, migration 0033).
- `AssessmentForm` already offers a `homework` type and multiple-choice, true/false, and short-answer questions. The existing assessment submission route allows one result per student and immediately calculates a result. It is not the proposed draft/review/release workflow.
- Students have grades; teachers have grade/subject information; organizations and organization memberships exist. Live-class enrollments exist. A general teacher-managed classroom roster was not established by the files inspected. Grade matching must not become authorization to assign every student on the platform.
- These facts were checked in this checkout; deployed database/provider behavior was not inspected.

## Alternatives and recommendation

1. Extend assessments directly. Lowest initial UI cost, but one-shot submission and immediate results would need to change for autosave, uploads, rubric marking, and private grading drafts. This also risks changing exam behavior.
2. **Recommended: a dedicated homework domain and user-facing area that reuses lesson, question, and UI components.** Keep deadlines, recipients, student drafts, submission attempts, marking, and result release together. Reuse shared question schemas/renderers only after checking their suitability for unsupervised work and accessibility.
3. Build a full classroom/gradebook system first. Strong long-term foundation for attendance and term reports, but expands the first release considerably. Add named classes, parent views, exports, and broader reporting later.

## Product flow

Teacher: lesson or Homework → select published lesson and objectives → prepare questions/rubric → select recipients and policies → preview → publish → monitor submissions → mark → release feedback → review objective performance.

Student: dashboard, lesson, or Homework → read brief → start/resume → answer and upload with autosave → review → submit → await marking → read released feedback → revise if requested → view progress.

### Authoring

- Start with one published lesson per homework; select one or more published objectives. Show lesson version and source materials. Draft lessons can be opened in Studio but cannot be assigned yet.
- Offer manual writing, import from approved lesson quizzes, and AI-assisted drafting from selected objectives/materials. Imported questions are copied into an editable homework draft. AI output is editable and requires teacher review.
- Response types: multiple choice with one answer, multiple choice with multiple answers, true/false, short written answer, extended written answer, and file response. Each question has an objective, required flag, maximum marks, and teacher-only answer key or marking guidance. Multiple-answer questions use checkboxes and private key arrays, with exact-set provisional scoring and teacher-controlled partial credit. File/written responses can have rubric criteria whose marks sum to the question maximum.
- No arbitrary student-executable code or live simulation grading in the first version. Reference approved lesson visualizations instead.
- Sum question maximums on the server; show total points and estimated effort. Estimated effort is descriptive, not a countdown timer.
- Store marking keys separately from student-visible questions. Student preview must use the same safe projection as the student API.

### Assignment and access

- Choose eligible recipients from an explicitly authorized organization/teacher roster. Freeze the recipient list when published. Selecting a grade filters eligible students; it does not grant access. If no trusted roster relationship exists, establish it before assignment can launch.
- Allow individual exclusions and due-date extensions. Store instants in UTC and display the school timezone explicitly; do not assume the browser timezone is the school's timezone.
- Policies: due date, optional hard close date, accept/reject late submissions, allow hints, and reference access. Default to accept late work with a visible late label and no automatic penalty. A hard close date, if configured, stops new submissions; drafts remain readable.
- Allow one initial submission. A teacher-requested revision creates another attempt with its own revision deadline. Earlier attempts and feedback remain accessible to the teacher and student.
- Publishing freezes the homework questions, rubric, answer key, lesson publication ID, and objective revisions. Later lesson edits do not change existing homework. After publishing, permit deadline/recipient-management actions with a history; substantial content changes require duplication into a new homework draft.
- Do not hard-delete assigned work. Archive it and retain submission/history access. Unpublished empty drafts can be deleted with confirmation.

### Student work and submission

- A homework brief shows teacher, source lesson/objectives, instructions, maximum marks, effort, due/close dates, late policy, allowed resources, and hint policy.
- Autosave per-question drafts after editing; show Saving, Saved, Save failed, and Connection lost. Preserve unsaved text locally where possible. Show a conflict screen if another tab/device has a newer revision; never silently overwrite it.
- Workspace supports text answers and private file uploads. Initial supported attachments: PDF, JPG, PNG, and DOCX, maximum 10 MB per file and 3 files per upload question. Validate size/type on client and server. Provide image/PDF preview; DOCX download is adequate for v1. Upload status/retry/removal is explicit. Never claim browser file selection is a completed server upload.
- Submission review flags missing required answers and uploads that are pending/failed. Optional unanswered questions need an acknowledgment. Submission is idempotent and server-timestamped; lock the submitted attempt only after the server confirms it. Preserve recoverable work during timeouts and retries.
- After submission, show a read-only receipt with attempt number, submitted time, late status, and Waiting for marking. Do not display provisional marks or answer keys before release.
- General-purpose tutors must respect assignment restrictions too: hiding the hint button alone is insufficient. An approved hint channel uses lesson context without teacher-only keys or final answers. Record help usage for the teacher without treating it as proof of misconduct. AI outages do not prevent authoring, student work, marking, or submission.

### Marking and feedback

- Assignment detail shows recipients, not-started/in-progress/submitted statuses, lateness, grading state, and feedback release state as separate concepts. Filter to Needs marking and open the next eligible student.
- Marking workspace presents the submitted answer and prompt alongside marks, teacher-only guidance, rubric, per-question feedback, and overall feedback. Keep written/file grading manual in v1; optional AI marking suggestions are a later enhancement.
- Objective question scores can be calculated deterministically on the server, but remain provisional until the teacher approves them. Teachers may override with a recorded reason. Student clients never receive grading keys.
- Validate every score against its question maximum and ensure all required grading fields are complete. Save marking drafts privately. Explicitly release a completed attempt's score and feedback; offer batch release for completed grading only.
- A revision request releases the relevant feedback and a deadline, then opens a fresh attempt seeded from the submitted answers. Mark the new attempt separately; the latest released completed grade contributes to the homework aggregate. Explain whether the prior grade is superseded.
- Correcting an already released grade creates an audited revision and alerts the student in-app. Do not overwrite history silently.

### Performance

- Feedback page: released total and percentage, question breakdown, rubric/teacher feedback, objective-linked strengths and next steps, and revision action when available.
- Student progress: points-weighted aggregate across the latest released attempt of each homework, trend of released scores, on-time submissions, objective-level evidence, and next lesson/practice links. Display sample size and date range. Exclude ungraded work and distinguish missing work from scored zero; do not label a small sample as mastery.
- Teacher insights: assigned/submitted/graded/released counts, score distribution over the stated graded set, question/objective performance, and students who need follow-up. Keep completion and correctness separate; avoid student rankings.
- In-app indicators for newly assigned work, imminent deadlines, requested revisions, and released results. Email/push reminders can follow later.

## State model

- Homework lifecycle: draft → published → archived. Availability is computed from publish/close dates; a due date alone does not archive or close work.
- Student attempt: draft → submitted. Submission can be on time or late independently. Teacher-requested revision opens a new draft attempt.
- Grading: unmarked → grading draft → complete. Release is a separate timestamp/version; complete does not imply visible to students.
- Recipient UI status combines the latest attempt with grading/release information: Not started, In progress, Submitted, Marking in progress, Feedback ready, Revision requested, Resubmitted. Overdue/late/closed are additional labels.

## Proposed data boundaries

Use existing Supabase and user-authenticated server patterns; validate authorization at the API and row/storage policy layers.

- `homeworks`: owner user ID, organization scope, draft metadata, source lesson publication, lifecycle, policies, published version.
- `homework_questions`: copied ordered prompts, response types, objective revision links, required flag, max points, student-visible rubric criteria. Teacher-only keys/guidance have a separate inaccessible relation.
- `homework_recipients`: authorized student user IDs, published cohort snapshot, per-student extension/close overrides, assigned time.
- `homework_attempts`: recipient, attempt number, draft version, immutable submitted time, snapshot reference, revision request link. Unique current draft and idempotent submission constraints.
- `homework_answers` and `homework_attachments`: question responses, persisted draft version, storage references. Submitted versions become immutable; signed attachment access is limited to the student and authorized marker.
- `homework_grades`: per-attempt/question scores, feedback and criterion marks, deterministic provisional score, marker identity, grading/release version and timestamps.
- `homework_events`: publication/policy/recipient changes, revision requests, submission, release, and grade corrections. Aggregate reporting reads canonical attempts/grades rather than maintaining an unrelated mastery score.

Operations should be small server-side boundaries: author/save, publish/snapshot, draft save with optimistic concurrency, upload/finalize, submit atomically, grade/save, release atomically, request revision, and authorized reporting. Never copy the existing assessment endpoints without reviewing ownership, recipient authorization, and answer-key exposure.

## Screens in the visual proposal

Teacher:
1. Homework overview: filters, drafts, submission progress, marking queue.
2. Lesson/objective selection: published version, source content, objectives.
3. Question builder: mixed types, objective mapping, marking guidance, rubric.
4. Assign/settings: scoped recipients, deadline/late policy, hints.
5. Student preview and publish check.
6. Assignment detail: student roster, submissions, exceptions, release controls.
7. Marking workspace: answers/files, scores/rubrics, private feedback, next student.
8. Assignment performance: objective evidence and follow-up.
9. Lesson/dashboard entry points.

Student:
10. Homework overview: due, submitted, feedback, and revisions.
11. Homework brief.
12. Work area: question navigation, answers, uploads, save state, lesson/hints.
13. Submission review.
14. Submitted receipt/read-only state.
15. Released feedback and question breakdown.
16. Personal performance.
17. Requested revision and attempt history.
18. Lesson/dashboard entry points.

Supporting screens:
19. Dialog gallery: submission, publication, result release, revision request, extension, archive, remove attachment, and unsaved navigation.
20. State gallery: no assignments, loading, save failure/offline, upload failure, missing answers, closed deadline, denied access, generation failure, draft conflict, and submitted/awaiting marking.

Every primary screen reflows to mobile. Marking stacks answers above feedback; answer fields stay readable; mobile student work retains save/deadline context and a full-width next action. The prototype includes a mobile-width preview selector; its data and persistence are simulated.

## Delivery sequence and acceptance

1. Authorization and authoring: establish roster boundary, immutable published homework snapshot, teacher-only key protection; teacher can create/manual-import/mixed questions and publish to eligible students.
2. Student execution: authorized assignment retrieval, draft autosave/conflict handling, private uploads, atomic/idempotent submission and receipt. Exercise two-device conflicts, retry-after-timeout, closing deadline, extension, and upload failure.
3. Marking and release: deterministic objective scoring, manual rubric marks, save grading drafts, explicit release, revisions, and audit history. Students cannot see unreleased grades; release cannot expose incomplete grading.
4. Performance and polish: aggregates over released canonical attempts, dashboard/lesson entry points, in-app indicators, empty/error states, mobile and keyboard use.

Launch blockers: trusted recipient authorization; safe question/key projections; private attachment policy; atomic save/submit/release constraints; immutable source/question versions; correct school-timezone deadline handling; clear grade-release and revision rules; restricted homework-help behavior in other tutor entry points.

Verification should target ownership isolation, scoped recipients, data/key leakage, concurrency, idempotency, bounded scores, release visibility, upload policy, deadline boundaries, revision replacement, aggregate denominators, and realistic end-to-end teacher/student flows. The current deliverable validates only the design prototype, not these future application behaviors.

Prototype checks completed: all 20 screens rendered at browser widths of 1100, 736, 390, and 320 pixels (80 combinations), with no JavaScript errors or horizontal overflow. Local interactions were checked for out-of-range marking validation, feedback-release confirmation, retained answers between questions, hint dialogs, mobile preview, submission-to-receipt navigation, and all 11 recovery states. Desktop overview/marking and mobile student work were visually inspected. These are simulated design interactions, not working application persistence or server authorization tests.
