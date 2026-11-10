-- Daily totals for one embed API key: requests made and tutor sessions started.
-- The server calls it after checking that the caller can see the key.
CREATE OR REPLACE FUNCTION public.embed_key_daily_usage(p_key_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (day date, requests bigint, sessions bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH span AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'UTC')::date - (LEAST(GREATEST(p_days, 1), 90) - 1),
      (now() AT TIME ZONE 'UTC')::date,
      interval '1 day'
    )::date AS day
  ),
  hits AS (
    SELECT (u.created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
    FROM public.embed_api_key_usage u
    WHERE u.api_key_id = p_key_id
      AND u.created_at >= ((now() AT TIME ZONE 'UTC')::date - (LEAST(GREATEST(p_days, 1), 90) - 1))::timestamp AT TIME ZONE 'UTC'
    GROUP BY 1
  ),
  started AS (
    SELECT (s.created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
    FROM public.learning_sessions s
    WHERE s.api_key_id = p_key_id
      AND s.created_at >= ((now() AT TIME ZONE 'UTC')::date - (LEAST(GREATEST(p_days, 1), 90) - 1))::timestamp AT TIME ZONE 'UTC'
    GROUP BY 1
  )
  SELECT span.day, COALESCE(hits.n, 0), COALESCE(started.n, 0)
  FROM span
  LEFT JOIN hits ON hits.day = span.day
  LEFT JOIN started ON started.day = span.day
  ORDER BY span.day;
$$;
REVOKE ALL ON FUNCTION public.embed_key_daily_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embed_key_daily_usage(uuid, integer) TO service_role;
