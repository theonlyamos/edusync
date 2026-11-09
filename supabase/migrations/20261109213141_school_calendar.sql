-- The school's academic calendar: terms, holidays, exam weeks and events.
-- Only the server (service role) reads and writes it; the API decides who sees what.
CREATE TABLE IF NOT EXISTS public.school_calendar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('term', 'holiday', 'exam', 'event')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  CHECK (ends_on >= starts_on),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_calendar_entries_school_idx ON public.school_calendar_entries (organization_id, starts_on);
CREATE INDEX IF NOT EXISTS school_calendar_entries_created_by_idx ON public.school_calendar_entries (created_by);
ALTER TABLE public.school_calendar_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_calendar_entries FROM anon, authenticated;
GRANT ALL ON public.school_calendar_entries TO service_role;
