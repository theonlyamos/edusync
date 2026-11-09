-- A student's own revision cards, reviewed on a widening schedule (boxes 1 to 5).
-- Only the server (service role) reads and writes them.
CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 80),
  front text NOT NULL CHECK (char_length(front) BETWEEN 1 AND 500),
  back text NOT NULL CHECK (char_length(back) BETWEEN 1 AND 1000),
  box smallint NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_on date NOT NULL DEFAULT CURRENT_DATE,
  reviews integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flashcards_student_due_idx ON public.flashcards (student_id, due_on);
-- Saving the same question twice keeps one card.
CREATE UNIQUE INDEX IF NOT EXISTS flashcards_student_front_key ON public.flashcards (student_id, md5(lower(front)));
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flashcards FROM anon, authenticated;
GRANT ALL ON public.flashcards TO service_role;
