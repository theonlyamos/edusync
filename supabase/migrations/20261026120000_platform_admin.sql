-- What platform admins do (credits granted, schools suspended, ownership
-- moved, accounts deactivated), so there's a record of who changed what.
CREATE TABLE IF NOT EXISTS public.platform_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 60),
  target_type text NOT NULL CHECK (target_type IN ('school', 'organization', 'user')),
  target_id uuid,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_admin_actions_created_idx ON public.platform_admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_admin_actions_target_idx ON public.platform_admin_actions (target_id);

-- Only the server (service role) reads and writes it.
ALTER TABLE public.platform_admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_actions FROM anon, authenticated;
GRANT ALL ON public.platform_admin_actions TO service_role;

-- A suspended school (organizations.is_active = false) no longer counts as
-- anyone's school: its portal, lessons and credit pool stop working for its
-- members until it is reactivated.
CREATE OR REPLACE FUNCTION public.user_school_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
    AND m.is_active = true
    AND o.type = 'school'
    AND o.is_active = true
  ORDER BY m.joined_at
  LIMIT 1;
$$;

-- The person's school even while it is suspended. Used only when filing new
-- rows, so work made by a suspended school's members stays in that school
-- instead of falling back to the default school.
CREATE OR REPLACE FUNCTION public.user_school_id_any_status(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
    AND m.is_active = true
    AND o.type = 'school'
  ORDER BY m.joined_at
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.user_school_id_any_status(uuid) FROM PUBLIC, anon, authenticated;

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
    public.user_school_id_any_status(linked_user),
    public.user_school_id_any_status(auth.uid()),
    public.default_school_id()
  );
  RETURN NEW;
END;
$$;
