-- Quick polls a teacher asks during a live class, and each student's answer.
-- Server-only: the app's API decides who may ask, answer and see results.
CREATE TABLE IF NOT EXISTS public.live_class_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_event_id uuid NOT NULL REFERENCES public.live_class_events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 300),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS live_class_polls_event_idx ON public.live_class_polls (live_class_event_id, created_at DESC);
-- A class has at most one poll open at a time.
CREATE UNIQUE INDEX IF NOT EXISTS live_class_polls_one_open_idx ON public.live_class_polls (live_class_event_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS live_class_polls_created_by_idx ON public.live_class_polls (created_by);

CREATE TABLE IF NOT EXISTS public.live_class_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.live_class_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_class_poll_votes_user_idx ON public.live_class_poll_votes (user_id);

ALTER TABLE public.live_class_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_class_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_class_polls, public.live_class_poll_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_class_polls, public.live_class_poll_votes TO service_role;

-- Records an answer only while the poll is still open, in one statement, so an
-- answer cannot slip in after the teacher ends the poll. Returns whether it counted.
CREATE OR REPLACE FUNCTION public.cast_live_class_poll_vote(p_poll_id uuid, p_user_id uuid, p_option integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_options integer;
BEGIN
  SELECT jsonb_array_length(options) INTO v_options
  FROM public.live_class_polls
  WHERE id = p_poll_id AND status = 'open'
  FOR SHARE;
  IF v_options IS NULL OR p_option < 0 OR p_option >= v_options THEN
    RETURN false;
  END IF;
  INSERT INTO public.live_class_poll_votes (poll_id, user_id, option_index)
  VALUES (p_poll_id, p_user_id, p_option)
  ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index, created_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cast_live_class_poll_vote(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_live_class_poll_vote(uuid, uuid, integer) TO service_role;
