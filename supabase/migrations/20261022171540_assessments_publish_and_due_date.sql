DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assessments' AND column_name = 'is_published'
  ) THEN
    ALTER TABLE public.assessments ADD COLUMN is_published boolean NOT NULL DEFAULT false;
    -- Assessments that already exist were visible to students; keep them that way.
    UPDATE public.assessments SET is_published = true;
  END IF;
END $$;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Students only see published assessments for their own school and grade.
DO $$
DECLARE
  rule text := $rule$
    is_published
    AND organization_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = auth.uid()
        AND lower(btrim(s.grade)) = lower(btrim(assessments.gradelevel))
    )$rule$;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assessments' AND policyname = 'assessments_student_select') THEN
    EXECUTE format('ALTER POLICY assessments_student_select ON public.assessments TO authenticated USING (%s)', rule);
  ELSE
    EXECUTE format('CREATE POLICY assessments_student_select ON public.assessments FOR SELECT TO authenticated USING (%s)', rule);
  END IF;
END $$;

-- Not in the production run: production already names these columns
-- assessment_id and student_id. Older local schemas used assessmentid/studentid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assessment_results' AND column_name = 'assessmentid') THEN
    ALTER TABLE public.assessment_results RENAME COLUMN assessmentid TO assessment_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assessment_results' AND column_name = 'studentid') THEN
    ALTER TABLE public.assessment_results RENAME COLUMN studentid TO student_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assessment_results_assessment_student_idx
  ON public.assessment_results (assessment_id, student_id);
