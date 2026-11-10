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
const school = '00000000-0000-4000-8000-0000000000b1';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text, settings jsonb);
    GRANT SELECT ON public.organizations TO authenticated;
    GRANT UPDATE (name, settings) ON public.organizations TO authenticated;
    INSERT INTO public.organizations (id, name) VALUES ('${school}', 'Riverside');
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110200355_school_branding.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

test('existing schools start with empty branding', async () => {
    const { rows } = await db.query(`SELECT branding FROM public.organizations WHERE id = '${school}'`);
    assert.deepEqual(rows[0].branding, {});
});

test('branding must be a small object', async () => {
    await assert.rejects(db.exec(`UPDATE public.organizations SET branding = '[]' WHERE id = '${school}'`), /branding_shape/);
    await assert.rejects(db.exec(`UPDATE public.organizations SET branding = jsonb_build_object('x', repeat('a', 5000)) WHERE id = '${school}'`), /branding_shape/);
    await db.exec(`UPDATE public.organizations SET branding = '{"preset":"navy"}' WHERE id = '${school}'`);
});

test('the browser cannot write branding directly', async () => {
    await db.exec('SET ROLE authenticated');
    try {
        await assert.rejects(db.exec(`UPDATE public.organizations SET branding = '{}' WHERE id = '${school}'`), /permission denied/);
        await db.exec(`UPDATE public.organizations SET name = 'Riverside Academy' WHERE id = '${school}'`);
    } finally {
        await db.exec('RESET ROLE');
    }
});
