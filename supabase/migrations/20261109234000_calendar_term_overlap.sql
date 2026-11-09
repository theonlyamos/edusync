-- Terms in one school can't overlap. The API checks this before it writes, but
-- two people saving at the same moment could both pass that check, so the
-- database decides: writes of a term take a per-school lock, then look again.
CREATE OR REPLACE FUNCTION public.school_calendar_terms_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind <> 'term' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('school_calendar_terms:' || NEW.organization_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.school_calendar_entries other
    WHERE other.organization_id = NEW.organization_id
      AND other.kind = 'term'
      AND other.id <> NEW.id
      AND other.starts_on <= NEW.ends_on
      AND other.ends_on >= NEW.starts_on
  ) THEN
    RAISE EXCEPTION 'Terms cannot overlap' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.school_calendar_terms_no_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS school_calendar_terms_no_overlap ON public.school_calendar_entries;
CREATE TRIGGER school_calendar_terms_no_overlap
  BEFORE INSERT OR UPDATE OF kind, starts_on, ends_on, organization_id ON public.school_calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.school_calendar_terms_no_overlap();
