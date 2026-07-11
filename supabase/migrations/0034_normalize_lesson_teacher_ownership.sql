-- Repair lesson artifact functions for schemas that use normalized teacher ownership.
CREATE OR REPLACE FUNCTION public.can_manage_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role' OR EXISTS (
    SELECT 1
    FROM public.lessons l
    LEFT JOIN public.teachers t ON t.id = l.teacher_id
    WHERE l.id = p_lesson_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_lesson_draft(
  p_title text,
  p_subject text,
  p_grade_level text,
  p_content text,
  p_objectives jsonb,
  p_organization_id uuid,
  p_owner_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_lesson_id uuid;
  normalized_objectives text[];
  owner_teacher_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the lesson API may create lesson drafts';
  END IF;
  IF btrim(p_title) = '' OR btrim(p_subject) = '' OR btrim(p_grade_level) = '' THEN
    RAISE EXCEPTION 'Title, subject, and grade level are required';
  END IF;
  IF jsonb_typeof(p_objectives) <> 'array' OR jsonb_array_length(p_objectives) = 0 THEN
    RAISE EXCEPTION 'At least one objective is required';
  END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_owner_user_id AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Owner is not an active member of the selected organization';
  END IF;

  SELECT id INTO owner_teacher_id
  FROM public.teachers
  WHERE user_id = p_owner_user_id
  LIMIT 1;
  IF owner_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Lesson owner does not have a teacher profile';
  END IF;

  SELECT array_agg(btrim(value) ORDER BY ordinality)
  INTO normalized_objectives
  FROM jsonb_array_elements_text(p_objectives) WITH ORDINALITY AS objective(value, ordinality)
  WHERE btrim(value) <> '';
  IF COALESCE(array_length(normalized_objectives, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one non-empty objective is required';
  END IF;

  INSERT INTO public.lessons (
    title, subject, gradelevel, objectives, content, teacher_id, organization_id, created_at, updated_at
  )
  VALUES (
    btrim(p_title), btrim(p_subject), btrim(p_grade_level), normalized_objectives, p_content,
    owner_teacher_id, p_organization_id, now(), now()
  )
  RETURNING id INTO new_lesson_id;

  INSERT INTO public.lesson_objectives (lesson_id, text, position)
  SELECT new_lesson_id, objective, (ordinality - 1)::integer
  FROM unnest(normalized_objectives) WITH ORDINALITY AS item(objective, ordinality);

  RETURN new_lesson_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lesson_draft(text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lesson_draft(text, text, text, text, jsonb, uuid, uuid) TO service_role;
