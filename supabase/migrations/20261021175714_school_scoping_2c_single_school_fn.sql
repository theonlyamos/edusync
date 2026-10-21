CREATE OR REPLACE FUNCTION public.enforce_single_school_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = NEW.organization_id AND o.type = 'school'
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = NEW.user_id
      AND m.is_active = true
      AND o.type = 'school'
      AND m.organization_id <> NEW.organization_id
      AND m.id <> NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'User already belongs to another school';
  END IF;
  RETURN NEW;
END;
$$;
