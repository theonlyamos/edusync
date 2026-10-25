-- A lesson can only point at a subject of its own school, however the
-- subject_id is written.
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
  ELSIF NEW.subject_id IS NOT NULL
     AND NEW.subject_id IS DISTINCT FROM OLD.subject_id
     AND NOT EXISTS (
       SELECT 1 FROM public.school_subjects s
       WHERE s.id = NEW.subject_id AND s.organization_id = NEW.organization_id
     ) THEN
    NEW.subject_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER lessons_link_school_subject
  BEFORE INSERT OR UPDATE OF subject, organization_id, subject_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.lessons_link_school_subject();
