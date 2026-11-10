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
const key = '00000000-0000-4000-8000-0000000000c1';
const other = '00000000-0000-4000-8000-0000000000c2';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.embed_api_key_usage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), api_key_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.learning_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), api_key_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.embed_api_key_usage (api_key_id, created_at) VALUES
        ('${key}', now()), ('${key}', now()), ('${key}', now() - interval '2 days'), ('${key}', now() - interval '200 days'), ('${other}', now());
    INSERT INTO public.learning_sessions (api_key_id, created_at) VALUES ('${key}', now()), ('${other}', now()), (NULL, now());
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110014436_embed_key_daily_usage.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

test('returns one row per day with only this key’s activity', async () => {
    const { rows } = await db.query(`SELECT day::text, requests::int, sessions::int FROM public.embed_key_daily_usage('${key}', 30)`);
    assert.equal(rows.length, 30);
    assert.deepEqual({ requests: rows[29].requests, sessions: rows[29].sessions }, { requests: 2, sessions: 1 });
    assert.equal(rows[27].requests, 1);
    assert.equal(rows.reduce((sum, row) => sum + row.requests, 0), 3);
});

test('keeps the window between 1 and 90 days', async () => {
    const count = async (days) => (await db.query(`SELECT count(*)::int AS n FROM public.embed_key_daily_usage('${key}', ${days})`)).rows[0].n;
    assert.equal(await count(0), 1);
    assert.equal(await count(100000), 90);
});

test('only the server can call it', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(() => db.query(`SELECT * FROM public.embed_key_daily_usage('${key}', 30)`));
        await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.query(`SELECT * FROM public.embed_key_daily_usage('${key}', 30)`);
    await db.exec('RESET ROLE');
});
