import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const key = '00000000-0000-4000-8000-0000000000e1';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.embed_api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text,
        rate_limit_per_hour integer DEFAULT 100,
        rate_limit_per_day integer DEFAULT 1000
    );
    GRANT ALL ON public.embed_api_keys TO authenticated, service_role;
    INSERT INTO public.embed_api_keys (id, name) VALUES ('${key}', 'site');
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110184646_guard_api_key_limits.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

const as = async (role, sql) => {
    await db.exec(`SET ROLE ${role}`);
    try { await db.exec(sql); } finally { await db.exec('RESET ROLE'); }
};
const limits = async () => (await db.query(`SELECT rate_limit_per_hour AS h, rate_limit_per_day AS d FROM public.embed_api_keys WHERE id = '${key}'`)).rows[0];

test('an owner can move limits within the ceilings', async () => {
    await as('authenticated', `UPDATE public.embed_api_keys SET rate_limit_per_hour = 1000, rate_limit_per_day = 10000 WHERE id = '${key}'`);
    assert.deepEqual(await limits(), { h: 1000, d: 10000 });
    await as('authenticated', `UPDATE public.embed_api_keys SET rate_limit_per_hour = 5 WHERE id = '${key}'`);
    assert.equal((await limits()).h, 5);
});

test('an owner cannot go past the ceilings or switch a limit off', async () => {
    for (const change of ['rate_limit_per_hour = 1001', 'rate_limit_per_day = 10001', 'rate_limit_per_hour = 0', 'rate_limit_per_day = -5', 'rate_limit_per_hour = NULL', 'rate_limit_per_day = NULL']) {
        await assert.rejects(as('authenticated', `UPDATE public.embed_api_keys SET ${change} WHERE id = '${key}'`), /limit/, change);
    }
    assert.deepEqual(await limits(), { h: 5, d: 10000 });
});

test('an owner cannot create a key that starts outside the rules', async () => {
    await assert.rejects(as('authenticated', `INSERT INTO public.embed_api_keys (name, rate_limit_per_hour) VALUES ('big', 999999)`), /platform staff/);
    await assert.rejects(as('authenticated', `INSERT INTO public.embed_api_keys (name, rate_limit_per_day) VALUES ('off', NULL)`), /at least 1/);
    await as('authenticated', `INSERT INTO public.embed_api_keys (name) VALUES ('defaults')`);
});

test('other changes to a key are untouched', async () => {
    await as('authenticated', `UPDATE public.embed_api_keys SET name = 'renamed' WHERE id = '${key}'`);
});

test('the server can set a higher limit, but not switch one off', async () => {
    await as('service_role', `UPDATE public.embed_api_keys SET rate_limit_per_hour = 50000, rate_limit_per_day = 500000 WHERE id = '${key}'`);
    assert.deepEqual(await limits(), { h: 50000, d: 500000 });
    await assert.rejects(as('service_role', `UPDATE public.embed_api_keys SET rate_limit_per_hour = 0 WHERE id = '${key}'`), /at least 1/);
    // The owner can still rename a key that staff raised, and can bring its limit back down.
    await as('authenticated', `UPDATE public.embed_api_keys SET name = 'still mine' WHERE id = '${key}'`);
    await as('authenticated', `UPDATE public.embed_api_keys SET rate_limit_per_hour = 200 WHERE id = '${key}'`);
    assert.deepEqual(await limits(), { h: 200, d: 500000 });
    await assert.rejects(as('authenticated', `UPDATE public.embed_api_keys SET rate_limit_per_day = 600000 WHERE id = '${key}'`), /platform staff/);
});
