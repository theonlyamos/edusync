-- A student whose grade changes (moved, promoted) leaves a class of the old grade.
CREATE OR REPLACE FUNCTION public.leave_class_on_grade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.grade IS DISTINCT FROM OLD.grade THEN
    DELETE FROM public.school_class_students cs
    USING public.school_classes c
    WHERE cs.class_id = c.id
      AND cs.student_id = NEW.user_id
      AND c.grade IS DISTINCT FROM NEW.grade;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER students_leave_class_on_grade_change
  AFTER UPDATE OF grade ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.leave_class_on_grade_change();
