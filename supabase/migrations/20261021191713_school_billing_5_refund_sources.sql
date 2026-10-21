ALTER TABLE public.organization_credit_transactions
  ADD COLUMN IF NOT EXISTS from_trial integer NOT NULL DEFAULT 0 CHECK (from_trial >= 0),
  ADD COLUMN IF NOT EXISTS refunded_credits integer NOT NULL DEFAULT 0 CHECK (refunded_credits >= 0);

UPDATE public.organization_credit_transactions u
SET from_trial = -u.credits
WHERE u.transaction_type = 'usage'
  AND u.credits < 0
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_credit_transactions p
    WHERE p.organization_id = u.organization_id
      AND p.transaction_type = 'purchase'
      AND p.created_at <= u.created_at
  );

CREATE INDEX IF NOT EXISTS organization_credit_transactions_reference_idx
  ON public.organization_credit_transactions (organization_id, reference_id)
  WHERE reference_id IS NOT NULL;