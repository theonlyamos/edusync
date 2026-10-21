-- School billing, part 3: live classes are charged per minute.
--
-- Before this, opening a live class room charged its organizer 1 credit once,
-- however long the AI co-teacher ran. Now each room session is paid one minute
-- ahead: the first join pays the first minute, and the co-teacher agent (and
-- every later join) asks for the next minute shortly before the paid one ends.
-- A class run by a school is paid from the school pool; anything else from the
-- organizer's own credits.

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.live_class_billing (
  session_id uuid PRIMARY KEY REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  live_class_event_id uuid REFERENCES public.live_class_events(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid_until timestamptz NOT NULL,
  minutes_charged integer NOT NULL DEFAULT 0 CHECK (minutes_charged >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_class_billing_org_idx
  ON public.live_class_billing (organization_id, created_at DESC);

ALTER TABLE public.live_class_billing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_class_billing FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.live_class_billing TO service_role;

-- Pays the next minute of a live class room session when the paid time is
-- about to run out. status: 'charged', 'prepaid' (nothing due yet),
-- 'insufficient_credits' or 'not_found'. payer: 'school' or 'personal'.
CREATE OR REPLACE FUNCTION public.bill_live_class_minute(
  p_session_id uuid,
  p_lead_seconds integer DEFAULT 30
)
RETURNS TABLE (
  status text,
  minutes_charged integer,
  remaining_credits integer,
  paid_until timestamptz,
  payer text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_row public.live_class_billing%ROWTYPE;
  v_event uuid;
  v_organizer uuid;
  v_event_org uuid;
  v_school uuid;
  v_remaining integer;
  v_payer text;
BEGIN
  IF p_lead_seconds IS NULL OR p_lead_seconds < 0 OR p_lead_seconds > 120 THEN
    RAISE EXCEPTION 'bill_live_class_minute: invalid lead time';
  END IF;

  SELECT b.* INTO v_row FROM public.live_class_billing b WHERE b.session_id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    SELECT s.live_class_event_id INTO v_event
    FROM public.learning_sessions s
    WHERE s.id = p_session_id;
    IF v_event IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, 0, 0, NULL::timestamptz, NULL::text;
      RETURN;
    END IF;
    SELECT e.organizer_id, e.organization_id INTO v_organizer, v_event_org
    FROM public.live_class_events e
    WHERE e.id = v_event;
    IF v_organizer IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, 0, 0, NULL::timestamptz, NULL::text;
      RETURN;
    END IF;
    SELECT o.id INTO v_school FROM public.organizations o WHERE o.id = v_event_org AND o.type = 'school';

    INSERT INTO public.live_class_billing (session_id, live_class_event_id, organization_id, payer_user_id, paid_until)
    VALUES (p_session_id, v_event, v_school, v_organizer, now())
    ON CONFLICT (session_id) DO NOTHING;
    SELECT b.* INTO v_row FROM public.live_class_billing b WHERE b.session_id = p_session_id FOR UPDATE;
  END IF;

  v_payer := CASE WHEN v_row.organization_id IS NOT NULL THEN 'school' ELSE 'personal' END;

  IF v_row.paid_until > now() + make_interval(secs => p_lead_seconds) THEN
    IF v_row.organization_id IS NOT NULL THEN
      v_remaining := public.expire_school_trial_credits(v_row.organization_id);
    ELSE
      SELECT COALESCE(u.credits, 0) INTO v_remaining FROM public.users u WHERE u.id = v_row.payer_user_id;
    END IF;
    RETURN QUERY SELECT 'prepaid'::text, 0, COALESCE(v_remaining, 0), v_row.paid_until, v_payer;
    RETURN;
  END IF;

  IF v_row.organization_id IS NOT NULL THEN
    v_remaining := public.deduct_school_credits(
      v_row.organization_id, v_row.payer_user_id, 1, 'live_class',
      'Used 1 credit for 1 minute of live class', p_session_id, NULL
    );
    IF v_remaining IS NULL THEN
      v_remaining := COALESCE(public.expire_school_trial_credits(v_row.organization_id), 0);
      RETURN QUERY SELECT 'insufficient_credits'::text, 0, v_remaining, v_row.paid_until, v_payer;
      RETURN;
    END IF;
  ELSE
    v_remaining := public.deduct_user_credits(
      v_row.payer_user_id, 1, 'Used 1 credit for 1 minute of live class', p_session_id
    );
    IF v_remaining IS NULL THEN
      SELECT COALESCE(u.credits, 0) INTO v_remaining FROM public.users u WHERE u.id = v_row.payer_user_id;
      RETURN QUERY SELECT 'insufficient_credits'::text, 0, COALESCE(v_remaining, 0), v_row.paid_until, v_payer;
      RETURN;
    END IF;
  END IF;

  UPDATE public.live_class_billing b
  SET paid_until = GREATEST(b.paid_until, now()) + interval '1 minute',
      minutes_charged = b.minutes_charged + 1,
      updated_at = now()
  WHERE b.session_id = p_session_id
  RETURNING b.* INTO v_row;

  RETURN QUERY SELECT 'charged'::text, 1, v_remaining, v_row.paid_until, v_payer;
END;
$$;

REVOKE ALL ON FUNCTION public.bill_live_class_minute(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bill_live_class_minute(uuid, integer) TO service_role;
