-- School registration (phase 2 of school onboarding).
--
-- Anyone with a confirmed email can register one school and becomes its owner.
-- Schools can only be created through register_school(), so the safety checks
-- here (confirmed email, one school per person, no platform admins) cannot be
-- skipped by writing to organizations directly.
--
-- Written without DROP statements: the Supabase MCP hangs on them.

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. School details
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS grade_levels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS setup_dismissed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_school_details_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_school_details_check CHECK (
      (country IS NULL OR char_length(country) BETWEEN 1 AND 80)
      AND (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64)
      AND cardinality(grade_levels) <= 30
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Registering a school
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_school(
  p_name text,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_grade_levels text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_name text := btrim(coalesce(p_name, ''));
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_timezone text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_grades text[];
  v_school uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to register a school' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = v_user AND a.email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm your email address before registering a school' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'School name must be 2 to 120 characters' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT g), '{}') INTO v_grades
  FROM unnest(coalesce(p_grade_levels, '{}')) AS g
  WHERE btrim(g) <> '';
  IF cardinality(v_grades) > 30 OR EXISTS (SELECT 1 FROM unnest(v_grades) g WHERE char_length(g) > 40) THEN
    RAISE EXCEPTION 'Too many or too long grade levels' USING ERRCODE = '22023';
  END IF;

  -- Lock the account so two registrations from the same person run one at a time.
  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_user FOR UPDATE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Platform admin accounts cannot register a school' USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('student', 'learner')
     OR EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = v_user)
     OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = v_user) THEN
    RAISE EXCEPTION 'This account already teaches or studies at a school' USING ERRCODE = 'P0001';
  END IF;
  IF public.user_school_id(v_user) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = v_user AND o.type = 'school') THEN
    RAISE EXCEPTION 'You already belong to a school' USING ERRCODE = 'P0001';
  END IF;

  -- The organization_created_trigger adds the owner membership.
  INSERT INTO public.organizations (name, owner_id, type, country, timezone, grade_levels)
  VALUES (v_name, v_user, 'school', v_country, v_timezone, v_grades)
  RETURNING id INTO v_school;

  -- School owners run the school; they are not students in it.
  UPDATE public.users SET role = 'learner' WHERE id = v_user AND role = 'student';

  RETURN v_school;
END;
$$;

REVOKE ALL ON FUNCTION public.register_school(text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_school(text, text, text, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Schools are only created through register_school()
-- ---------------------------------------------------------------------------
-- Direct inserts may only create developer organizations with no credits.
ALTER POLICY organizations_insert_own ON public.organizations
WITH CHECK (
  auth.uid() = owner_id
  AND type = 'developer'
  AND NOT is_default_school
  AND credits = 0
  AND total_credits_purchased = 0
  AND total_credits_used = 0
);

-- Owners may edit details but not the type, default flag, owner or totals.
REVOKE UPDATE ON public.organizations FROM anon, authenticated;
GRANT UPDATE (name, description, is_active, settings, credits, country, timezone, grade_levels, setup_dismissed_at, updated_at)
  ON public.organizations TO authenticated;

-- People join a school by invite (phase 3), not by an owner writing a
-- membership row for any account. Developer organizations keep working as before.
ALTER POLICY organization_members_insert_admin ON public.organization_members
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
);

ALTER POLICY organization_members_update_admin ON public.organization_members
USING (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
);

-- ---------------------------------------------------------------------------
-- 4. Close grade lookups to signed-out and signed-in callers
-- ---------------------------------------------------------------------------
-- Only the server (service role) and SECURITY DEFINER helpers use these;
-- they list student account ids and any account's school.
REVOKE EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_school_id(uuid) FROM PUBLIC, anon, authenticated;
