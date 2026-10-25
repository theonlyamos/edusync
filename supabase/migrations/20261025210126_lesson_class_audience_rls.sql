-- Lessons set for some classes: enforce it in the database too, and
-- forget the classes when a lesson moves to another grade or school.

CREATE OR REPLACE FUNCTION public.in_class_audience(p_audience uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(cardinality(p_audience), 0) = 0
    OR EXISTS (
      SELECT 1 FROM public.school_class_students cs
      WHERE cs.student_id = auth.uid() AND cs.class_id = ANY (p_audience)
    );
$$;

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
        AND public.in_class_audience(l.audience_class_ids)
    );
$$;

ALTER POLICY lessons_student_select ON public.lessons
  USING (
    organization_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = auth.uid()
        AND (lessons.gradelevel IS NULL OR s.grade = lessons.gradelevel)
    )
    AND public.in_class_audience(audience_class_ids)
  );

CREATE OR REPLACE FUNCTION public.lessons_reset_class_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gradelevel IS DISTINCT FROM OLD.gradelevel OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    NEW.audience_class_ids := '{}';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER lessons_reset_class_audience
  BEFORE UPDATE OF gradelevel, organization_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.lessons_reset_class_audience();
