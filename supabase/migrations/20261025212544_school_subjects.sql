-- A school's subject list, and who teaches each subject in each grade or class.
-- Lessons can point at a subject; the old text column stays as the display
-- name so everything that exists today keeps working.

CREATE TABLE IF NOT EXISTS public.school_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  code text CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 10),
  color text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  -- Grades that take the subject; empty means every grade.
  grades text[] NOT NULL DEFAULT '{}',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_subjects_name_uidx
  ON public.school_subjects (organization_id, lower(btrim(name)));

-- One teacher per subject for a whole grade (class_id NULL) or for one class.
CREATE TABLE IF NOT EXISTS public.school_subject_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.school_subjects(id) ON DELETE CASCADE,
  grade text NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 40),
  class_id uuid REFERENCES public.school_classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_teachers_slot_uidx
  ON public.school_subject_teachers (subject_id, grade, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS school_subject_teachers_teacher_idx ON public.school_subject_teachers (teacher_id);
CREATE INDEX IF NOT EXISTS school_subject_teachers_org_idx ON public.school_subject_teachers (organization_id);

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.school_subjects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS lessons_subject_idx ON public.lessons (subject_id) WHERE subject_id IS NOT NULL;

-- Members of the school can read its subjects; changes go through the server.
ALTER TABLE public.school_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_subject_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_subjects_member_select ON public.school_subjects
  FOR SELECT TO authenticated
  USING (organization_id = public.current_school_id());

CREATE POLICY school_subject_teachers_member_select ON public.school_subject_teachers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_school_id());

GRANT SELECT ON public.school_subjects, public.school_subject_teachers TO authenticated;
GRANT ALL ON public.school_subjects, public.school_subject_teachers TO service_role;
