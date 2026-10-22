-- Results are written by the server (service role) after grading, so students
-- must not insert or change their own rows (that would let them set scores).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assessment_results' AND policyname = 'assessment_results_student_insert') THEN
    ALTER POLICY assessment_results_student_insert ON public.assessment_results WITH CHECK (false);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assessment_results' AND policyname = 'assessment_results_student_update') THEN
    ALTER POLICY assessment_results_student_update ON public.assessment_results USING (false) WITH CHECK (false);
  END IF;
END $$;
