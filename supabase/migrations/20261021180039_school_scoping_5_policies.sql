SET LOCAL lock_timeout = '10s';
ALTER POLICY lessons_teacher_select ON public.lessons TO authenticated
USING (public.is_teacher() AND organization_id = public.current_school_id());
ALTER POLICY lessons_student_select ON public.lessons TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid()
      AND (lessons.gradelevel IS NULL OR s.grade = lessons.gradelevel)
  )
);
CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
ALTER POLICY lesson_content_teacher_select ON public.lesson_content TO authenticated
USING (
  public.is_teacher()
  AND EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_content.lesson_id
      AND l.organization_id = public.current_school_id()
  )
);
ALTER POLICY lesson_content_student_select ON public.lesson_content TO authenticated
USING (public.can_access_lesson(lesson_content.lesson_id));
ALTER POLICY students_teacher_select ON public.students TO authenticated
USING (public.is_teacher() AND organization_id = public.current_school_id());
ALTER POLICY teachers_student_view_basic ON public.teachers TO authenticated
USING (organization_id = public.current_school_id());
ALTER POLICY timetables_teacher_select ON public.timetables TO authenticated
USING (public.is_teacher() AND organization_id = public.current_school_id());
ALTER POLICY timetables_student_select ON public.timetables TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.grade = timetables.grade
  )
);
ALTER POLICY grades_select_all ON public.grades TO authenticated
USING (organization_id = public.current_school_id() OR public.is_admin());
ALTER POLICY assessments_teacher_select ON public.assessments TO authenticated
USING (public.is_teacher() AND organization_id = public.current_school_id());
ALTER POLICY assessments_student_select ON public.assessments TO authenticated
USING (
  organization_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.grade = assessments.gradelevel
  )
);
ALTER POLICY users_teacher_view_students ON public.users TO authenticated
USING (
  role = 'student'
  AND public.is_teacher()
  AND public.user_school_id(users.id) = public.current_school_id()
);
CREATE OR REPLACE FUNCTION public.student_user_ids_for_grade_level(p_grade text)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.students s
  WHERE p_grade IS NOT NULL
    AND btrim(p_grade) <> ''
    AND lower(btrim(s.grade)) = lower(btrim(p_grade))
    AND s.organization_id IS NOT DISTINCT FROM public.default_school_id()
  ORDER BY s.user_id;
$$;
CREATE OR REPLACE FUNCTION public.student_user_ids_for_grade_level(p_grade text, p_organization_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public
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
