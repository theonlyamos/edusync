\set ON_ERROR_STOP on

BEGIN;

DO $verify_isolation$
BEGIN
  IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER')
    OR NOT pg_has_role(current_user, 'service_role', 'MEMBER') THEN
    RAISE EXCEPTION
      'Verification connection must be able to SET ROLE authenticated and service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_jobs
    WHERE status IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION
      'Isolated verification clone contains globally claimable jobs';
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.users
      WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%'
        OR email LIKE 'verify-%@example.invalid'
    )
    OR EXISTS (
      SELECT 1 FROM public.teachers
      WHERE id::text LIKE '20000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id::text LIKE '30000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE id::text LIKE '40000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_objectives
      WHERE id::text LIKE '50000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.content_jobs
      WHERE id::text LIKE '60000000-0000-4000-8000-00000000000%'
        OR idempotency_key LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_artifacts
      WHERE id::text LIKE '80000000-0000-4000-8000-00000000000%'
        OR series_id::text LIKE 'a0000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_assets
      WHERE id::text LIKE '90000000-0000-4000-8000-00000000000%'
        OR storage_path LIKE 'verification/%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_publications
      WHERE id::text LIKE 'b0000000-0000-4000-8000-00000000000%'
        OR content_hash LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_ai_usage
      WHERE reference_id LIKE 'verify:%'
    ) THEN
    RAISE EXCEPTION 'Verification fixture namespace is not clean';
  END IF;

  IF to_regprocedure('public._verify_0035_assert(boolean,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_expect_error(text,text,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_assert_row_count(text,bigint,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_set_actor(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verification helper names already exist';
  END IF;
END;
$verify_isolation$;

CREATE FUNCTION public._verify_0035_assert(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$function$;

CREATE FUNCTION public._verify_0035_expect_error(
  p_sql text,
  p_expected_state text,
  p_expected_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actual_state text;
  actual_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      actual_state = RETURNED_SQLSTATE,
      actual_message = MESSAGE_TEXT;
    IF actual_state <> p_expected_state THEN
      RAISE EXCEPTION
        'Expected SQLSTATE %, got %: %',
        p_expected_state,
        actual_state,
        actual_message;
    END IF;
    IF p_expected_message IS NOT NULL
      AND actual_message <> p_expected_message THEN
      RAISE EXCEPTION
        'Expected message %, got %',
        p_expected_message,
        actual_message;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION
    'Expected SQLSTATE %, but statement succeeded: %',
    p_expected_state,
    p_sql;
END;
$function$;

CREATE FUNCTION public._verify_0035_assert_row_count(
  p_sql text,
  p_expected bigint,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  affected bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> p_expected THEN
    RAISE EXCEPTION
      '% (expected %, got %)',
      p_message,
      p_expected,
      affected;
  END IF;
END;
$function$;

CREATE FUNCTION public._verify_0035_set_actor(
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._verify_0035_assert(boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._verify_0035_expect_error(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._verify_0035_assert_row_count(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._verify_0035_set_actor(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._verify_0035_assert(boolean, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._verify_0035_expect_error(text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._verify_0035_assert_row_count(text, bigint, text)
  TO authenticated, service_role;

INSERT INTO public.users (id, email, name, role)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'verify-teacher@example.invalid', 'Verify Teacher', 'teacher'),
  ('10000000-0000-4000-8000-000000000002', 'verify-admin@example.invalid', 'Verify Admin', 'admin'),
  ('10000000-0000-4000-8000-000000000003', 'verify-other@example.invalid', 'Verify Other Teacher', 'teacher');

INSERT INTO public.teachers (id, user_id, subjects, grades)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    ARRAY[]::text[],
    ARRAY[]::text[]
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    ARRAY[]::text[],
    ARRAY[]::text[]
  );

INSERT INTO public.organizations (id, name, owner_id)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'Verify Source', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'Verify Target', '10000000-0000-4000-8000-000000000001');

UPDATE public.organization_members
SET role = 'admin'
WHERE organization_id = '30000000-0000-4000-8000-000000000002'
  AND user_id = '10000000-0000-4000-8000-000000000001';

INSERT INTO public.lessons (
  id, title, subject, gradelevel, objectives, content,
  teacher_id, organization_id, created_at, updated_at
)
VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    'Verify Lesson',
    'Science',
    '7',
    ARRAY['Verify objective'],
    'Verify content',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'Delete Verification Lesson',
    'Science',
    '7',
    ARRAY['Delete objective'],
    'Disposable manager-delete fixture',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  );

INSERT INTO public.lesson_objectives (id, lesson_id, text, position, revision)
VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Verify objective', 0, 1),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Cascade objective', 1, 1);

INSERT INTO public.lesson_publications (
  id, lesson_id, version, manifest, warnings, content_hash, published_by
)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  1,
  '{}'::jsonb,
  '[]'::jsonb,
  'verify:publication',
  '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.lesson_artifacts (
  id, lesson_id, objective_id, series_id, version, objective_revision,
  kind, status, position, payload, source, created_by, approved_by, approved_at
)
VALUES
  (
    '80000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    1, 1, 'structured_quiz', 'draft', 0,
    '{"marker":"draft"}'::jsonb,
    'teacher_authored',
    '10000000-0000-4000-8000-000000000001',
    NULL, NULL
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    1, 1, 'structured_quiz', 'rejected', 1,
    '{"marker":"rejected"}'::jsonb,
    'teacher_authored',
    '10000000-0000-4000-8000-000000000001',
    NULL, NULL
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    1, 1, 'structured_quiz', 'approved', 2,
    '{"marker":"approved"}'::jsonb,
    'teacher_authored',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', now()
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000004',
    1, 1, 'structured_quiz', 'draft', 0,
    '{"marker":"cascade"}'::jsonb,
    'teacher_authored',
    '10000000-0000-4000-8000-000000000001',
    NULL, NULL
  );

-- Enqueue one quota-attributed source-organization job.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
SELECT public.enqueue_content_jobs_with_usage(
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '[{
    "id":"60000000-0000-4000-8000-000000000001",
    "batch_id":"70000000-0000-4000-8000-000000000001",
    "lesson_id":"40000000-0000-4000-8000-000000000001",
    "objective_id":"50000000-0000-4000-8000-000000000001",
    "requested_by":"10000000-0000-4000-8000-000000000001",
    "job_type":"generate_structured_quiz",
    "idempotency_key":"verify:quota",
    "input":{}
  }]'::jsonb,
  '[{
    "category":"quiz_generation",
    "quantity":1,
    "referenceId":"verify:quota"
  }]'::jsonb
);
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'queued'
      AND organization_id = '30000000-0000-4000-8000-000000000001'
  ),
  'Quota enqueue did not persist one source-organization job'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.organization_ai_usage
    WHERE organization_id = '30000000-0000-4000-8000-000000000001'
      AND user_id = '10000000-0000-4000-8000-000000000001'
      AND category = 'quiz_generation'
      AND quantity = 1
      AND reference_id = 'verify:quota'
  ),
  'Quota enqueue did not reserve exactly one source-organization usage row'
);

-- Authenticated clients retain own-job SELECT and lose all direct writes.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
  ),
  'Authenticated teacher cannot read their own content job'
);
SELECT public._verify_0035_expect_error(
  $sql$
    INSERT INTO public.content_jobs (
      id, batch_id, lesson_id, objective_id, requested_by,
      job_type, idempotency_key, input
    ) VALUES (
      '60000000-0000-4000-8000-000000000009',
      '70000000-0000-4000-8000-000000000009',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'generate_structured_quiz',
      'verify:forbidden',
      '{}'::jsonb
    )
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.content_jobs SET status = 'cancelled'
    WHERE id = '60000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    DELETE FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
RESET ROLE;

SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000003',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 0 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
  ),
  'A different teacher can read another teacher''s content job'
);
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'queued'
  ),
  'Denied authenticated writes changed the quota job'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 0 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000009'
      OR idempotency_key = 'verify:forbidden'
  ),
  'Denied authenticated insert persisted a content job'
);

-- Fail the quota job through an owned, unexpired worker lease.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1
    FROM public.claim_content_jobs('verify-quota-initial', 1, 120)
  ),
  'Initial quota-job claim did not return exactly one job'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'running'
      AND lease_owner = 'verify-quota-initial'
      AND attempt_count = 1
      AND lease_expires_at > now()
  ),
  'Initial quota-job claim state is incorrect'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'failed',
        error = 'Verification worker failure',
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = now()
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'running'
      AND lease_owner = 'verify-quota-initial'
      AND lease_expires_at > now()
  $sql$,
  1,
  'Quota-job worker-failure transition failed'
);

-- A separate no-usage job proves queued cancel, retry, claim, and success.
SELECT public.enqueue_content_jobs_with_usage(
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '[{
    "id":"60000000-0000-4000-8000-000000000002",
    "batch_id":"70000000-0000-4000-8000-000000000002",
    "lesson_id":"40000000-0000-4000-8000-000000000001",
    "objective_id":"50000000-0000-4000-8000-000000000001",
    "requested_by":"10000000-0000-4000-8000-000000000001",
    "job_type":"generate_structured_quiz",
    "idempotency_key":"verify:lifecycle",
    "input":{}
  }]'::jsonb,
  '[]'::jsonb
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'cancelled', completed_at = now()
    WHERE id = '60000000-0000-4000-8000-000000000002'
      AND status = 'queued'
  $sql$,
  1,
  'Queued lifecycle-job cancellation failed'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'queued',
        attempt_count = 0,
        error = NULL,
        completed_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL
    WHERE id = '60000000-0000-4000-8000-000000000002'
      AND status = 'cancelled'
  $sql$,
  1,
  'Cancelled lifecycle-job retry failed'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1
    FROM public.claim_content_jobs('verify-lifecycle', 1, 120)
  ),
  'Retried lifecycle-job claim did not return exactly one job'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'succeeded',
        output = '{"verified":true}'::jsonb,
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = now()
    WHERE id = '60000000-0000-4000-8000-000000000002'
      AND status = 'running'
      AND lease_owner = 'verify-lifecycle'
      AND lease_expires_at > now()
  $sql$,
  1,
  'Lifecycle-job worker-success transition failed'
);
RESET ROLE;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000002'
      AND status = 'succeeded'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
  ),
  'Lifecycle-job success state is incorrect'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.organization_ai_usage
    WHERE reference_id = 'verify:quota'
  ),
  'No-usage lifecycle retry changed quota reservations'
);

-- Draft and rejected artifacts update/delete; approved artifacts remain immutable.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lesson_artifacts
    SET payload = '{"marker":"draft-updated"}'::jsonb
    WHERE id = '80000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Draft update did not affect one row'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lesson_artifacts
    SET payload = '{"marker":"rejected-updated"}'::jsonb
    WHERE id = '80000000-0000-4000-8000-000000000002'
  $sql$,
  1,
  'Rejected update did not affect one row'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 2 FROM public.lesson_artifacts
    WHERE (id = '80000000-0000-4000-8000-000000000001'
        AND payload = '{"marker":"draft-updated"}'::jsonb)
       OR (id = '80000000-0000-4000-8000-000000000002'
        AND payload = '{"marker":"rejected-updated"}'::jsonb)
  ),
  'Draft or rejected artifact update did not persist'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    DELETE FROM public.lesson_artifacts
    WHERE id IN (
      '80000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000002'
    )
  $sql$,
  2,
  'Draft/rejected delete did not affect exactly two rows'
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lesson_artifacts
    SET payload = '{"mutated":true}'::jsonb
    WHERE id = '80000000-0000-4000-8000-000000000003'
  $sql$,
  'P0001',
  'Approved lesson artifacts are immutable; create a new version'
);
SELECT public._verify_0035_expect_error(
  $sql$
    DELETE FROM public.lesson_artifacts
    WHERE id = '80000000-0000-4000-8000-000000000003'
  $sql$,
  'P0001',
  'Approved lesson artifacts are immutable; create a new version'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    DELETE FROM public.lesson_objectives
    WHERE id = '50000000-0000-4000-8000-000000000002'
  $sql$,
  1,
  'Cascade-only objective delete failed'
);
RESET ROLE;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 0 FROM public.lesson_artifacts
    WHERE id IN (
      '80000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000004'
    )
  ),
  'Draft, rejected, or cascade artifact remains'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lesson_artifacts
    WHERE id = '80000000-0000-4000-8000-000000000003'
      AND payload = '{"marker":"approved"}'::jsonb
  ),
  'Approved artifact changed after rejected mutations'
);

-- Teacher allowlist and successful owner/admin transfers.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET title = 'Teacher-updated lesson',
        subject = 'Updated science',
        gradelevel = '8',
        objectives = ARRAY['Updated objective'],
        content = 'Teacher-updated content',
        organization_id = '30000000-0000-4000-8000-000000000001',
        updated_at = now()
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Teacher allowlisted update or same-organization no-op failed'
);
SELECT public._verify_0035_expect_error(
  $sql$
    INSERT INTO public.lessons (
      id, title, subject, gradelevel, objectives, content,
      teacher_id, organization_id, created_at, updated_at
    ) VALUES (
      '40000000-0000-4000-8000-000000000009',
      'Forbidden direct insert',
      'Science',
      '8',
      ARRAY['Forbidden objective'],
      'Forbidden content',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      now(),
      now()
    )
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    DELETE FROM public.lessons
    WHERE id = '40000000-0000-4000-8000-000000000002'
  $sql$,
  1,
  'Owning teacher could not delete a disposable managed lesson'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Source-owner to target-admin transfer failed'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000001'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Current-admin to target-owner transfer failed'
);
RESET ROLE;

-- Current/source membership: missing, inactive, and member all fail.
DELETE FROM public.organization_members
WHERE organization_id = '30000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001';
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in current organization is required'
);
RESET ROLE;

INSERT INTO public.organization_members (
  organization_id, user_id, role, is_active
) VALUES (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'owner',
  false
);
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in current organization is required'
);
RESET ROLE;

UPDATE public.organization_members
SET role = 'member', is_active = true
WHERE organization_id = '30000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001';
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in current organization is required'
);
RESET ROLE;
UPDATE public.organization_members
SET role = 'owner', is_active = true
WHERE organization_id = '30000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001';

-- Target membership: missing, inactive, and member all fail.
DELETE FROM public.organization_members
WHERE organization_id = '30000000-0000-4000-8000-000000000002'
  AND user_id = '10000000-0000-4000-8000-000000000001';
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in target organization is required'
);
RESET ROLE;

INSERT INTO public.organization_members (
  organization_id, user_id, role, is_active
) VALUES (
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'admin',
  false
);
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in target organization is required'
);
RESET ROLE;

UPDATE public.organization_members
SET role = 'member', is_active = true
WHERE organization_id = '30000000-0000-4000-8000-000000000002'
  AND user_id = '10000000-0000-4000-8000-000000000001';
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Active owner or admin membership in target organization is required'
);
RESET ROLE;
UPDATE public.organization_members
SET role = 'admin', is_active = true
WHERE organization_id = '30000000-0000-4000-8000-000000000002'
  AND user_id = '10000000-0000-4000-8000-000000000001';

-- Explicit null and protected-column writes fail for the owning teacher.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons SET organization_id = NULL
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  'Lesson organization cannot be cleared'
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET teacher_id = '20000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET current_publication_id = 'b0000000-0000-4000-8000-000000000001'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET id = '40000000-0000-4000-8000-000000000009'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons SET created_at = now()
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET teacher = '10000000-0000-4000-8000-000000000003'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'lessons'
    AND column_name = 'teacher'
);
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lessons
    WHERE id = '40000000-0000-4000-8000-000000000001'
      AND teacher_id = '20000000-0000-4000-8000-000000000001'
      AND current_publication_id IS NULL
      AND created_at = '2026-01-01T00:00:00Z'::timestamptz
      AND organization_id = '30000000-0000-4000-8000-000000000001'
  ),
  'Teacher protected-field attempts changed the lesson'
);
DO $verify_teacher_legacy_unchanged$
DECLARE
  legacy_teacher uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name = 'teacher'
  ) THEN
    EXECUTE 'SELECT teacher FROM public.lessons WHERE id = $1'
      INTO legacy_teacher
      USING '40000000-0000-4000-8000-000000000001'::uuid;
    IF legacy_teacher IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher changed the protected legacy teacher column';
    END IF;
  END IF;
END;
$verify_teacher_legacy_unchanged$;

-- A different teacher cannot update a row they do not manage.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000003',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons SET title = 'Forbidden non-owner update'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  0,
  'Non-owner teacher updated a lesson'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    DELETE FROM public.lessons
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  0,
  'Non-owner teacher deleted a lesson'
);
RESET ROLE;

-- Global admins bypass membership, but not the protected-column allowlist.
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 0 FROM public.organization_members
    WHERE user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'Global admin unexpectedly has organization membership'
);
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000002',
  'authenticated'
);
SET LOCAL ROLE authenticated;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Global-admin organization transfer failed'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000001',
        title = 'Admin-updated lesson',
        content = 'Admin-updated content',
        updated_at = now()
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Global-admin reset or allowlisted update failed'
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET teacher_id = '20000000-0000-4000-8000-000000000002'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET current_publication_id = 'b0000000-0000-4000-8000-000000000001'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
);
SELECT public._verify_0035_expect_error(
  $sql$
    UPDATE public.lessons
    SET teacher = '10000000-0000-4000-8000-000000000003'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  '42501',
  NULL
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'lessons'
    AND column_name = 'teacher'
);
RESET ROLE;
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lessons
    WHERE id = '40000000-0000-4000-8000-000000000001'
      AND teacher_id = '20000000-0000-4000-8000-000000000001'
      AND current_publication_id IS NULL
      AND organization_id = '30000000-0000-4000-8000-000000000001'
      AND title = 'Admin-updated lesson'
  ),
  'Global-admin protected-field attempts changed the lesson'
);
DO $verify_admin_legacy_unchanged$
DECLARE
  legacy_teacher uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name = 'teacher'
  ) THEN
    EXECUTE 'SELECT teacher FROM public.lessons WHERE id = $1'
      INTO legacy_teacher
      USING '40000000-0000-4000-8000-000000000001'::uuid;
    IF legacy_teacher IS NOT NULL THEN
      RAISE EXCEPTION 'Global admin changed the protected legacy teacher column';
    END IF;
  END IF;
END;
$verify_admin_legacy_unchanged$;

-- Service role explicitly maintains protected fields and bypasses the org guard.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET organization_id = '30000000-0000-4000-8000-000000000002',
        teacher_id = '20000000-0000-4000-8000-000000000002',
        current_publication_id = 'b0000000-0000-4000-8000-000000000001'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Service-role protected-field maintenance failed'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons
    SET teacher = '10000000-0000-4000-8000-000000000003'
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Service-role legacy-teacher maintenance failed'
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'lessons'
    AND column_name = 'teacher'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.lessons SET organization_id = NULL
    WHERE id = '40000000-0000-4000-8000-000000000001'
  $sql$,
  1,
  'Service-role null-organization maintenance failed'
);
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lessons
    WHERE id = '40000000-0000-4000-8000-000000000001'
      AND teacher_id = '20000000-0000-4000-8000-000000000002'
      AND current_publication_id = 'b0000000-0000-4000-8000-000000000001'
      AND organization_id IS NULL
  ),
  'Service-role maintenance state did not persist'
);
DO $verify_service_legacy_teacher$
DECLARE
  legacy_teacher uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name = 'teacher'
  ) THEN
    EXECUTE 'SELECT teacher FROM public.lessons WHERE id = $1'
      INTO legacy_teacher
      USING '40000000-0000-4000-8000-000000000001'::uuid;
    IF legacy_teacher IS DISTINCT FROM
      '10000000-0000-4000-8000-000000000003'::uuid THEN
      RAISE EXCEPTION 'Service role did not update legacy teacher';
    END IF;
  END IF;
END;
$verify_service_legacy_teacher$;

-- Retry the original quota job after the lesson's real reassignment.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'queued',
        attempt_count = 0,
        error = NULL,
        completed_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'failed'
  $sql$,
  1,
  'Original quota-job retry failed'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1
    FROM public.claim_content_jobs('verify-quota-retry', 1, 120)
  ),
  'Retried quota-job claim did not return exactly one job'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'running'
      AND lease_owner = 'verify-quota-retry'
      AND attempt_count = 1
      AND lease_expires_at > now()
  ),
  'Retried quota-job claim state is incorrect'
);
SELECT public._verify_0035_assert_row_count(
  $sql$
    UPDATE public.content_jobs
    SET status = 'succeeded',
        output = '{"verified":true}'::jsonb,
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = now()
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'running'
      AND lease_owner = 'verify-quota-retry'
      AND lease_expires_at > now()
  $sql$,
  1,
  'Retried quota-job worker-success transition failed'
);
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000001'
      AND status = 'succeeded'
      AND organization_id = '30000000-0000-4000-8000-000000000001'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
  ),
  'Lesson reassignment changed the original job organization'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.organization_ai_usage
    WHERE organization_id = '30000000-0000-4000-8000-000000000001'
      AND user_id = '10000000-0000-4000-8000-000000000001'
      AND category = 'quiz_generation'
      AND quantity = 1
      AND reference_id = 'verify:quota'
  ),
  'Original source quota reservation changed after reassignment or retry'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 0 FROM public.organization_ai_usage
    WHERE organization_id = '30000000-0000-4000-8000-000000000002'
      AND reference_id = 'verify:quota'
  ),
  'Retry created a target-organization quota reservation'
);

-- Upload RPC returns and persists the expected asset, artifact, job, and usage.
SELECT public._verify_0035_set_actor(
  '10000000-0000-4000-8000-000000000001',
  'service_role'
);
SET LOCAL ROLE service_role;
WITH uploaded AS (
  SELECT public.create_uploaded_lesson_artifact(
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'verify:upload',
    '{
      "id":"90000000-0000-4000-8000-000000000001",
      "lesson_id":"40000000-0000-4000-8000-000000000001",
      "objective_id":"50000000-0000-4000-8000-000000000001",
      "asset_type":"uploaded_media",
      "storage_bucket":"lesson-assets",
      "storage_path":"verification/90000000-0000-4000-8000-000000000001",
      "mime_type":"image/png",
      "byte_size":1,
      "checksum_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "original_filename":"verification.png",
      "alt_text":"Verification image",
      "caption":"",
      "processing_status":"ready"
    }'::jsonb,
    '{
      "id":"80000000-0000-4000-8000-000000000005",
      "lesson_id":"40000000-0000-4000-8000-000000000001",
      "objective_id":"50000000-0000-4000-8000-000000000001",
      "objective_revision":1,
      "kind":"uploaded_media",
      "position":9,
      "payload":{"assetId":"90000000-0000-4000-8000-000000000001"}
    }'::jsonb,
    '{
      "id":"60000000-0000-4000-8000-000000000003",
      "batch_id":"70000000-0000-4000-8000-000000000003",
      "lesson_id":"40000000-0000-4000-8000-000000000001",
      "objective_id":"50000000-0000-4000-8000-000000000001",
      "job_type":"extract_media",
      "idempotency_key":"verify:upload-job",
      "input":{}
    }'::jsonb
  ) AS payload
)
SELECT public._verify_0035_assert(
  payload #>> '{asset,id}' = '90000000-0000-4000-8000-000000000001'
    AND payload #>> '{artifact,id}' = '80000000-0000-4000-8000-000000000005'
    AND payload #>> '{job,id}' = '60000000-0000-4000-8000-000000000003',
  'Upload RPC returned incorrect identifiers'
)
FROM uploaded;
RESET ROLE;

SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lesson_assets
    WHERE id = '90000000-0000-4000-8000-000000000001'
      AND processing_status = 'ready'
  ),
  'Upload asset was not persisted'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.lesson_artifacts
    WHERE id = '80000000-0000-4000-8000-000000000005'
      AND payload ->> 'assetId' = '90000000-0000-4000-8000-000000000001'
      AND source = 'teacher_uploaded'
  ),
  'Upload artifact was not persisted'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.content_jobs
    WHERE id = '60000000-0000-4000-8000-000000000003'
      AND asset_id = '90000000-0000-4000-8000-000000000001'
      AND artifact_id = '80000000-0000-4000-8000-000000000005'
      AND organization_id = '30000000-0000-4000-8000-000000000001'
      AND status = 'queued'
  ),
  'Upload job links were not persisted'
);
SELECT public._verify_0035_assert(
  (
    SELECT count(*) = 1 FROM public.organization_ai_usage
    WHERE organization_id = '30000000-0000-4000-8000-000000000001'
      AND user_id = '10000000-0000-4000-8000-000000000001'
      AND category = 'media_bytes'
      AND quantity = 1
      AND reference_id = 'verify:upload'
  ),
  'Upload RPC did not reserve source-organization media usage'
);

RESET ROLE;
ROLLBACK;

-- Prove the main transaction left neither helpers nor fixtures.
BEGIN READ ONLY;
DO $verify_rollback$
BEGIN
  IF to_regprocedure('public._verify_0035_assert(boolean,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_expect_error(text,text,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_assert_row_count(text,bigint,text)') IS NOT NULL
    OR to_regprocedure('public._verify_0035_set_actor(uuid,text)') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%'
        OR email LIKE 'verify-%@example.invalid'
    )
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE id::text LIKE '40000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.content_jobs
      WHERE id::text LIKE '60000000-0000-4000-8000-00000000000%'
        OR idempotency_key LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_artifacts
      WHERE id::text LIKE '80000000-0000-4000-8000-00000000000%'
        OR series_id::text LIKE 'a0000000-0000-4000-8000-00000000000%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_assets
      WHERE id::text LIKE '90000000-0000-4000-8000-00000000000%'
        OR storage_path LIKE 'verification/%'
    )
    OR EXISTS (
      SELECT 1 FROM public.lesson_publications
      WHERE id::text LIKE 'b0000000-0000-4000-8000-00000000000%'
        OR content_hash LIKE 'verify:%'
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_ai_usage
      WHERE reference_id LIKE 'verify:%'
    ) THEN
    RAISE EXCEPTION 'Rollback-only verifier left helpers or fixtures behind';
  END IF;
END;
$verify_rollback$;
ROLLBACK;

\echo '0035 rollback-only DML verification passed.'
