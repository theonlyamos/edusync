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
const school = '00000000-0000-4000-8000-0000000000a1';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    INSERT INTO public.organizations VALUES ('${school}');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261109213141_school_calendar.sql'), 'utf8');
await db.exec(migration);

const rejects = (statement, label) => assert.rejects(() => db.exec(statement), undefined, label);
const add = (kind, title, from, to) =>
    `INSERT INTO public.school_calendar_entries (organization_id, kind, title, starts_on, ends_on) VALUES ('${school}', '${kind}', '${title}', '${from}', '${to}')`;

test('the migration can run twice', async () => {
    await db.exec(migration);
});

test('only the server can touch the calendar', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await rejects('SELECT 1 FROM public.school_calendar_entries', `${role} read`);
        await rejects(add('term', 'Term 1', '2026-09-07', '2026-12-11'), `${role} write`);
        await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.exec(add('term', 'Term 1', '2026-09-07', '2026-12-11'));
    await db.exec('RESET ROLE');
    const rls = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'school_calendar_entries'`);
    assert.equal(rls.rows[0].relrowsecurity, true);
});

test('entries need a known kind, a name and dates in order', async () => {
    await rejects(add('party', 'Fun', '2026-10-01', '2026-10-01'), 'unknown kind');
    await rejects(add('holiday', '', '2026-10-01', '2026-10-01'), 'empty name');
    await rejects(add('holiday', 'Break', '2026-10-02', '2026-10-01'), 'ends before it starts');
    await db.exec(add('holiday', 'Break', '2026-10-26', '2026-10-30'));
});

test('a school takes its calendar with it', async () => {
    await db.exec(`DELETE FROM public.organizations WHERE id = '${school}'`);
    const left = await db.query('SELECT count(*)::int AS n FROM public.school_calendar_entries');
    assert.equal(left.rows[0].n, 0);
});
