-- Atomic credit operations + durable webhook idempotency + distributed rate limiting.
--
-- Fixes three defects:
-- 1. Credit deduction/addition were read-check-write in app code (race: concurrent
--    requests could double-spend or overdraw). Now atomic in the database, with the
--    ledger row written in the same transaction so balance and ledger cannot desync.
-- 2. deductCreditsFromApiKey queried a `user_credits` table that never existed;
--    users.credits is the canonical balance for all flows (session + embed API key).
-- 3. Stripe event idempotency and strict rate limits lived in process memory, which
--    resets on every serverless cold start.

-- =========================================================================
-- Atomic credit deduction. Returns the new balance, or NULL when the user is
-- missing or has insufficient credits (caller treats NULL as "insufficient").
-- =========================================================================
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_session_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'deduct_user_credits: amount must be positive, got %', p_amount;
  END IF;

  UPDATE public.users
  SET credits = credits - p_amount,
      total_credits_used = COALESCE(total_credits_used, 0) + p_amount
  WHERE id = p_user_id
    AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.credit_transactions (user_id, transaction_type, credits, description, session_id)
  VALUES (p_user_id, 'usage', -p_amount, p_description, p_session_id);

  RETURN v_new_credits;
END;
$$;

-- =========================================================================
-- Atomic credit addition (purchase/bonus/refund). Returns the new balance,
-- or NULL when the user does not exist.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.add_user_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_type TEXT DEFAULT 'purchase',
  p_payment_intent_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'add_user_credits: amount must be positive, got %', p_amount;
  END IF;
  IF p_type NOT IN ('purchase', 'bonus', 'refund') THEN
    RAISE EXCEPTION 'add_user_credits: invalid type %', p_type;
  END IF;

  UPDATE public.users
  SET credits = COALESCE(credits, 0) + p_amount,
      total_credits_purchased = CASE
        WHEN p_type = 'purchase' THEN COALESCE(total_credits_purchased, 0) + p_amount
        ELSE total_credits_purchased
      END
  WHERE id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.credit_transactions (user_id, transaction_type, credits, description, stripe_payment_intent_id)
  VALUES (p_user_id, p_type, p_amount, p_description, p_payment_intent_id);

  RETURN v_new_credits;
END;
$$;

-- =========================================================================
-- Durable Stripe webhook idempotency (replaces in-memory Set).
-- Claiming an event = INSERT; a unique-violation means it was already handled.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service-role access only.

-- =========================================================================
-- Distributed fixed-window rate limiting for strict buckets (auth/upload/admin).
-- Returns TRUE when the request is allowed, FALSE when the limit is exceeded.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No policies: service-role access only.

CREATE OR REPLACE FUNCTION public.hit_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters AS rlc (key, window_start, count)
  VALUES (p_key, NOW(), 1)
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
        WHEN rlc.window_start < NOW() - MAKE_INTERVAL(secs => p_window_seconds) THEN 1
        ELSE rlc.count + 1
      END,
      window_start = CASE
        WHEN rlc.window_start < NOW() - MAKE_INTERVAL(secs => p_window_seconds) THEN NOW()
        ELSE rlc.window_start
      END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Opportunistic cleanup helper (call from a cron or ignore; table stays small).
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_counters()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_counters WHERE window_start < NOW() - INTERVAL '2 days';
$$;
