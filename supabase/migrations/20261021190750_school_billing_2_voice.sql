-- School billing, part 2: the voice tutor draws from the school pool.
--
-- A signed-in member of a school (student, teacher or school admin) now pays
-- for voice tutor time from their school's credits. Before this, school
-- students were not billed at all. Embed API keys and people without a school
-- keep paying from their own users.credits, exactly as before.
--
-- The issuance records which pool paid, so a failed token refunds the same
-- pool even if the person changes school in between.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.voice_session_grants
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.voice_token_issuances
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

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
  v_school UUID;
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
  v_description TEXT;
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

  -- Who pays: the person's school when they sign in as a school member;
  -- the key owner for embed API keys; otherwise the person.
  IF p_api_key_id IS NULL THEN
    v_school := public.user_school_id(p_user_id);
  END IF;
  IF v_school IS NOT NULL THEN
    v_credits := COALESCE(public.expire_school_trial_credits(v_school), 0);
  END IF;

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
  v_description := 'Used ' || v_charge
    || CASE WHEN v_charge = 1 THEN ' credit for 1 minute' ELSE ' credits for ' || v_charge || ' minutes' END
    || ' of AI voice session';
  IF v_school IS NOT NULL THEN
    v_credits := public.deduct_school_credits(
      v_school, p_user_id, v_charge, 'voice', v_description,
      COALESCE(v_previous_session, p_session_id), v_issuance_id::text
    );
  ELSE
    v_credits := public.deduct_user_credits(
      p_user_id, v_charge, v_description, COALESCE(v_previous_session, p_session_id)
    );
  END IF;
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
        organization_id = v_school,
        updated_at = NOW()
    WHERE g.id = p_grant_id
    RETURNING g.id INTO v_grant_id;
  ELSE
    INSERT INTO public.voice_session_grants (user_id, api_key_id, session_id, expires_at, minutes_charged, tokens_in_block, pending_issuance_id, organization_id)
    VALUES (p_user_id, p_api_key_id, p_session_id, v_new_expires, v_charge, 1, v_issuance_id, v_school)
    RETURNING id INTO v_grant_id;
  END IF;

  INSERT INTO public.voice_token_issuances (
    id, grant_id, user_id, api_key_id, minutes_charged,
    previous_expires_at, previous_minutes_charged, previous_tokens_in_block, previous_session_id,
    organization_id
  ) VALUES (
    v_issuance_id, v_grant_id, p_user_id, p_api_key_id, v_charge,
    v_previous_expires, v_previous_minutes, v_previous_tokens, v_previous_session,
    v_school
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

  IF v_issuance.organization_id IS NOT NULL THEN
    v_credits := public.add_school_credits(
      v_issuance.organization_id,
      v_issuance.minutes_charged,
      'refund',
      'Refund: voice session token could not be created',
      p_user_id,
      NULL,
      'voice',
      p_issuance_id::text
    );
  ELSE
    v_credits := public.add_user_credits(
      p_user_id,
      v_issuance.minutes_charged,
      'Refund: voice session token could not be created',
      'refund',
      NULL
    );
    IF v_credits IS NOT NULL THEN
      UPDATE public.users u
      SET total_credits_used = GREATEST(0, COALESCE(u.total_credits_used, 0) - v_issuance.minutes_charged)
      WHERE u.id = p_user_id;
    END IF;
  END IF;
  IF v_credits IS NULL THEN
    RAISE EXCEPTION 'finalize_voice_token_issuance: refund failed';
  END IF;

  UPDATE public.voice_token_issuances i
  SET status = 'refunded', finalized_at = NOW()
  WHERE i.id = p_issuance_id;

  RETURN QUERY SELECT 'refunded'::TEXT, v_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_voice_minutes_v2(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_voice_minutes_v2(uuid, uuid, uuid, uuid, integer, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_voice_token_issuance(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_voice_token_issuance(uuid, uuid, uuid, uuid, boolean) TO service_role;
