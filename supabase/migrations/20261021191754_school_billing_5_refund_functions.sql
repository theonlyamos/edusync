CREATE OR REPLACE FUNCTION public.deduct_school_credits(
  p_organization_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_usage_kind text,
  p_description text,
  p_session_id uuid DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_trial integer;
  v_from_trial integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'deduct_school_credits: amount must be positive, got %', p_amount;
  END IF;

  v_total := public.expire_school_trial_credits(p_organization_id);
  IF v_total IS NULL OR v_total < p_amount THEN
    RETURN NULL;
  END IF;

  SELECT o.trial_credits INTO v_trial FROM public.organizations o WHERE o.id = p_organization_id;
  v_from_trial := LEAST(v_trial, p_amount);

  UPDATE public.organizations
  SET trial_credits = trial_credits - v_from_trial,
      credits = COALESCE(credits, 0) - (p_amount - v_from_trial),
      total_credits_used = COALESCE(total_credits_used, 0) + p_amount
  WHERE id = p_organization_id;

  v_total := v_total - p_amount;
  INSERT INTO public.organization_credit_transactions
    (organization_id, user_id, transaction_type, usage_kind, credits, balance_after, description,
     session_id, reference_id, from_trial)
  VALUES
    (p_organization_id, p_user_id, 'usage', p_usage_kind, -p_amount, v_total, p_description,
     p_session_id, p_reference_id, v_from_trial);

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_school_credits(
  p_organization_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_user_id uuid DEFAULT NULL,
  p_payment_intent_id text DEFAULT NULL,
  p_usage_kind text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_to_trial integer := 0;
  v_charge public.organization_credit_transactions%ROWTYPE;
  v_trial_left integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'add_school_credits: amount must be positive, got %', p_amount;
  END IF;
  IF p_type NOT IN ('purchase', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'add_school_credits: invalid type %', p_type;
  END IF;

  v_total := public.expire_school_trial_credits(p_organization_id);
  IF v_total IS NULL THEN
    RETURN NULL;
  END IF;

  -- A refund restores the trial share of the charge it undoes (trial share
  -- first, then purchased). A refund with no matching charge goes to
  -- purchased credits.
  IF p_type = 'refund' AND p_reference_id IS NOT NULL THEN
    SELECT * INTO v_charge
    FROM public.organization_credit_transactions t
    WHERE t.organization_id = p_organization_id
      AND t.transaction_type = 'usage'
      AND t.reference_id = p_reference_id
      AND t.refunded_credits < -t.credits
    ORDER BY t.created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF FOUND THEN
      v_trial_left := GREATEST(0, v_charge.from_trial - LEAST(v_charge.from_trial, v_charge.refunded_credits));
      v_to_trial := LEAST(p_amount, v_trial_left);
      UPDATE public.organization_credit_transactions
      SET refunded_credits = LEAST(-credits, refunded_credits + p_amount)
      WHERE id = v_charge.id;
    END IF;
  END IF;

  UPDATE public.organizations
  SET trial_credits = trial_credits + v_to_trial,
      credits = COALESCE(credits, 0) + (p_amount - v_to_trial),
      total_credits_purchased = COALESCE(total_credits_purchased, 0)
        + CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
      total_credits_used = CASE
        WHEN p_type = 'refund' THEN GREATEST(0, COALESCE(total_credits_used, 0) - p_amount)
        ELSE total_credits_used
      END
  WHERE id = p_organization_id;

  v_total := v_total + p_amount;
  INSERT INTO public.organization_credit_transactions
    (organization_id, user_id, transaction_type, usage_kind, credits, balance_after, description,
     stripe_payment_intent_id, reference_id, from_trial)
  VALUES
    (p_organization_id, p_user_id, p_type, p_usage_kind, p_amount, v_total, p_description,
     p_payment_intent_id, p_reference_id, v_to_trial);

  -- Trial credits given back after the trial ended expire at once.
  IF v_to_trial > 0 THEN
    v_total := public.expire_school_trial_credits(p_organization_id);
  END IF;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_school_credits(uuid, uuid, integer, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_school_credits(uuid, integer, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_school_credits(uuid, uuid, integer, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_school_credits(uuid, integer, text, text, uuid, text, text, text) TO service_role;