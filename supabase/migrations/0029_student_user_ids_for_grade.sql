-- Resolve student user IDs by grade (trim + case-insensitive) for live class auto-enrollment.

CREATE OR REPLACE FUNCTION public.student_user_ids_for_grade_level(p_grade text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.students s
  WHERE p_grade IS NOT NULL
    AND btrim(p_grade) <> ''
    AND lower(btrim(s.grade)) = lower(btrim(p_grade))
  ORDER BY s.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text) TO service_role;
