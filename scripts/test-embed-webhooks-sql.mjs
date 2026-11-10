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
const key = '00000000-0000-4000-8000-0000000000d1';
const secret = 'whsec_' + 'a'.repeat(64);

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.embed_api_keys (id uuid PRIMARY KEY);
    INSERT INTO public.embed_api_keys VALUES ('${key}');
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110122114_embed_webhooks.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

test('the server can keep one webhook per key', async () => {
    await db.exec('SET ROLE service_role');
    await db.exec(`INSERT INTO public.embed_webhooks (api_key_id, url, secret) VALUES ('${key}', 'https://example.com/hook', '${secret}')`);
    await assert.rejects(db.exec(`INSERT INTO public.embed_webhooks (api_key_id, url, secret) VALUES ('${key}', 'https://example.com/other', '${secret}')`));
    await db.exec('RESET ROLE');
});

test('refuses addresses that are not https and short secrets', async () => {
    await db.exec(`DELETE FROM public.embed_webhooks`);
    await assert.rejects(db.exec(`INSERT INTO public.embed_webhooks (api_key_id, url, secret) VALUES ('${key}', 'http://example.com/hook', '${secret}')`));
    await assert.rejects(db.exec(`INSERT INTO public.embed_webhooks (api_key_id, url, secret) VALUES ('${key}', 'https://example.com/hook', 'short')`));
});

test('browser roles cannot read or write it', async () => {
    await db.exec(`INSERT INTO public.embed_webhooks (api_key_id, url, secret) VALUES ('${key}', 'https://example.com/hook', '${secret}')`);
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query('SELECT secret FROM public.embed_webhooks'), /permission denied/);
        await assert.rejects(db.exec(`UPDATE public.embed_webhooks SET url = 'https://evil.example/hook'`), /permission denied/);
        await db.exec('RESET ROLE');
    }
});

test('the webhook goes when its key is deleted', async () => {
    await db.exec(`DELETE FROM public.embed_api_keys WHERE id = '${key}'`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.embed_webhooks')).rows[0].n, 0);
});
