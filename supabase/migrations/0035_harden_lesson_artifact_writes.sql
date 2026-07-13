BEGIN;

-- Browser clients may inspect their own jobs but must not create, lease, or edit them.
DROP POLICY IF EXISTS content_jobs_insert_own ON public.content_jobs;
DROP POLICY IF EXISTS content_jobs_update_own ON public.content_jobs;

DO $$
DECLARE
  content_job_policy record;
BEGIN
  FOR content_job_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_jobs'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY %I ON public.content_jobs', content_job_policy.policyname);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.content_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.content_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_jobs TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_content_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_jobs(text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb) TO service_role;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Remove every existing browser-facing mutation policy by catalog metadata, not by policy name.
DO $$
DECLARE
  lesson_policy record;
BEGIN
  FOR lesson_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lessons'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY %I ON public.lessons', lesson_policy.policyname);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS lessons_manager_select ON public.lessons;
DROP POLICY IF EXISTS lessons_manager_update ON public.lessons;
DROP POLICY IF EXISTS lessons_manager_delete ON public.lessons;

CREATE OR REPLACE FUNCTION public.can_assign_lesson_teacher(p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role' OR EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = p_teacher_id
      AND t.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  );
$$;

CREATE POLICY lessons_manager_select ON public.lessons
  FOR SELECT TO authenticated
  USING (public.can_manage_lesson(id));

CREATE POLICY lessons_manager_update ON public.lessons
  FOR UPDATE TO authenticated
  USING (public.can_manage_lesson(id))
  WITH CHECK (public.can_assign_lesson_teacher(teacher_id));

CREATE POLICY lessons_manager_delete ON public.lessons
  FOR DELETE TO authenticated
  USING (public.can_manage_lesson(id));

REVOKE UPDATE ON TABLE public.lessons FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE does not remove per-column UPDATE grants.
DO $$
DECLARE
  lesson_column_grant record;
BEGIN
  FOR lesson_column_grant IN
    SELECT DISTINCT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND privilege_type = 'UPDATE'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.lessons FROM %s',
      lesson_column_grant.column_name,
      CASE
        WHEN lesson_column_grant.grantee = 'PUBLIC' THEN 'PUBLIC'
        ELSE quote_ident(lesson_column_grant.grantee)
      END
    );
  END LOOP;
END;
$$;

GRANT UPDATE (title, subject, gradelevel, objectives, content, organization_id, updated_at)
  ON TABLE public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_invalid_lesson_organization_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_manage_lesson(OLD.id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Not authorized to reassign lesson organization';
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Lesson organization cannot be cleared';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = OLD.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Active owner or admin membership in current organization is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Active owner or admin membership in target organization is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lessons_organization_reassignment_guard ON public.lessons;
CREATE TRIGGER lessons_organization_reassignment_guard
BEFORE UPDATE OF organization_id ON public.lessons
FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_lesson_organization_reassignment();

CREATE OR REPLACE FUNCTION public.prevent_approved_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Approved lesson artifacts are immutable; create a new version';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_artifacts_approved_immutable ON public.lesson_artifacts;
CREATE TRIGGER lesson_artifacts_approved_immutable
BEFORE UPDATE OR DELETE ON public.lesson_artifacts
FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_artifact_mutation();

COMMIT;
