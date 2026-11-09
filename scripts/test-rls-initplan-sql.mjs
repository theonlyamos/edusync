import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrations = path.join(root, 'supabase/migrations');
const db = new PGlite();

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;

    CREATE TABLE public.notes (id int PRIMARY KEY, owner uuid);
    ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.notes TO authenticated;
    CREATE POLICY notes_read ON public.notes FOR SELECT USING (owner = auth.uid());
    CREATE POLICY notes_add ON public.notes FOR INSERT
      WITH CHECK (owner = auth.uid() AND auth.role() = 'authenticated');
    CREATE POLICY notes_edit ON public.notes FOR UPDATE
      USING (owner = (select auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.notes n WHERE n.owner = auth.uid()));
    INSERT INTO public.notes VALUES (1, '${alice}'), (2, '${bob}');

    CREATE TABLE public.rate_limit_counters (key text PRIMARY KEY, window_start timestamptz, count integer);
    INSERT INTO public.rate_limit_counters VALUES ('daily:practice:a', now(), 2), ('daily:practice:b', now(), 0);
`);

const run = async (file) => db.exec(await readFile(path.join(migrations, file), 'utf8'));
const BARE = /(?<!select )auth\.(uid|role|jwt)\(\)/i;

test('every policy call to auth.* is wrapped in a subquery, and a second run changes nothing', async () => {
    await run('20261109203000_rls_auth_initplan.sql');
    const first = (await db.query('SELECT policyname, qual, with_check FROM pg_policies ORDER BY 1')).rows;
    for (const policy of first) {
        assert.ok(!BARE.test(policy.qual ?? ''), `${policy.policyname} USING still has a bare call`);
        assert.ok(!BARE.test(policy.with_check ?? ''), `${policy.policyname} CHECK still has a bare call`);
    }
    await run('20261109203000_rls_auth_initplan.sql');
    const second = (await db.query('SELECT policyname, qual, with_check FROM pg_policies ORDER BY 1')).rows;
    assert.deepEqual(second, first);
});

test('the rewritten policies still enforce the same rules', async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${alice}', false);`);
    assert.deepEqual((await db.query('SELECT id FROM public.notes')).rows, [{ id: 1 }]);
    await db.exec(`INSERT INTO public.notes VALUES (3, '${alice}')`);
    await assert.rejects(db.exec(`INSERT INTO public.notes VALUES (4, '${bob}')`));
    await db.exec('RESET ROLE');
});

test('release_rate_limit gives one use back and never goes below zero', async () => {
    await run('20261109203100_release_rate_limit.sql');
    await db.exec(`SELECT public.release_rate_limit('daily:practice:a'); SELECT public.release_rate_limit('daily:practice:b'); SELECT public.release_rate_limit('missing');`);
    const rows = (await db.query('SELECT key, count FROM public.rate_limit_counters ORDER BY key')).rows;
    assert.deepEqual(rows, [{ key: 'daily:practice:a', count: 1 }, { key: 'daily:practice:b', count: 0 }]);
    const { rows: [priv] } = await db.query(`SELECT has_function_privilege('authenticated', 'public.release_rate_limit(text)', 'execute') AS can`);
    assert.equal(priv.can, false);
});
