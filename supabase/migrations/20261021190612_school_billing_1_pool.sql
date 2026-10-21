-- School billing, part 1: the school credit pool.
--
-- A school pays for its members' live AI time from one pool on the
-- organizations row:
--   credits        purchased credits; they do not expire
--   trial_credits  the starter grant (300 for 30 days); spent first, and
--                  dropped once trial_expires_at passes
-- 1 credit = 1 minute of live AI. Every change is written to
-- organization_credit_transactions in the same transaction.
--
-- Written without DROP statements: the Supabase MCP hangs on them.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_trial_credits_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_trial_credits_check CHECK (trial_credits >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.organization_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Who used or bought the credits, when known.
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('trial', 'purchase', 'usage', 'refund', 'expiry', 'adjustment')),
  usage_kind text CHECK (usage_kind IS NULL OR usage_kind IN ('voice', 'live_class', 'visual', 'image')),
  credits integer NOT NULL,
  balance_after integer NOT NULL,
  description text NOT NULL,
  session_id uuid REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  reference_id text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_credit_transactions_org_idx
  ON public.organization_credit_transactions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_credit_transactions_user_idx
  ON public.organization_credit_transactions (organization_id, user_id, created_at DESC);
-- A Stripe payment can only ever be credited once.
CREATE UNIQUE INDEX IF NOT EXISTS organization_credit_transactions_payment_uidx
  ON public.organization_credit_transactions (stripe_payment_intent_id)
  WHERE transaction_type = 'purchase' AND stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.organization_credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_credit_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_credit_transactions TO authenticated;
GRANT ALL ON public.organization_credit_transactions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_credit_transactions'
      AND policyname = 'organization_credit_transactions_select_manager'
  ) THEN
    CREATE POLICY organization_credit_transactions_select_manager
      ON public.organization_credit_transactions
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = organization_credit_transactions.organization_id
          AND m.user_id = auth.uid()
          AND m.is_active
          AND m.role IN ('owner', 'admin')
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- School credit columns change only through the billing functions below
-- (which run as the table owner) or the service role. Before this, a school
-- owner could set organizations.credits through the API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_school_credit_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (OLD.type = 'school' OR NEW.type = 'school')
     AND (
       NEW.credits IS DISTINCT FROM OLD.credits
       OR NEW.trial_credits IS DISTINCT FROM OLD.trial_credits
       OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
       OR NEW.total_credits_purchased IS DISTINCT FROM OLD.total_credits_purchased
       OR NEW.total_credits_used IS DISTINCT FROM OLD.total_credits_used
     ) THEN
    RAISE EXCEPTION 'School credits can only change through billing' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER organizations_guard_school_credits
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_school_credit_columns();

-- ---------------------------------------------------------------------------
-- Locks the school row, drops trial credits whose time is up, and returns the
-- credits available (paid + live trial). NULL when the school does not exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_school_trial_credits(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid integer;
  v_trial integer;
  v_expires timestamptz;
BEGIN
  SELECT COALESCE(o.credits, 0), o.trial_credits, o.trial_expires_at
  INTO v_paid, v_trial, v_expires
  FROM public.organizations o
  WHERE o.id = p_organization_id AND o.type = 'school'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_trial > 0 AND v_expires IS NOT NULL AND v_expires <= now() THEN
    UPDATE public.organizations SET trial_credits = 0 WHERE id = p_organization_id;
    INSERT INTO public.organization_credit_transactions
      (organization_id, transaction_type, credits, balance_after, description)
    VALUES (p_organization_id, 'expiry', -v_trial, v_paid, 'Trial credits expired');
    RETURN v_paid;
  END IF;

  RETURN v_paid + v_trial;
END;
$$;

-- ---------------------------------------------------------------------------
-- Spends credits from a school's pool, trial credits first. Returns the new
-- balance, or NULL when the school is missing or cannot cover the amount.
-- ---------------------------------------------------------------------------
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
    (organization_id, user_id, transaction_type, usage_kind, credits, balance_after, description, session_id, reference_id)
  VALUES
    (p_organization_id, p_user_id, 'usage', p_usage_kind, -p_amount, v_total, p_description, p_session_id, p_reference_id);

  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Adds credits to a school's pool: 'purchase' (Stripe), 'refund' (a charge
-- that bought nothing) or 'adjustment' (platform admin). Returns the new
-- balance, or NULL when the school does not exist. A refund goes back to the
-- trial while the trial is running, otherwise to purchased credits.
-- ---------------------------------------------------------------------------
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
  v_to_trial boolean := false;
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

  IF p_type = 'refund' THEN
    SELECT o.trial_expires_at IS NOT NULL AND o.trial_expires_at > now()
    INTO v_to_trial
    FROM public.organizations o WHERE o.id = p_organization_id;
  END IF;

  UPDATE public.organizations
  SET trial_credits = trial_credits + CASE WHEN v_to_trial THEN p_amount ELSE 0 END,
      credits = COALESCE(credits, 0) + CASE WHEN v_to_trial THEN 0 ELSE p_amount END,
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
     stripe_payment_intent_id, reference_id)
  VALUES
    (p_organization_id, p_user_id, p_type, p_usage_kind, p_amount, v_total, p_description,
     p_payment_intent_id, p_reference_id);

  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- The starter grant: once per school, 300 credits that last 30 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_school_trial(
  p_organization_id uuid,
  p_credits integer DEFAULT 300,
  p_days integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid integer;
BEGIN
  SELECT COALESCE(o.credits, 0) INTO v_paid
  FROM public.organizations o
  WHERE o.id = p_organization_id AND o.type = 'school'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_credit_transactions t
    WHERE t.organization_id = p_organization_id AND t.transaction_type = 'trial'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.organizations
  SET trial_credits = p_credits,
      trial_expires_at = now() + make_interval(days => p_days)
  WHERE id = p_organization_id;

  INSERT INTO public.organization_credit_transactions
    (organization_id, transaction_type, credits, balance_after, description)
  VALUES
    (p_organization_id, 'trial', p_credits, v_paid + p_credits,
     'Free trial: ' || p_credits || ' credits for ' || p_days || ' days');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_trial_to_new_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'school' THEN
    PERFORM public.grant_school_trial(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER organizations_grant_school_trial
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.grant_trial_to_new_school();

REVOKE ALL ON FUNCTION public.expire_school_trial_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_school_credits(uuid, uuid, integer, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_school_credits(uuid, integer, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_school_trial(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_trial_to_new_school() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_school_trial_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_school_credits(uuid, uuid, integer, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_school_credits(uuid, integer, text, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_school_trial(uuid, integer, integer) TO service_role;

-- Schools that already exist start their trial now.
SELECT public.grant_school_trial(o.id) FROM public.organizations o WHERE o.type = 'school';
