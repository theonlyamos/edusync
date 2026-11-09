-- Row-security policies that call auth.uid(), auth.role() or auth.jwt()
-- directly run the call once per row. Wrapped as (select auth.uid()) Postgres
-- runs it once per query. This rewrites every policy in public that still has
-- a bare call; the rules themselves do not change.
DO $$
DECLARE
  p record;
  bare constant text := '(?<!select )auth\.(uid|role|jwt)\(\)';
  new_using text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~* bare OR coalesce(with_check, '') ~* bare)
  LOOP
    new_using := regexp_replace(p.qual, bare, '(select auth.\1())', 'gi');
    new_check := regexp_replace(p.with_check, bare, '(select auth.\1())', 'gi');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF new_using IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_using);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
