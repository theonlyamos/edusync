-- Scheduled live classes: events, enrollments, link to learning_sessions for shared viz/credits

CREATE TABLE IF NOT EXISTS public.live_class_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft', 'scheduled', 'live', 'ended', 'cancelled')),
  livekit_room_name text,
  max_attendees integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_class_events_organizer_idx
  ON public.live_class_events(organizer_id, scheduled_start_at DESC);

CREATE INDEX IF NOT EXISTS live_class_events_schedule_idx
  ON public.live_class_events(scheduled_start_at, scheduled_end_at);

CREATE TABLE IF NOT EXISTS public.live_class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_event_id uuid NOT NULL REFERENCES public.live_class_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'teacher', 'co_organizer')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  UNIQUE (live_class_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_class_enrollments_user_idx
  ON public.live_class_enrollments(user_id, live_class_event_id);

CREATE INDEX IF NOT EXISTS live_class_enrollments_event_idx
  ON public.live_class_enrollments(live_class_event_id);

ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS live_class_event_id uuid REFERENCES public.live_class_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS learning_sessions_live_class_event_idx
  ON public.learning_sessions(live_class_event_id)
  WHERE live_class_event_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_live_class_events ON public.live_class_events;
CREATE TRIGGER set_updated_at_live_class_events
  BEFORE UPDATE ON public.live_class_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.live_class_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_class_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_class_events_select_organizer_or_enrolled"
  ON public.live_class_events FOR SELECT TO authenticated
  USING (
    organizer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_class_enrollments e
      WHERE e.live_class_event_id = live_class_events.id
        AND e.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "live_class_events_insert_organizer"
  ON public.live_class_events FOR INSERT TO authenticated
  WITH CHECK (organizer_id = (SELECT auth.uid()));

CREATE POLICY "live_class_events_update_organizer"
  ON public.live_class_events FOR UPDATE TO authenticated
  USING (organizer_id = (SELECT auth.uid()))
  WITH CHECK (organizer_id = (SELECT auth.uid()));

CREATE POLICY "live_class_events_delete_organizer"
  ON public.live_class_events FOR DELETE TO authenticated
  USING (organizer_id = (SELECT auth.uid()));

CREATE POLICY "live_class_enrollments_select_self_or_organizer"
  ON public.live_class_enrollments FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_class_events ev
      WHERE ev.id = live_class_enrollments.live_class_event_id
        AND ev.organizer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "live_class_enrollments_insert_organizer"
  ON public.live_class_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_class_events ev
      WHERE ev.id = live_class_enrollments.live_class_event_id
        AND ev.organizer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "live_class_enrollments_update_self_or_organizer"
  ON public.live_class_enrollments FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_class_events ev
      WHERE ev.id = live_class_enrollments.live_class_event_id
        AND ev.organizer_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_class_events ev
      WHERE ev.id = live_class_enrollments.live_class_event_id
        AND ev.organizer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "live_class_enrollments_delete_organizer"
  ON public.live_class_enrollments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_class_events ev
      WHERE ev.id = live_class_enrollments.live_class_event_id
        AND ev.organizer_id = (SELECT auth.uid())
    )
  );

-- Allow enrolled users (and organizer) to read visualizations for the room session
CREATE POLICY "learning_visualizations_select_live_class"
  ON public.learning_visualizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_sessions ls
      WHERE ls.id = learning_visualizations.session_id
        AND ls.live_class_event_id IS NOT NULL
        AND (
          ls.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.live_class_events lce
            WHERE lce.id = ls.live_class_event_id
              AND lce.organizer_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.live_class_enrollments enr
            WHERE enr.live_class_event_id = ls.live_class_event_id
              AND enr.user_id = (SELECT auth.uid())
          )
        )
    )
  );

-- Realtime: replicate visualization rows to subscribed clients (enrolled users pass RLS)
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'learning_visualizations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_visualizations;
  END IF;
END
$pub$;
