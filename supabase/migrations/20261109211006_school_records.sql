-- Daily attendance registers and term report cards. Only the server (service
-- role) reads and writes these tables; the API decides who sees what.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.school_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note text CHECK (char_length(note) <= 300),
  marked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id, day)
);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON public.attendance_records (student_id, day);
CREATE INDEX IF NOT EXISTS attendance_records_school_idx ON public.attendance_records (organization_id, day);
CREATE INDEX IF NOT EXISTS attendance_records_marked_by_idx ON public.attendance_records (marked_by);

CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.school_classes(id) ON DELETE SET NULL,
  term text NOT NULL CHECK (char_length(term) BETWEEN 1 AND 60),
  period_start date NOT NULL,
  period_end date NOT NULL,
  CHECK (period_end >= period_start),
  -- Marks by subject and attendance totals, frozen when the card was made.
  snapshot jsonb NOT NULL DEFAULT '{}',
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, term)
);
CREATE INDEX IF NOT EXISTS report_cards_student_idx ON public.report_cards (student_id, period_end DESC);
CREATE INDEX IF NOT EXISTS report_cards_class_idx ON public.report_cards (class_id, term);
CREATE INDEX IF NOT EXISTS report_cards_created_by_idx ON public.report_cards (created_by);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_records, public.report_cards FROM anon, authenticated;
GRANT ALL ON public.attendance_records, public.report_cards TO service_role;

-- Parents and guardians: which accounts may follow which student. A guardian
-- is a plain account that is not a member of the school.
CREATE TABLE IF NOT EXISTS public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, guardian_id)
);
CREATE INDEX IF NOT EXISTS student_guardians_guardian_idx ON public.student_guardians (guardian_id);
CREATE INDEX IF NOT EXISTS student_guardians_school_idx ON public.student_guardians (organization_id);
CREATE INDEX IF NOT EXISTS student_guardians_created_by_idx ON public.student_guardians (created_by);
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_guardians FROM anon, authenticated;
GRANT ALL ON public.student_guardians TO service_role;
