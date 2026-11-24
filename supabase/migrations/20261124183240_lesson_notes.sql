-- What a whiteboard tutor lesson left behind: the boards the tutor wrote, the
-- quick-check results and the review cards. One row per tutor session, kept so
-- the student can reopen their notes later.
-- Only the server (service role) reads and writes them; the API checks whose they are.
CREATE TABLE IF NOT EXISTS public.lesson_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  learning_session_id uuid NOT NULL REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  topic text NOT NULL DEFAULT '' CHECK (char_length(topic) <= 200),
  -- { pages: [...], cards: [...] } as cleaned by the server. Photos are never stored.
  notes jsonb NOT NULL CHECK (jsonb_typeof(notes) = 'object' AND octet_length(notes::text) <= 400000),
  boards smallint NOT NULL DEFAULT 0 CHECK (boards >= 0),
  cards smallint NOT NULL DEFAULT 0 CHECK (cards >= 0),
  checks_correct smallint NOT NULL DEFAULT 0 CHECK (checks_correct >= 0),
  checks_answered smallint NOT NULL DEFAULT 0 CHECK (checks_answered >= checks_correct),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A session has one set of notes; saving again replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_notes_session_key ON public.lesson_notes (learning_session_id);
CREATE INDEX IF NOT EXISTS lesson_notes_student_idx ON public.lesson_notes (student_id, created_at DESC);
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_notes TO service_role;
