-- Classes (sections) within a grade, e.g. "JHS 1 A" and "JHS 1 B".
-- A student is in at most one class at their school. Timetables, lessons
-- and live classes can target a class; with no class they keep
-- going to the whole grade, so everything that exists today is unchanged.

CREATE TABLE IF NOT EXISTS public.school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grade text NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  room text CHECK (room IS NULL OR char_length(room) <= 60),
  class_teacher_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_classes_name_uidx
  ON public.school_classes (organization_id, grade, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.school_class_students (
  class_id uuid NOT NULL REFERENCES public.school_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);
-- One class per student at their school.
CREATE UNIQUE INDEX IF NOT EXISTS school_class_students_one_class
  ON public.school_class_students (organization_id, student_id);

CREATE TABLE IF NOT EXISTS public.school_class_teachers (
  class_id uuid NOT NULL REFERENCES public.school_classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS school_class_teachers_teacher_idx ON public.school_class_teachers (teacher_id);

-- A class timetable; NULL is the whole grade's timetable.
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.school_classes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS timetables_class_idx ON public.timetables (class_id) WHERE class_id IS NOT NULL;

-- Who a lesson or live class is for. Empty means the whole grade.
-- (Homework already lists its students one by one.)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS audience_class_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.live_class_events
  ADD COLUMN IF NOT EXISTS audience_class_ids uuid[] NOT NULL DEFAULT '{}';

-- Members of the school can read its classes; changes go through the server.
ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_class_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_classes_member_select ON public.school_classes
  FOR SELECT TO authenticated
  USING (organization_id = public.current_school_id());

CREATE POLICY school_class_students_member_select ON public.school_class_students
  FOR SELECT TO authenticated
  USING (organization_id = public.current_school_id());

CREATE POLICY school_class_teachers_member_select ON public.school_class_teachers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_school_id());

GRANT SELECT ON public.school_classes, public.school_class_students, public.school_class_teachers TO authenticated;
GRANT ALL ON public.school_classes, public.school_class_students, public.school_class_teachers TO service_role;
