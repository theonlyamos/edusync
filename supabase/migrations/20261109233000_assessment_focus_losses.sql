-- How many times a student left the page while taking an assessment, so the
-- teacher can see it next to the result. Recorded by the server on submit.
ALTER TABLE public.assessment_results ADD COLUMN IF NOT EXISTS focus_losses integer NOT NULL DEFAULT 0;
