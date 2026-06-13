-- Embed API key usage log + atomic usage counters.
-- Enables enforcement of rate_limit_per_hour / rate_limit_per_day on embed_api_keys
-- (previously stored but never enforced) and replaces the non-functional
-- rpc('increment', ...) calls in src/lib/api-key-auth.ts.

CREATE TABLE IF NOT EXISTS public.embed_api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.embed_api_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS embed_api_key_usage_key_time_idx
  ON public.embed_api_key_usage(api_key_id, created_at DESC);

-- Service-role only: RLS enabled with no policies.
ALTER TABLE public.embed_api_key_usage ENABLE ROW LEVEL SECURITY;

-- Records one request: appends to the usage log and bumps the aggregate counters.
CREATE OR REPLACE FUNCTION public.record_api_key_usage(p_api_key_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.embed_api_key_usage (api_key_id) VALUES (p_api_key_id);
  UPDATE public.embed_api_keys
  SET total_requests = COALESCE(total_requests, 0) + 1,
      last_used_at = NOW()
  WHERE id = p_api_key_id;
$$;

-- Atomic increment of minutes used (was previously written with a broken rpc-in-update).
CREATE OR REPLACE FUNCTION public.increment_api_key_minutes(p_api_key_id UUID, p_minutes INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.embed_api_keys
  SET total_minutes_used = COALESCE(total_minutes_used, 0) + p_minutes
  WHERE id = p_api_key_id;
$$;

COMMENT ON TABLE public.embed_api_key_usage IS 'Per-request log for embed API keys; used to enforce hourly/daily rate limits.';
