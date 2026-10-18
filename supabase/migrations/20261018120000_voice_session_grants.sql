-- Server-side billing for the Gemini Live voice tutor.
--
-- Before: the browser called /api/credits/deduct-minute once a minute. A client
-- that blocked that call (or kept talking with 0 credits) used Gemini for free,
-- because the ephemeral token route never looked at credits.
--
-- Now every Gemini Live token is backed by a prepaid "voice grant":
-- * A new grant charges a block of minutes up front and the token stops working
--   (Gemini expireTime) when the paid block ends.
-- * Reconnecting inside a paid block (session resumption after a drop) reuses the
--   grant without charging again, capped per block so a grant cannot be fanned
--   out into many parallel sessions.
-- * Near the end of a block the client asks for a renewal; that charges the next
--   block and extends the same grant from its current end, so no paid time is lost.
-- Charging and the ledger row happen in one transaction with the users row locked.

CREATE TABLE IF NOT EXISTS public.voice_session_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_key_id UUID,
  session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  minutes_charged INTEGER NOT NULL DEFAULT 0,
  tokens_in_block INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS voice_session_grants_user_idx
  ON public.voice_session_grants (user_id, created_at DESC);

ALTER TABLE public.voice_session_grants ENABLE ROW LEVEL SECURITY;
-- No policies: service-role access only.

-- Returns one row:
--   status            'charged' | 'resumed' | 'insufficient_credits' | 'not_found' | 'too_many_reconnects'
--   grant_id          the grant to pass back on reconnect/renewal
--   expires_at        when the token for this grant must stop working
--   minutes_charged   minutes charged by this call (0 for a resume)
--   remaining_credits balance after this call
CREATE OR REPLACE FUNCTION public.grant_voice_minutes(
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
  remaining_credits INTEGER
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
  v_grant_id UUID;
BEGIN
  IF p_block_minutes IS NULL OR p_block_minutes <= 0 THEN
    RAISE EXCEPTION 'grant_voice_minutes: block must be positive, got %', p_block_minutes;
  END IF;

  -- Lock the balance first so concurrent grants for one user are serialized.
  SELECT u.credits INTO v_credits
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 0, 0;
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
      RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 0, v_credits;
      RETURN;
    END IF;

    -- Plenty of paid time left: this is a reconnect, not a renewal.
    IF v_grant.expires_at > NOW() + MAKE_INTERVAL(secs => p_renew_window_seconds) THEN
      IF v_grant.tokens_in_block >= p_max_tokens_per_block THEN
        RETURN QUERY SELECT 'too_many_reconnects'::TEXT, v_grant.id, v_grant.expires_at, 0, v_credits;
        RETURN;
      END IF;

      UPDATE public.voice_session_grants g
      SET tokens_in_block = g.tokens_in_block + 1,
          session_id = COALESCE(g.session_id, p_session_id),
          updated_at = NOW()
      WHERE g.id = v_grant.id;

      RETURN QUERY SELECT 'resumed'::TEXT, v_grant.id, v_grant.expires_at, 0, v_credits;
      RETURN;
    END IF;
  END IF;

  IF v_credits < 1 THEN
    RETURN QUERY SELECT 'insufficient_credits'::TEXT, p_grant_id, NULL::TIMESTAMPTZ, 0, v_credits;
    RETURN;
  END IF;

  v_charge := LEAST(v_credits, p_block_minutes);

  -- Renewals continue from the end of the paid block so no paid time is lost.
  IF p_grant_id IS NOT NULL AND v_grant.expires_at > NOW() THEN
    v_base := v_grant.expires_at;
  ELSE
    v_base := NOW();
  END IF;
  v_new_expires := v_base + MAKE_INTERVAL(mins => v_charge);

  UPDATE public.users
  SET credits = credits - v_charge,
      total_credits_used = COALESCE(total_credits_used, 0) + v_charge
  WHERE id = p_user_id
  RETURNING credits INTO v_credits;

  IF p_grant_id IS NOT NULL THEN
    UPDATE public.voice_session_grants g
    SET expires_at = v_new_expires,
        minutes_charged = g.minutes_charged + v_charge,
        tokens_in_block = 1,
        session_id = COALESCE(g.session_id, p_session_id),
        updated_at = NOW()
    WHERE g.id = p_grant_id
    RETURNING g.id, g.session_id INTO v_grant_id, v_grant.session_id;
  ELSE
    INSERT INTO public.voice_session_grants (user_id, api_key_id, session_id, expires_at, minutes_charged, tokens_in_block)
    VALUES (p_user_id, p_api_key_id, p_session_id, v_new_expires, v_charge, 1)
    RETURNING id, session_id INTO v_grant_id, v_grant.session_id;
  END IF;

  INSERT INTO public.credit_transactions (user_id, transaction_type, credits, description, session_id)
  VALUES (
    p_user_id,
    'usage',
    -v_charge,
    'Used ' || v_charge || ' credit' || CASE WHEN v_charge = 1 THEN '' ELSE 's' END || ' for ' || v_charge || ' minute' || CASE WHEN v_charge = 1 THEN '' ELSE 's' END || ' of AI voice session',
    v_grant.session_id
  );

  RETURN QUERY SELECT 'charged'::TEXT, v_grant_id, v_new_expires, v_charge, v_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_voice_minutes(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_voice_minutes(uuid, uuid, uuid, uuid, integer, integer, integer) TO service_role;
