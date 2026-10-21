-- Fixes for the school scoping migration, from review after it merged.
--
-- 1. A row inserted with a developer organization (API keys) now gets a
--    school instead; only schools scope teaching data.
-- 2. Lessons already saved under a developer organization move to their
--    teacher's school (or the default school).
-- 3. Account details (users) are readable only by the person, people who
--    share an active school or organization with them, and platform admins.
--    The old users_select_basic_public_info policy let any signed-in user
--    read every account.
--
-- Written without DROP statements: the Supabase MCP hangs on them.

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Explicit organization_id must be a school
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_school_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_user uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = NEW.organization_id AND o.type = 'school'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('students', 'teachers') THEN
    linked_user := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'live_class_events' THEN
    linked_user := NEW.organizer_id;
  ELSIF TG_TABLE_NAME = 'assessments' THEN
    linked_user := COALESCE(
      (SELECT t.user_id FROM public.teachers t WHERE t.id = NEW.teacher_id),
      NEW.createdby
    );
  ELSIF TG_TABLE_NAME = 'lessons' THEN
    linked_user := (SELECT t.user_id FROM public.teachers t WHERE t.id = NEW.teacher_id);
  END IF;

  NEW.organization_id := COALESCE(
    public.user_school_id(linked_user),
    public.user_school_id(auth.uid()),
    public.default_school_id()
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lessons saved under a developer organization
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  school uuid := public.default_school_id();
BEGIN
  IF school IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.lessons DISABLE TRIGGER lessons_organization_reassignment_guard;
  UPDATE public.lessons l
  SET organization_id = COALESCE(
    (SELECT t.organization_id FROM public.teachers t WHERE t.id = l.teacher_id),
    school
  )
  WHERE l.organization_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = l.organization_id AND o.type = 'school'
    );
  ALTER TABLE public.lessons ENABLE TRIGGER lessons_organization_reassignment_guard;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Account details stay inside shared schools and organizations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_organization_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members mine
    JOIN public.organization_members theirs ON theirs.organization_id = mine.organization_id
    WHERE mine.user_id = auth.uid()
      AND mine.is_active = true
      AND theirs.user_id = p_user_id
      AND theirs.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.shares_organization_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_organization_with(uuid) TO authenticated, service_role;

-- Name kept; it now means "people you work with".
ALTER POLICY users_select_basic_public_info ON public.users TO authenticated
USING (
  id = auth.uid()
  OR public.shares_organization_with(id)
);

-- The teacher policy now uses the same helper, so it no longer needs to call
-- user_school_id() as the signed-in user.
ALTER POLICY users_teacher_view_students ON public.users TO authenticated
USING (
  role = 'student'
  AND public.is_teacher()
  AND public.shares_organization_with(id)
);
