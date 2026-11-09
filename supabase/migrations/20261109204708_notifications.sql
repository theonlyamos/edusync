-- In-app notifications and school announcements. Only the server (service
-- role) reads and writes these tables; the API shows people their own rows.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Who it was sent to: everyone, teachers or students at the school,
  -- optionally narrowed to one grade or one class (students only).
  audience text NOT NULL CHECK (audience IN ('everyone', 'teachers', 'students')),
  grade_level text CHECK (char_length(grade_level) <= 40),
  class_id uuid REFERENCES public.school_classes(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_school_idx ON public.announcements (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_author_idx ON public.announcements (author_id);
CREATE INDEX IF NOT EXISTS announcements_class_idx ON public.announcements (class_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'announcement', 'homework_assigned', 'homework_submitted', 'homework_returned',
    'live_class_scheduled', 'low_credits'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text CHECK (char_length(body) <= 4000),
  -- Where tapping the notification goes; always a path inside the app.
  href text CHECK (href IS NULL OR (href LIKE '/%' AND href NOT LIKE '//%' AND char_length(href) <= 300)),
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_announcement_idx ON public.notifications (announcement_id);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements, public.notifications FROM anon, authenticated;
GRANT ALL ON public.announcements, public.notifications TO service_role;
