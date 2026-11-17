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

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.platform_admin_actions (
      id serial PRIMARY KEY,
      action text NOT NULL,
      target_type text NOT NULL CHECK (target_type IN ('school', 'organization', 'user'))
    );
    GRANT SELECT ON public.users TO authenticated;
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261117070844_platform_ai_settings.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

test('holds one row of optional settings', async () => {
    await db.exec(`INSERT INTO public.platform_ai_settings (text_model) VALUES ('gemini-2.5-pro')`);
    await assert.rejects(db.exec(`INSERT INTO public.platform_ai_settings (id) VALUES (false)`), /check/i);
    await assert.rejects(db.exec(`INSERT INTO public.platform_ai_settings (text_model) VALUES ('x')`), /duplicate key/);
    await assert.rejects(db.exec(`UPDATE public.platform_ai_settings SET image_model = repeat('a', 121)`), /check/i);
    const { rows } = await db.query('SELECT text_model, live_model FROM public.platform_ai_settings');
    assert.deepEqual(rows, [{ text_model: 'gemini-2.5-pro', live_model: null }]);
});

test('browsers cannot read or change it', async () => {
    for (const role of ['authenticated', 'anon']) {
        await db.exec(`SET ROLE ${role}`);
        try {
            await assert.rejects(db.query('SELECT * FROM public.platform_ai_settings'), /permission denied/);
            await assert.rejects(db.exec(`UPDATE public.platform_ai_settings SET text_model = 'x'`), /permission denied/);
        } finally {
            await db.exec('RESET ROLE');
        }
    }
});

test('model changes can be logged as platform-wide admin actions', async () => {
    await db.exec(`INSERT INTO public.platform_admin_actions (action, target_type) VALUES ('ai_models.update', 'platform')`);
    await db.exec(`INSERT INTO public.platform_admin_actions (action, target_type) VALUES ('school.suspend', 'school')`);
    await assert.rejects(db.exec(`INSERT INTO public.platform_admin_actions (action, target_type) VALUES ('x', 'planet')`), /check/i);
});
