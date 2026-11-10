-- A key's owner can change their own key row from the browser, which let them
-- raise its request limits without bound or switch them off (zero or empty
-- means "no limit" to the server). The database now holds the line itself:
-- a limit can never be switched off, and only the server (platform staff)
-- can set one above the owner ceilings. Keep the numbers in step with
-- src/lib/api-key-limits.ts.
CREATE OR REPLACE FUNCTION public.guard_embed_api_key_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.rate_limit_per_hour IS NULL OR NEW.rate_limit_per_hour < 1
     OR NEW.rate_limit_per_day IS NULL OR NEW.rate_limit_per_day < 1 THEN
    RAISE EXCEPTION 'An API key must keep an hourly and a daily request limit of at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  -- A limit staff raised above the ceiling may stay as it is while the owner
  -- changes something else; the owner just cannot set such a value themselves.
  IF current_user IN ('authenticated', 'anon') AND (
       (NEW.rate_limit_per_hour > 1000 AND (TG_OP = 'INSERT' OR NEW.rate_limit_per_hour IS DISTINCT FROM OLD.rate_limit_per_hour))
    OR (NEW.rate_limit_per_day > 10000 AND (TG_OP = 'INSERT' OR NEW.rate_limit_per_day IS DISTINCT FROM OLD.rate_limit_per_day))
  ) THEN
    RAISE EXCEPTION 'API key request limits above 1000 an hour or 10000 a day are set by platform staff'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER guard_embed_api_key_limits
  BEFORE INSERT OR UPDATE OF rate_limit_per_hour, rate_limit_per_day ON public.embed_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.guard_embed_api_key_limits();
