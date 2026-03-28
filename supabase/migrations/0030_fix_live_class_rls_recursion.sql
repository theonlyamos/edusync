-- Break circular RLS between live_class_events and live_class_enrollments (42P17 infinite recursion).
-- Policies that used EXISTS across both tables re-entered each other's RLS. Helpers run as SECURITY DEFINER
-- so membership/organizer checks do not recurse.

CREATE OR REPLACE FUNCTION public.live_class_auth_user_enrolled_in_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.live_class_enrollments e
    WHERE e.live_class_event_id = p_event_id
      AND e.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.live_class_auth_user_is_organizer_of_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.live_class_events ev
    WHERE ev.id = p_event_id
      AND ev.organizer_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.live_class_auth_user_enrolled_in_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_class_auth_user_is_organizer_of_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_class_auth_user_enrolled_in_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_class_auth_user_enrolled_in_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.live_class_auth_user_is_organizer_of_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_class_auth_user_is_organizer_of_event(uuid) TO service_role;

-- live_class_events
DROP POLICY IF EXISTS "live_class_events_select_organizer_or_enrolled" ON public.live_class_events;
CREATE POLICY "live_class_events_select_organizer_or_enrolled"
  ON public.live_class_events FOR SELECT TO authenticated
  USING (
    organizer_id = (SELECT auth.uid())
    OR public.live_class_auth_user_enrolled_in_event(id)
  );

-- live_class_enrollments
DROP POLICY IF EXISTS "live_class_enrollments_select_self_or_organizer" ON public.live_class_enrollments;
CREATE POLICY "live_class_enrollments_select_self_or_organizer"
  ON public.live_class_enrollments FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.live_class_auth_user_is_organizer_of_event(live_class_event_id)
  );

DROP POLICY IF EXISTS "live_class_enrollments_insert_organizer" ON public.live_class_enrollments;
CREATE POLICY "live_class_enrollments_insert_organizer"
  ON public.live_class_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    public.live_class_auth_user_is_organizer_of_event(live_class_event_id)
  );

DROP POLICY IF EXISTS "live_class_enrollments_update_self_or_organizer" ON public.live_class_enrollments;
CREATE POLICY "live_class_enrollments_update_self_or_organizer"
  ON public.live_class_enrollments FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.live_class_auth_user_is_organizer_of_event(live_class_event_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.live_class_auth_user_is_organizer_of_event(live_class_event_id)
  );

DROP POLICY IF EXISTS "live_class_enrollments_delete_organizer" ON public.live_class_enrollments;
CREATE POLICY "live_class_enrollments_delete_organizer"
  ON public.live_class_enrollments FOR DELETE TO authenticated
  USING (
    public.live_class_auth_user_is_organizer_of_event(live_class_event_id)
  );
