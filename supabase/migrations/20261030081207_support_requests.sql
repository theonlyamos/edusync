-- Help & feedback: requests people send to the InsyteAI team (problems,
-- feature ideas, complaints, billing and account questions) and the replies
-- on each one. Only the server (service role) reads and writes these tables;
-- the API checks that people only see their own requests.
CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- The person's school when they sent it, so support can see which school it's about.
  school_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  -- Which help page it came from ('help' or 'school'), so reply links open the right portal.
  portal text NOT NULL DEFAULT 'help' CHECK (portal IN ('help', 'school')),
  category text NOT NULL CHECK (category IN ('problem', 'feature', 'complaint', 'billing', 'account', 'other')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 150),
  -- The page they were on when they opened Help & feedback.
  page_path text CHECK (char_length(page_path) <= 300),
  user_agent text CHECK (char_length(user_agent) <= 400),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  -- Support hasn't read the latest message from the person.
  staff_unread boolean NOT NULL DEFAULT true,
  -- The person hasn't read the latest reply from support.
  user_unread boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_requests_user_idx ON public.support_requests (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_status_idx ON public.support_requests (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_staff_unread_idx ON public.support_requests (last_message_at DESC) WHERE staff_unread;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  from_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_request_idx ON public.support_messages (request_id, created_at);
-- Daily sending limits count a person's own messages.
CREATE INDEX IF NOT EXISTS support_messages_author_idx ON public.support_messages (author_id, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_requests FROM anon, authenticated;
REVOKE ALL ON public.support_messages FROM anon, authenticated;
GRANT ALL ON public.support_requests TO service_role;
GRANT ALL ON public.support_messages TO service_role;
