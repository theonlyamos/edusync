-- Link a lesson to its school's subject whenever its subject text or school
-- changes, whichever route saves it. Matches the subject's name, any case.
CREATE OR REPLACE FUNCTION public.lessons_link_school_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    NEW.subject_id := (
      SELECT s.id FROM public.school_subjects s
      WHERE s.organization_id = NEW.organization_id
        AND lower(btrim(s.name)) = lower(btrim(NEW.subject))
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER lessons_link_school_subject
  BEFORE INSERT OR UPDATE OF subject, organization_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.lessons_link_school_subject();
