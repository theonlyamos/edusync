-- School scoping (phase 1 of school onboarding)
--
-- Turns organizations into schools and ties teachers, students and their
-- teaching data to exactly one school. Existing data moves into one default
-- school, so nothing changes for current users.
--
-- What this does:
--   1. organizations.type ('school' | 'developer') and is_default_school
--   2. organization_members roles gain 'teacher' and 'student'
--   3. a person belongs to at most one school (trigger-enforced)
--   4. organization_id on students, teachers, grades, timetables,
--      assessments and live_class_events, filled on insert by triggers
--   5. helper functions: user_school_id, current_school_id, default_school_id
--   6. backfill into a default school owned by the first platform admin
--   7. teacher/student RLS SELECT policies also require the same school
--   8. grade lookup for live-class auto-enrollment is scoped to one school

-- ---------------------------------------------------------------------------
-- 1. Organization type
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS is_default_school boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_type_check CHECK (type IN ('school', 'developer'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_default_is_school;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_default_is_school CHECK (NOT is_default_school OR type = 'school');

CREATE UNIQUE INDEX IF NOT EXISTS organizations_single_default_school
  ON public.organizations (is_default_school) WHERE is_default_school;

-- ---------------------------------------------------------------------------
-- 2. Membership roles
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'teacher', 'student'));

-- ---------------------------------------------------------------------------
-- 5. Helpers (defined before the triggers and policies that use them)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id FROM public.organizations o WHERE o.is_default_school LIMIT 1;
$$;

-- The one school a user belongs to (active membership in a school-type org).
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
  ORDER BY m.joined_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_school_id(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.default_school_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_school_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. One school per person
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_single_school_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS organization_members_single_school ON public.organization_members;
CREATE TRIGGER organization_members_single_school
BEFORE INSERT OR UPDATE OF organization_id, user_id, is_active ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_school_membership();

-- ---------------------------------------------------------------------------
-- 4. School columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.live_class_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS students_organization_id_idx ON public.students (organization_id);
CREATE INDEX IF NOT EXISTS teachers_organization_id_idx ON public.teachers (organization_id);
CREATE INDEX IF NOT EXISTS grades_organization_id_idx ON public.grades (organization_id);
CREATE INDEX IF NOT EXISTS timetables_organization_id_idx ON public.timetables (organization_id);
CREATE INDEX IF NOT EXISTS assessments_organization_id_idx ON public.assessments (organization_id);
CREATE INDEX IF NOT EXISTS live_class_events_organization_id_idx ON public.live_class_events (organization_id);
CREATE INDEX IF NOT EXISTS lessons_organization_id_idx ON public.lessons (organization_id);

-- Fill organization_id on insert when the caller did not set it:
-- the linked person's school first, then the signed-in user's school,
-- then the default school.
CREATE OR REPLACE FUNCTION public.set_school_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_user uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
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
    public.user_school_id(linked_user),
    public.user_school_id(auth.uid()),
    public.default_school_id()
  );
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'teachers', 'grades', 'timetables', 'assessments', 'live_class_events', 'lessons']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_school', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert()',
      t || '_set_school', t
    );
  END LOOP;
END;
$$;

-- A new student or teacher row also makes its person a member of that school,
-- so the profile row and the membership never drift apart.
CREATE OR REPLACE FUNCTION public.ensure_school_membership_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.user_school_id(NEW.user_id) IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  VALUES (
    NEW.organization_id,
    NEW.user_id,
    CASE WHEN TG_TABLE_NAME = 'teachers' THEN 'teacher' ELSE 'student' END,
    true,
    now()
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_school_membership ON public.students;
CREATE TRIGGER students_school_membership
AFTER INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ensure_school_membership_for_profile();

DROP TRIGGER IF EXISTS teachers_school_membership ON public.teachers;
CREATE TRIGGER teachers_school_membership
AFTER INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.ensure_school_membership_for_profile();

-- ---------------------------------------------------------------------------
-- 6. Backfill into a default school
-- ---------------------------------------------------------------------------
-- Organizations that exist today were created for API keys and credits, so
-- they keep the column default, 'developer'.
DO $$
DECLARE
  school uuid;
  owner uuid;
  has_school_data boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.students)
      OR EXISTS (SELECT 1 FROM public.teachers)
      OR EXISTS (SELECT 1 FROM public.lessons)
      OR EXISTS (SELECT 1 FROM public.timetables)
      OR EXISTS (SELECT 1 FROM public.grades)
      OR EXISTS (SELECT 1 FROM public.assessments)
      OR EXISTS (SELECT 1 FROM public.live_class_events)
  INTO has_school_data;

  school := public.default_school_id();

  IF school IS NULL AND has_school_data THEN
    SELECT u.id INTO owner
    FROM public.users u
    WHERE u.role = 'admin'
    ORDER BY u.created_at
    LIMIT 1;

    IF owner IS NULL THEN
      RAISE NOTICE 'School scoping: no admin user to own the default school; backfill skipped';
      RETURN;
    END IF;

    -- The existing organizations insert trigger adds the owner as a member.
    INSERT INTO public.organizations (name, description, owner_id, type, is_default_school, settings)
    VALUES ('InsyteAI School', 'Default school for accounts created before schools existed', owner, 'school', true, '{}')
    RETURNING id INTO school;
  END IF;

  IF school IS NULL THEN
    RETURN;
  END IF;

  -- Memberships for existing teachers and students without a school.
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  SELECT school, t.user_id, 'teacher', true, now()
  FROM public.teachers t
  WHERE public.user_school_id(t.user_id) IS NULL
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  SELECT school, s.user_id, 'student', true, now()
  FROM public.students s
  WHERE public.user_school_id(s.user_id) IS NULL
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  UPDATE public.teachers t SET organization_id = COALESCE(public.user_school_id(t.user_id), school)
  WHERE t.organization_id IS NULL;
  UPDATE public.students s SET organization_id = COALESCE(public.user_school_id(s.user_id), school)
  WHERE s.organization_id IS NULL;

  UPDATE public.grades SET organization_id = school WHERE organization_id IS NULL;
  UPDATE public.timetables SET organization_id = school WHERE organization_id IS NULL;

  UPDATE public.assessments a
  SET organization_id = COALESCE(
    (SELECT t.organization_id FROM public.teachers t WHERE t.id = a.teacher_id),
    public.user_school_id(a.createdby),
    school
  )
  WHERE a.organization_id IS NULL;

  UPDATE public.live_class_events e
  SET organization_id = COALESCE(public.user_school_id(e.organizer_id), school)
  WHERE e.organization_id IS NULL;

  -- Lessons: the reassignment guard trigger checks the caller's JWT, which a
  -- migration does not have. Only rows with no organization are touched.
  ALTER TABLE public.lessons DISABLE TRIGGER lessons_organization_reassignment_guard;
  UPDATE public.lessons l
  SET organization_id = COALESCE(
    (SELECT t.organization_id FROM public.teachers t WHERE t.id = l.teacher_id),
    school
  )
  WHERE l.organization_id IS NULL;
  ALTER TABLE public.lessons ENABLE TRIGGER lessons_organization_reassignment_guard;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS: teacher and student reads stay inside their school
-- ---------------------------------------------------------------------------
-- Platform-admin policies (*_admin_all) and owner policies (own row, own
-- lesson via can_manage_lesson) are unchanged.

DROP POLICY IF EXISTS lessons_teacher_select ON public.lessons;
CREATE POLICY lessons_teacher_select ON public.lessons
FOR SELECT TO authenticated
USING (
  public.is_teacher()
  AND organization_id = public.current_school_id()
);

DROP POLICY IF EXISTS lessons_student_select ON public.lessons;
CREATE POLICY lessons_student_select ON public.lessons
FOR SELECT TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid()
      AND (lessons.gradelevel IS NULL OR s.grade = lessons.gradelevel)
  )
);

CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_lesson(p_lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.students s ON s.user_id = auth.uid()
      WHERE l.id = p_lesson_id
        AND l.organization_id = public.user_school_id(auth.uid())
        AND (l.gradelevel IS NULL OR lower(btrim(l.gradelevel)) = lower(btrim(s.grade)))
    );
$$;

DROP POLICY IF EXISTS lesson_content_teacher_select ON public.lesson_content;
CREATE POLICY lesson_content_teacher_select ON public.lesson_content
FOR SELECT TO authenticated
USING (
  public.is_teacher()
  AND EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_content.lesson_id
      AND l.organization_id = public.current_school_id()
  )
);

DROP POLICY IF EXISTS lesson_content_student_select ON public.lesson_content;
CREATE POLICY lesson_content_student_select ON public.lesson_content
FOR SELECT TO authenticated
USING (public.can_access_lesson(lesson_content.lesson_id));

DROP POLICY IF EXISTS students_teacher_select ON public.students;
CREATE POLICY students_teacher_select ON public.students
FOR SELECT TO authenticated
USING (
  public.is_teacher()
  AND organization_id = public.current_school_id()
);

DROP POLICY IF EXISTS teachers_student_view_basic ON public.teachers;
CREATE POLICY teachers_student_view_basic ON public.teachers
FOR SELECT TO authenticated
USING (organization_id = public.current_school_id());

DROP POLICY IF EXISTS timetables_teacher_select ON public.timetables;
CREATE POLICY timetables_teacher_select ON public.timetables
FOR SELECT TO authenticated
USING (
  public.is_teacher()
  AND organization_id = public.current_school_id()
);

-- The old student policy compared s.grade to itself, so every student could
-- read every timetable.
DROP POLICY IF EXISTS timetables_student_select ON public.timetables;
CREATE POLICY timetables_student_select ON public.timetables
FOR SELECT TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.grade = timetables.grade
  )
);

DROP POLICY IF EXISTS grades_select_all ON public.grades;
CREATE POLICY grades_select_school ON public.grades
FOR SELECT TO authenticated
USING (organization_id = public.current_school_id() OR public.is_admin());

DROP POLICY IF EXISTS assessments_teacher_select ON public.assessments;
CREATE POLICY assessments_teacher_select ON public.assessments
FOR SELECT TO authenticated
USING (
  public.is_teacher()
  AND organization_id = public.current_school_id()
);

DROP POLICY IF EXISTS assessments_student_select ON public.assessments;
CREATE POLICY assessments_student_select ON public.assessments
FOR SELECT TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.grade = assessments.gradelevel
  )
);

DROP POLICY IF EXISTS users_teacher_view_students ON public.users;
CREATE POLICY users_teacher_view_students ON public.users
FOR SELECT TO authenticated
USING (
  role = 'student'
  AND public.is_teacher()
  AND public.user_school_id(users.id) = public.current_school_id()
);

-- ---------------------------------------------------------------------------
-- 8. Live-class auto-enrollment by grade, within one school
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.student_user_ids_for_grade_level(text);
CREATE OR REPLACE FUNCTION public.student_user_ids_for_grade_level(p_grade text, p_organization_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.students s
  WHERE p_grade IS NOT NULL
    AND btrim(p_grade) <> ''
    AND lower(btrim(s.grade)) = lower(btrim(p_grade))
    AND s.organization_id IS NOT DISTINCT FROM p_organization_id
  ORDER BY s.user_id;
$$;

REVOKE ALL ON FUNCTION public.student_user_ids_for_grade_level(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text, uuid) TO service_role;
