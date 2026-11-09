-- Index every foreign key that has no covering index (67 in production).
-- Without one, joins on the key and deletes of the referenced row scan the
-- whole table. Written as a loop so it also works on databases whose older
-- column names differ from production.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT DISTINCT
      cl.relname AS rel,
      (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
         FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
      (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
         FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS col_names
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
          AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
      )
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
      left('idx_' || fk.rel || '_' || fk.col_names, 63), fk.rel, fk.cols
    );
  END LOOP;
END $$;
