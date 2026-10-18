ALTER TABLE public.voice_session_grants
  ADD COLUMN IF NOT EXISTS pending_issuance_id UUID;

CREATE TABLE public.voice_token_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.voice_session_grants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_key_id UUID,
  minutes_charged INTEGER NOT NULL CHECK (minutes_charged > 0),
  previous_expires_at TIMESTAMPTZ NOT NULL,
  previous_minutes_charged INTEGER NOT NULL,
  previous_tokens_in_block INTEGER NOT NULL,
  previous_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX voice_token_issuances_pending_grant_idx
  ON public.voice_token_issuances (grant_id) WHERE status = 'pending';

ALTER TABLE public.voice_token_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_token_issuances FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.voice_token_issuances TO service_role;

CREATE OR REPLACE FUNCTION public.grant_voice_minutes_v2(
  p_user_id UUID,
  p_grant_id UUID,
  p_api_key_id UUID,
  p_session_id UUID,
  p_block_minutes INTEGER,
  p_renew_window_seconds INTEGER,
  p_max_tokens_per_block INTEGER
)
RETURNS TABLE (
  status TEXT,
  grant_id UUID,
  expires_at TIMESTAMPTZ,
  minutes_charged INTEGER,
  remaining_credits INTEGER,
  issuance_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_credits INTEGER;
  v_grant public.voice_session_grants%ROWTYPE;
  v_charge INTEGER;
  v_base TIMESTAMPTZ;
  v_new_expires TIMESTAMPTZ;
  v_previous_expires TIMESTAMPTZ;
  v_previous_minutes INTEGER := 0;
  v_previous_tokens INTEGER := 0;
  v_previous_session UUID;
  v_grant_id UUID;
  v_issuance_id UUID := gen_random_uuid();
BEGIN
  IF p_block_minutes IS NULL OR p_block_minutes < 1 OR p_block_minutes > 10
     OR p_renew_window_seconds IS NULL OR p_renew_window_seconds < 0 OR p_renew_window_seconds > 90 THEN
    RAISE EXCEPTION 'grant_voice_minutes_v2: invalid billing interval';
  END IF;

  SELECT u.credits INTO v_credits
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 0, 0, NULL::UUID;
    RETURN;
  END IF;
  v_credits := COALESCE(v_credits, 0);

  IF p_grant_id IS NOT NULL THEN
    SELECT g.* INTO v_grant
    FROM public.voice_session_grants g
    WHERE g.id = p_grant_id
      AND g.user_id = p_user_id
      AND g.api_key_id IS NOT DISTINCT FROM p_api_key_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 0, v_credits, NULL::UUID;
      RETURN;
    END IF;

    IF v_grant.pending_issuance_id IS NOT NULL THEN
      -- A request that minted its token but could not record the outcome
      -- leaves the issuance pending. Token creation times out well within two
      -- minutes, so an older pending issuance is treated as issued (the charge
      -- stands) and the grant can be renewed again.
      UPDATE public.voice_token_issuances i
      SET status = 'completed', finalized_at = NOW()
      WHERE i.id = v_grant.pending_issuance_id
        AND i.status = 'pending'
        AND i.created_at < NOW() - INTERVAL '2 minutes';
      IF NOT FOUND AND EXISTS (
        SELECT 1 FROM public.voice_token_issuances i
        WHERE i.id = v_grant.pending_issuance_id AND i.status = 'pending'
      ) THEN
        RETURN QUERY SELECT 'pending_issuance'::TEXT, v_grant.id, v_grant.expires_at, 0, v_credits, NULL::UUID;
        RETURN;
      END IF;
      UPDATE public.voice_session_grants g
      SET pending_issuance_id = NULL, updated_at = NOW()
      WHERE g.id = v_grant.id;
      v_grant.pending_issuance_id := NULL;
    END IF;

    IF v_grant.expires_at > NOW() + MAKE_INTERVAL(secs => p_renew_window_seconds) THEN
      RETURN QUERY SELECT 'active_grant'::TEXT, v_grant.id, v_grant.expires_at, 0, v_credits, NULL::UUID;
      RETURN;
    END IF;

    v_previous_expires := v_grant.expires_at;
    v_previous_minutes := v_grant.minutes_charged;
    v_previous_tokens := v_grant.tokens_in_block;
    v_previous_session := v_grant.session_id;
  ELSE
    v_previous_expires := NOW();
  END IF;

  IF v_credits < 1 THEN
    RETURN QUERY SELECT 'insufficient_credits'::TEXT, p_grant_id, v_grant.expires_at, 0, v_credits, NULL::UUID;
    RETURN;
  END IF;

  v_charge := LEAST(v_credits, p_block_minutes);
  v_base := GREATEST(v_previous_expires, NOW());
  v_new_expires := v_base + MAKE_INTERVAL(mins => v_charge);
  v_credits := public.deduct_user_credits(
    p_user_id,
    v_charge,
    'Used ' || v_charge || CASE WHEN v_charge = 1 THEN ' credit for 1 minute' ELSE ' credits for ' || v_charge || ' minutes' END || ' of AI voice session',
    COALESCE(v_previous_session, p_session_id)
  );
  IF v_credits IS NULL THEN
    RAISE EXCEPTION 'grant_voice_minutes_v2: credit deduction failed';
  END IF;

  IF p_grant_id IS NOT NULL THEN
    UPDATE public.voice_session_grants g
    SET expires_at = v_new_expires,
        minutes_charged = g.minutes_charged + v_charge,
        tokens_in_block = 1,
        session_id = COALESCE(g.session_id, p_session_id),
        pending_issuance_id = v_issuance_id,
        updated_at = NOW()
    WHERE g.id = p_grant_id
    RETURNING g.id INTO v_grant_id;
  ELSE
    INSERT INTO public.voice_session_grants (user_id, api_key_id, session_id, expires_at, minutes_charged, tokens_in_block, pending_issuance_id)
    VALUES (p_user_id, p_api_key_id, p_session_id, v_new_expires, v_charge, 1, v_issuance_id)
    RETURNING id INTO v_grant_id;
  END IF;

  INSERT INTO public.voice_token_issuances (
    id, grant_id, user_id, api_key_id, minutes_charged,
    previous_expires_at, previous_minutes_charged, previous_tokens_in_block, previous_session_id
  ) VALUES (
    v_issuance_id, v_grant_id, p_user_id, p_api_key_id, v_charge,
    v_previous_expires, v_previous_minutes, v_previous_tokens, v_previous_session
  );

  RETURN QUERY SELECT 'charged'::TEXT, v_grant_id, v_new_expires, v_charge, v_credits, v_issuance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_voice_token_issuance(
  p_user_id UUID,
  p_grant_id UUID,
  p_api_key_id UUID,
  p_issuance_id UUID,
  p_succeeded BOOLEAN
)
RETURNS TABLE (status TEXT, remaining_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_credits INTEGER;
  v_grant public.voice_session_grants%ROWTYPE;
  v_issuance public.voice_token_issuances%ROWTYPE;
BEGIN
  IF p_succeeded IS NULL THEN
    RAISE EXCEPTION 'finalize_voice_token_issuance: missing outcome';
  END IF;

  SELECT u.credits INTO v_credits
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 0;
    RETURN;
  END IF;
  v_credits := COALESCE(v_credits, 0);

  SELECT g.* INTO v_grant
  FROM public.voice_session_grants g
  WHERE g.id = p_grant_id
    AND g.user_id = p_user_id
    AND g.api_key_id IS NOT DISTINCT FROM p_api_key_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, v_credits;
    RETURN;
  END IF;

  SELECT i.* INTO v_issuance
  FROM public.voice_token_issuances i
  WHERE i.id = p_issuance_id
    AND i.grant_id = p_grant_id
    AND i.user_id = p_user_id
    AND i.api_key_id IS NOT DISTINCT FROM p_api_key_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, v_credits;
    RETURN;
  END IF;

  IF v_issuance.status <> 'pending' THEN
    RETURN QUERY SELECT v_issuance.status, v_credits;
    RETURN;
  END IF;

  IF v_grant.pending_issuance_id IS DISTINCT FROM p_issuance_id THEN
    RAISE EXCEPTION 'finalize_voice_token_issuance: pending issuance mismatch';
  END IF;

  IF p_succeeded THEN
    UPDATE public.voice_token_issuances i
    SET status = 'completed', finalized_at = NOW()
    WHERE i.id = p_issuance_id;
    UPDATE public.voice_session_grants g
    SET pending_issuance_id = NULL, updated_at = NOW()
    WHERE g.id = p_grant_id;
    RETURN QUERY SELECT 'completed'::TEXT, v_credits;
    RETURN;
  END IF;

  UPDATE public.voice_session_grants g
  SET expires_at = v_issuance.previous_expires_at,
      minutes_charged = v_issuance.previous_minutes_charged,
      tokens_in_block = v_issuance.previous_tokens_in_block,
      session_id = v_issuance.previous_session_id,
      pending_issuance_id = NULL,
      updated_at = NOW()
  WHERE g.id = p_grant_id;

  v_credits := public.add_user_credits(
    p_user_id,
    v_issuance.minutes_charged,
    'Refund: voice session token could not be created',
    'refund',
    NULL
  );
  IF v_credits IS NULL THEN
    RAISE EXCEPTION 'finalize_voice_token_issuance: refund failed';
  END IF;
  UPDATE public.users u
  SET total_credits_used = GREATEST(0, COALESCE(u.total_credits_used, 0) - v_issuance.minutes_charged)
  WHERE u.id = p_user_id;

  UPDATE public.voice_token_issuances i
  SET status = 'refunded', finalized_at = NOW()
  WHERE i.id = p_issuance_id;

  RETURN QUERY SELECT 'refunded'::TEXT, v_credits;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_voice_minutes(
  p_user_id UUID,
  p_grant_id UUID,
  p_api_key_id UUID,
  p_session_id UUID,
  p_block_minutes INTEGER,
  p_renew_window_seconds INTEGER,
  p_max_tokens_per_block INTEGER
)
RETURNS TABLE (status TEXT, grant_id UUID, expires_at TIMESTAMPTZ, minutes_charged INTEGER, remaining_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'grant_voice_minutes retired: upgrade route to token issuance protocol'
    USING ERRCODE = '55000';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_voice_minutes_v2(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_voice_minutes_v2(uuid, uuid, uuid, uuid, integer, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_voice_token_issuance(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_voice_token_issuance(uuid, uuid, uuid, uuid, boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.grant_voice_minutes(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_voice_minutes(uuid, uuid, uuid, uuid, integer, integer, integer) TO service_role;
