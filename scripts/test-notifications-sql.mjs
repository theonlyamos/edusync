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
const alice = '00000000-0000-4000-8000-000000000001';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.school_classes (id uuid PRIMARY KEY);
    INSERT INTO public.organizations VALUES ('${school}');
    INSERT INTO public.users VALUES ('${alice}');
    -- Supabase grants new tables to these roles by default.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const sql = await readFile(path.join(root, 'supabase/migrations/20261109204708_notifications.sql'), 'utf8');
await db.exec(sql);

const rejects = (statement, label) => assert.rejects(() => db.exec(statement), undefined, label);

test('the migration can run twice', async () => {
    await db.exec(sql);
});

test('only the server can touch the tables', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await rejects('SELECT 1 FROM public.notifications', `${role} read notifications`);
        await rejects('SELECT 1 FROM public.announcements', `${role} read announcements`);
        await rejects(`INSERT INTO public.notifications (user_id, kind, title) VALUES ('${alice}', 'announcement', 'x')`, `${role} wrote`);
        await db.exec('RESET ROLE');
    }
    const rls = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('notifications', 'announcements') ORDER BY 1`);
    assert.deepEqual(rls.rows.map((row) => row.relrowsecurity), [true, true]);
});

test('links must stay inside the app and kinds must be known', async () => {
    const add = (href, kind = 'announcement') =>
        `INSERT INTO public.notifications (user_id, kind, title, href) VALUES ('${alice}', '${kind}', 'Hello', ${href === null ? 'NULL' : `'${href}'`})`;
    await db.exec(add('/students/homework/1'));
    await db.exec(add(null));
    await rejects(add('https://evil.example'), 'absolute link');
    await rejects(add('//evil.example'), 'protocol-relative link');
    await rejects(add('/ok', 'made_up'), 'unknown kind');
});

test('deleting an announcement or a person removes their notifications', async () => {
    await db.exec(`INSERT INTO public.announcements (id, organization_id, author_id, audience, title, body)
        VALUES ('00000000-0000-4000-8000-0000000000b1', '${school}', '${alice}', 'everyone', 'Sports day', 'Friday')`);
    await db.exec(`INSERT INTO public.notifications (user_id, kind, title, announcement_id)
        VALUES ('${alice}', 'announcement', 'Sports day', '00000000-0000-4000-8000-0000000000b1')`);
    await db.exec(`DELETE FROM public.announcements`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications WHERE announcement_id IS NOT NULL`)).rows[0].n, 0);
    await db.exec(`DELETE FROM public.users`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications`)).rows[0].n, 0);
});
