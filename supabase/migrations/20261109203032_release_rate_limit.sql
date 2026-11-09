-- Gives one use back on a rate-limit counter. The app calls it when an AI
-- request fails, so a failed call does not use up a student's daily allowance.
CREATE OR REPLACE FUNCTION public.release_rate_limit(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.rate_limit_counters
  SET count = GREATEST(count - 1, 0)
  WHERE key = p_key;
$$;

REVOKE EXECUTE ON FUNCTION public.release_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rate_limit(text) TO service_role;
