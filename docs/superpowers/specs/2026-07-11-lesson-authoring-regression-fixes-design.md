# Lesson Authoring Regression Fixes

## Scope

Fix four regressions discovered during browser verification of Objective Studio:

1. Regeneration displays its spinner on the Approve button.
2. Lesson overview and list dates render as `Invalid Date`.
3. Lesson update and delete routes reference the removed `lessons.teacher` column.
4. React-based interactives and visual quizzes time out before the sandbox reports readiness.

## Design

### Artifact action state

Replace the ambiguous artifact-ID-only busy state with an action-aware value containing the artifact ID and operation (`approve`, `reject`, or `regenerate`). Each action button will disable while its artifact is busy, but only the button performing the active operation will show a spinner. Lesson-wide actions such as save, generate, upload, and publish remain represented independently.

### Lesson API response mapping

Map database lesson fields at the API boundary. Detail and list responses will expose the existing UI contract: `gradeLevel`, `createdAt`, and `updatedAt`, sourced from `gradelevel`, `created_at`, and `updated_at`. Raw database fields may remain present for compatibility, but UI code will receive valid camel-case values.

### Normalized ownership

For lesson update and deletion, select `teacher_id`, resolve it through `teachers.user_id`, and compare that user ID with the authenticated teacher. Admin access remains unchanged. No route will read or write the removed legacy `teacher` column.

### Visualization sandbox runtime

Keep generated code inside the existing opaque-origin, scripts-only iframe and preserve its CSP. Replace the failing `esm.sh` React/ReactDOM module boot with pinned classic UMD builds that expose the globals already consumed by the renderer. Add explicit script-load failure reporting so dependency failures reach Objective Studio immediately instead of appearing as a generic timeout. Chart and map dependencies remain conditional, and teacher approval remains disabled until the sandbox reports a successful render.

## Error Handling

Missing lessons continue to return 404. Teachers who do not own a lesson receive 403. Database errors continue to use the existing 500 responses. Date mapping passes through nullable timestamps; the UI will render a safe fallback instead of constructing an invalid date when historical data is missing.

## Verification

- Unit regression test for action-specific busy state.
- API contract test for camel-case lesson fields and absence of legacy ownership references.
- Existing lesson-artifact and route tests.
- TypeScript and targeted lint.
- Browser confirmation that Regenerate owns its spinner and lesson dates are valid.
- Browser confirmation that existing interactive and visual-quiz artifacts render, report validation, and become eligible for teacher approval only after success.
